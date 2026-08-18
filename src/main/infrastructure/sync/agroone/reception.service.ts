import { eq, and, sql } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { products, stockLevels } from '@main/infrastructure/db/schema/catalog'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import { logger } from '@main/logger'
import {
  fetchDispatchesForStore,
  fetchDispatch,
  receiveDispatchScan,
  AgroError,
  type AgroDispatch,
  type AgroDispatchLine
} from './agro.client'

// Recepción en la tienda de los despachos del Centro de Acopio.
//
// Reparto de responsabilidades: el despacho, sus líneas y `ExistenciaTienda`
// viven en Galas Cloud. La caja es una interfaz de captura — escanea, el máster
// valida y acumula, y acá solo se refleja el resultado en la proyección local
// (`stock_levels`) para que el inventario de pantalla no quede desfasado hasta
// el próximo pull.
//
// Requiere red por diseño: sin el máster no se puede saber qué se despachó ni
// cuánto falta, y aceptar recepciones a ciegas descuadraría el inventario.

export class ReceptionError extends Error {
  constructor(
    public code: 'NOT_PROVISIONED' | 'AGRO_UNREACHABLE' | 'UNKNOWN_PRODUCT' | 'OVER_RECEIPT',
    message: string
  ) {
    super(message)
  }
}

export type DispatchLineDTO = AgroDispatchLine & {
  /** Producto local mapeado, si el catálogo ya se sincronizó. */
  productIdLocal: string | null
}

export type DispatchDTO = Omit<AgroDispatch, 'lineas'> & {
  lineas: DispatchLineDTO[]
  totalDespachado: number
  totalRecibido: number
  pendiente: number
}

// Incremento atómico en SQL: evita leer-sumar-escribir, que perdería lecturas
// si dos escaneos entran casi a la vez.
function sqlIncrement(by: number) {
  return sql`${stockLevels.quantity} + ${by}`
}

async function requireStoreContext(): Promise<{ baseUrl: string; storeId: number }> {
  const identity = await getIdentity()
  if (!isProvisioned(identity) || identity.storeId === null || !identity.agroBaseUrl) {
    throw new ReceptionError(
      'NOT_PROVISIONED',
      'Esta caja no está vinculada a Galas Cloud. Configúrala en Ajustes para poder recibir despachos.'
    )
  }
  return { baseUrl: identity.agroBaseUrl, storeId: identity.storeId }
}

/** Resuelve el producto local de cada línea por `agroId`. */
async function decorate(dispatch: AgroDispatch): Promise<DispatchDTO> {
  const db = getDb()
  const lineas: DispatchLineDTO[] = []
  for (const l of dispatch.lineas) {
    const local = await db.select().from(products).where(eq(products.agroId, l.productoAgroId)).get()
    lineas.push({ ...l, productIdLocal: local?.id ?? null })
  }
  const totalDespachado = lineas.reduce((s, l) => s + l.cantidad, 0)
  const totalRecibido = lineas.reduce((s, l) => s + l.cantidadRecibida, 0)
  return {
    ...dispatch,
    lineas,
    totalDespachado,
    totalRecibido,
    pendiente: totalDespachado - totalRecibido
  }
}

/** Despachos dirigidos a esta tienda, pendientes primero. */
export async function listDispatches(): Promise<DispatchDTO[]> {
  const { baseUrl, storeId } = await requireStoreContext()
  const raw = await fetchDispatchesForStore(baseUrl, storeId)
  const decorated = await Promise.all(raw.map(decorate))
  // Lo que falta recibir arriba; dentro de cada grupo, lo más reciente primero.
  return decorated.sort((a, b) => {
    if (a.pendiente > 0 !== b.pendiente > 0) return a.pendiente > 0 ? -1 : 1
    return (b.fecha ?? 0) - (a.fecha ?? 0)
  })
}

export async function getDispatch(agroDispatchId: number): Promise<DispatchDTO> {
  const { baseUrl } = await requireStoreContext()
  return decorate(await fetchDispatch(baseUrl, agroDispatchId))
}

export type ScanReceptionResult = {
  productoAgroId: number
  nombre: string
  recibido: number
  despachado: number
  pendiente: number
  estadoLinea: string
  estadoDespacho: string
  /** Existencia local del producto después de aplicar la lectura. */
  stockLocal: number | null
}

/**
 * Una lectura del escáner sobre un despacho. El máster valida (que el código
 * pertenezca al despacho, que no exceda lo despachado) y acumula; acá se
 * refleja el incremento en `stock_levels`.
 */
export async function scanReception(
  agroDispatchId: number,
  codigo: string,
  cantidad = 1
): Promise<ScanReceptionResult> {
  const { baseUrl } = await requireStoreContext()

  let res: Awaited<ReturnType<typeof receiveDispatchScan>>
  try {
    res = await receiveDispatchScan(baseUrl, agroDispatchId, codigo, cantidad)
  } catch (e) {
    // Un rechazo del máster ya trae el mensaje redactado para el operador
    // ("X no viene en este despacho", "ya recibiste N de M"): se propaga tal
    // cual. Un fallo de red es otra cosa y merece otro código.
    if (e instanceof AgroError) {
      throw new ReceptionError('AGRO_UNREACHABLE', e.message)
    }
    const msg = e instanceof Error ? e.message : String(e)
    const codigoError = msg.includes('no reconocido') ? 'UNKNOWN_PRODUCT' : 'OVER_RECEIPT'
    throw new ReceptionError(codigoError, msg)
  }

  // Proyección local. Si el catálogo todavía no bajó este producto, no se
  // inventa la fila: el próximo pull la traerá con la cantidad correcta.
  const db = getDb()
  const local = await db.select().from(products).where(eq(products.agroId, res.productoAgroId)).get()
  let stockLocal: number | null = null
  if (local) {
    const now = Date.now()
    await db
      .insert(stockLevels)
      .values({ productId: local.id, locationId: 'main', quantity: cantidad, updatedAt: now })
      .onConflictDoUpdate({
        target: [stockLevels.productId, stockLevels.locationId],
        set: { quantity: sqlIncrement(cantidad), updatedAt: now }
      })
      .run()
    const row = await db
      .select()
      .from(stockLevels)
      .where(and(eq(stockLevels.productId, local.id), eq(stockLevels.locationId, 'main')))
      .get()
    stockLocal = row?.quantity ?? null
  } else {
    logger.warn(
      { productoAgroId: res.productoAgroId },
      'reception: producto recibido que aún no está en el catálogo local'
    )
  }

  return { ...res, stockLocal }
}
