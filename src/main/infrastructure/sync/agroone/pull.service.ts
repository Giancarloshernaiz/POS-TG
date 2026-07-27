import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '@main/infrastructure/db/client'
import { categories, products, stockLevels } from '@main/infrastructure/db/schema/catalog'
import { customers } from '@main/infrastructure/db/schema/customers'
import {
  getSetting,
  setSetting,
  SETTINGS_KEYS
} from '@main/infrastructure/settings/settings.service'
import { logger } from '@main/logger'
import {
  fetchCategories,
  fetchProductsSummary,
  fetchClients,
  fetchTasa,
  type AgroCategory
} from './agro.client'

// Pull desde AgroOne → proyecciones locales (plan §31.5, §31.8). El máster es
// autoritativo del catálogo y la asignación de stock; upsert idempotente por
// agroId (clave natural de respaldo: sku / cédula / nombre).

export type PullSummary = {
  categories: number
  products: number
  stock: number
  customers: number
  rateUpdated: boolean
  at: number
}

type DocType = 'V' | 'E' | 'J' | 'P' | 'G'

function parseCedula(raw: string): { docType: DocType | null; docId: string } {
  const m = raw.trim().match(/^([VEJPGvejpg])[-\s]?(.+)$/)
  if (m) return { docType: m[1]!.toUpperCase() as DocType, docId: m[2]!.trim() }
  return { docType: null, docId: raw.trim() }
}

export async function pullAll(baseUrl: string, storeId: number, ts: number): Promise<PullSummary> {
  // 1) Fetch todo primero (async), luego escribir en una transacción sync.
  const [agroCats, agroProds, agroClients, tasa] = await Promise.all([
    fetchCategories(baseUrl),
    fetchProductsSummary(baseUrl),
    fetchClients(baseUrl),
    fetchTasa(baseUrl)
  ])

  const db = getDb()
  const summary = db.transaction((tx): Omit<PullSummary, 'at' | 'rateUpdated'> => {
    // ---- Categorías (pass 1: upsert por agroId/nombre) ----
    const catMap = new Map<number, string>() // agroId -> local ULID
    for (const c of agroCats) {
      const local =
        tx.select().from(categories).where(eq(categories.agroId, c.agroId)).get() ??
        tx.select().from(categories).where(eq(categories.name, c.nombre)).get()
      if (local) {
        tx.update(categories)
          .set({ name: c.nombre, icon: c.simbolo, agroId: c.agroId, updatedAt: ts })
          .where(eq(categories.id, local.id))
          .run()
        catMap.set(c.agroId, local.id)
      } else {
        const id = ulid()
        tx.insert(categories)
          .values({
            id,
            name: c.nombre,
            icon: c.simbolo,
            agroId: c.agroId,
            createdAt: ts,
            updatedAt: ts
          })
          .run()
        catMap.set(c.agroId, id)
      }
    }
    // Pass 2: resolver padres.
    for (const c of agroCats as AgroCategory[]) {
      if (c.parentAgroId === null) continue
      const localId = catMap.get(c.agroId)
      const parentLocalId = catMap.get(c.parentAgroId)
      if (localId && parentLocalId) {
        tx.update(categories)
          .set({ parentId: parentLocalId, updatedAt: ts })
          .where(eq(categories.id, localId))
          .run()
      }
    }

    // ---- Productos + existencias ----
    let stockCount = 0
    for (const p of agroProds) {
      const local =
        tx.select().from(products).where(eq(products.agroId, p.agroId)).get() ??
        tx.select().from(products).where(eq(products.sku, p.codigo)).get()
      const categoryId = p.categoriaAgroId !== null ? (catMap.get(p.categoriaAgroId) ?? null) : null
      const common = {
        sku: p.codigo,
        barcode: p.codigoBarras,
        name: p.nombre,
        description: p.descripcion,
        categoryId,
        basePrice: p.precioVentaCents,
        costPrice: p.costoPromedioCents,
        lowStockThreshold: p.stockMinimo,
        agroId: p.agroId,
        active: true,
        updatedAt: ts
      }
      let productId: string
      if (local) {
        productId = local.id
        // unidadMedida no viene en el endpoint de resumen hoy; si algún día lo
        // trae, se respeta — mientras tanto no pisamos lo que ya haya local.
        tx.update(products)
          .set(p.unidadMedida ? { ...common, unitOfMeasure: p.unidadMedida } : common)
          .where(eq(products.id, local.id))
          .run()
      } else {
        productId = ulid()
        tx.insert(products)
          .values({
            id: productId,
            ...common,
            unitOfMeasure: p.unidadMedida ?? 'UNIDAD',
            taxRateBp: 0,
            createdAt: ts
          })
          .run()
      }

      // Existencia de ESTA tienda → stock_levels. La instalación local es
      // siempre single-store (Fase 1), así que la única location es 'main';
      // storeId solo filtra CUÁL existencia de AgroOne (multi-tienda) aplica.
      const mine = p.existencias.find((e) => e.tiendaId === storeId)
      if (mine) {
        tx.insert(stockLevels)
          .values({
            productId,
            locationId: 'main',
            quantity: mine.cantidad,
            updatedAt: ts
          })
          .onConflictDoUpdate({
            target: [stockLevels.productId, stockLevels.locationId],
            set: { quantity: mine.cantidad, updatedAt: ts }
          })
          .run()
        stockCount++
      }
    }

    // ---- Clientes ----
    for (const c of agroClients) {
      const { docType, docId } = parseCedula(c.cedula)
      const local =
        tx.select().from(customers).where(eq(customers.agroId, c.agroId)).get() ??
        (docId ? tx.select().from(customers).where(eq(customers.docId, docId)).get() : undefined)
      const common = {
        name: c.nombreContacto,
        docType,
        docId,
        phone: c.telefono,
        email: c.correo,
        address: c.direccion,
        specialDiscountBp: c.descuentoEspecialBp,
        agroId: c.agroId,
        active: true,
        updatedAt: ts
      }
      if (local) {
        tx.update(customers).set(common).where(eq(customers.id, local.id)).run()
      } else {
        tx.insert(customers)
          .values({ id: ulid(), ...common, createdAt: ts })
          .run()
      }
    }

    return {
      categories: agroCats.length,
      products: agroProds.length,
      stock: stockCount,
      customers: agroClients.length
    }
  })

  // ---- Tasa BCV (fuera de la tx del catálogo) ----
  let rateUpdated = false
  if (tasa) {
    await setSetting(SETTINGS_KEYS.FX_BCV, {
      rate: tasa.rate,
      source: 'bcv',
      fetchedAt: ts,
      publishedAt: tasa.fecha
    })
    rateUpdated = true
  }

  const result: PullSummary = { ...summary, rateUpdated, at: ts }
  await setSetting(SETTINGS_KEYS.AGRO_LAST_PULL, result)
  logger.info(result, 'agro: pull complete')
  return result
}

export async function getLastPull(): Promise<PullSummary | null> {
  return getSetting<PullSummary>(SETTINGS_KEYS.AGRO_LAST_PULL)
}

// Coalescing: si ya hay un pull en curso (boot, cron o manual), reusa la misma
// promesa en vez de lanzar otro concurrente.
let inFlight: Promise<PullSummary> | null = null

export function runPull(baseUrl: string, storeId: number): Promise<PullSummary> {
  if (inFlight) return inFlight
  inFlight = pullAll(baseUrl, storeId, Date.now()).finally(() => {
    inFlight = null
  })
  return inFlight
}
