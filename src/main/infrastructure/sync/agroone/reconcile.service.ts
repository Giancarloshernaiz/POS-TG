import { eq, isNull, inArray, or, and, type SQL } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { products } from '@main/infrastructure/db/schema/catalog'
import { sales, saleLines } from '@main/infrastructure/db/schema/sales'
import { syncState } from '@main/infrastructure/db/schema/sync'
import { logger } from '@main/logger'
import { findProductInAgroByCode } from './agro.client'
import { pushPendingSales } from './push.service'

// Reconciliación de catálogo huérfano.
//
// Antes de que AgroOne fuera el único dueño del catálogo, la caja podía crear
// productos locales sin `agroId`. Toda venta que los incluyera quedaba trabada
// en `sync_state.phase = ERROR` con "producto sin mapeo AgroOne", de forma
// permanente: ningún reintento la arreglaba porque el producto no existía del
// otro lado.
//
// Esto detecta esos productos y los mapea contra el máster buscando por SKU y
// por código de barras. Lo que no exista allá se reporta para darlo de alta a
// mano — no se inventa nada.

export type OrphanProduct = {
  id: string
  sku: string
  barcode: string | null
  name: string
  /** Ventas completadas que incluyen este producto y no pueden sincronizar. */
  ventasBloqueadas: number
}

export type CatalogHealth = {
  productosSinMapeo: number
  ventasBloqueadas: number
  orphans: OrphanProduct[]
}

export type ReconcileResult = {
  revisados: number
  mapeados: Array<{ id: string; sku: string; name: string; agroId: number }>
  /** Huérfanos que resultaron ser duplicados de una fila ya sincronizada. */
  fusionados: Array<{ id: string; sku: string; name: string; haciaSku: string; agroId: number }>
  sinCorrespondencia: OrphanProduct[]
  ventasReintentadas: number
}

/** Ventas completadas que aún no terminaron de sincronizar. */
function pendingSalesWhere(): SQL | undefined {
  return and(
    eq(sales.status, 'completed'),
    or(isNull(syncState.phase), inArray(syncState.phase, ['NONE', 'HEADER_DONE', 'ERROR']))
  )
}

async function findOrphans(): Promise<OrphanProduct[]> {
  const db = getDb()
  // Solo los activos: un duplicado ya fusionado queda desactivado y sin agroId,
  // pero está resuelto y no debe seguir apareciendo como pendiente.
  const rows = await db
    .select()
    .from(products)
    .where(and(isNull(products.agroId), eq(products.active, true)))
    .all()
  if (rows.length === 0) return []

  // Cuántas ventas pendientes toca cada producto huérfano.
  const pendientes = await db
    .select({ saleId: sales.id })
    .from(sales)
    .leftJoin(syncState, eq(syncState.saleId, sales.id))
    .where(pendingSalesWhere())
    .all()
  const pendingIds = new Set(pendientes.map((p) => p.saleId))

  const result: OrphanProduct[] = []
  for (const p of rows) {
    const lineas = await db.select().from(saleLines).where(eq(saleLines.productId, p.id)).all()
    const ventas = new Set(lineas.map((l) => l.saleId).filter((id) => pendingIds.has(id)))
    result.push({
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      ventasBloqueadas: ventas.size
    })
  }
  return result
}

/** Diagnóstico sin efectos: qué hay roto y cuánto. */
export async function getCatalogHealth(): Promise<CatalogHealth> {
  const orphans = await findOrphans()
  return {
    productosSinMapeo: orphans.length,
    ventasBloqueadas: orphans.reduce((sum, o) => sum + o.ventasBloqueadas, 0),
    orphans
  }
}

/**
 * Intenta mapear cada producto local sin `agroId` contra el máster, buscando
 * primero por código de barras y luego por SKU. Al terminar, dispara el barrido
 * de push: las ventas que estaban trabadas solo por el mapeo se resuelven solas.
 */
export async function reconcileCatalog(baseUrl: string): Promise<ReconcileResult> {
  const db = getDb()
  const orphans = await findOrphans()
  const mapeados: ReconcileResult['mapeados'] = []
  const fusionados: ReconcileResult['fusionados'] = []
  const sinCorrespondencia: OrphanProduct[] = []

  for (const orphan of orphans) {
    const candidatos = [orphan.barcode, orphan.sku].filter((c): c is string => !!c && !!c.trim())
    let encontrado: Awaited<ReturnType<typeof findProductInAgroByCode>> = null

    for (const codigo of candidatos) {
      encontrado = await findProductInAgroByCode(baseUrl, codigo)
      if (encontrado) break
    }

    if (!encontrado) {
      sinCorrespondencia.push(orphan)
      continue
    }

    // Colisión: el pull ya trajo ese producto como fila propia, así que el
    // huérfano es un DUPLICADO local del mismo producto del máster. No se
    // pueden tener dos filas con el mismo `agroId` (rompería el mapeo del
    // push), pero tampoco sirve dejarlo huérfano: las ventas que lo usan
    // seguirían trabadas para siempre.
    //
    // Se resuelve reapuntando las líneas de venta a la fila canónica y
    // desactivando el duplicado. No se borra la fila (hay FKs y sirve de
    // rastro) ni se toca el stock: `stock_levels` lo reescribe el pull desde
    // las existencias del máster en cada sincronización.
    const yaMapeado = await db
      .select()
      .from(products)
      .where(eq(products.agroId, encontrado.agroId))
      .get()
    if (yaMapeado && yaMapeado.id !== orphan.id) {
      await db
        .update(saleLines)
        .set({ productId: yaMapeado.id })
        .where(eq(saleLines.productId, orphan.id))
        .run()
      await db
        .update(products)
        .set({ active: false, updatedAt: Date.now() })
        .where(eq(products.id, orphan.id))
        .run()
      fusionados.push({
        id: orphan.id,
        sku: orphan.sku,
        name: orphan.name,
        haciaSku: yaMapeado.sku,
        agroId: encontrado.agroId
      })
      logger.info(
        { orphanId: orphan.id, agroId: encontrado.agroId, canonico: yaMapeado.id },
        'reconcile: duplicado local fusionado con la fila ya sincronizada'
      )
      continue
    }

    await db
      .update(products)
      .set({ agroId: encontrado.agroId, updatedAt: Date.now() })
      .where(eq(products.id, orphan.id))
      .run()
    mapeados.push({ id: orphan.id, sku: orphan.sku, name: orphan.name, agroId: encontrado.agroId })
  }

  // Con el mapeo resuelto, las ventas trabadas ya pueden sincronizar.
  const huboCambios = mapeados.length > 0 || fusionados.length > 0
  const ventasReintentadas = huboCambios ? await pushPendingSales() : 0

  const result: ReconcileResult = {
    revisados: orphans.length,
    mapeados,
    fusionados,
    sinCorrespondencia,
    ventasReintentadas
  }
  logger.info(
    {
      revisados: result.revisados,
      mapeados: result.mapeados.length,
      fusionados: result.fusionados.length,
      sinCorrespondencia: result.sinCorrespondencia.length,
      ventasReintentadas
    },
    'reconcile: catálogo reconciliado'
  )
  return result
}
