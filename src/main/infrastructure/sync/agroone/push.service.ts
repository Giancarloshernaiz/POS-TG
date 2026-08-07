import { eq, and, isNull, or, inArray, type SQL } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import {
  sales,
  saleLines,
  payments,
  products,
  customers,
  sellers,
  syncState
} from '@main/infrastructure/db/schema'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import {
  getSetting,
  setSetting,
  SETTINGS_KEYS
} from '@main/infrastructure/settings/settings.service'
import { logger } from '@main/logger'
import { postSaleFull, createClient, fetchClients } from './agro.client'
import { isUplinkLeader } from './leader.service'

// Push de ventas hacia AgroOne (§31.7). `postSaleFull` crea cabecera+líneas de
// forma atómica en AgroOne; `idempotencyKey` (el saleId local) hace que un
// reintento tras crash o desconexión devuelva la venta ya creada en vez de
// duplicarla — la máquina de estados (sync_state) solo necesita distinguir
// "ya confirmada" (LINES_DONE) de "hay que reintentar" (todo lo demás).

const CONSUMIDOR_FINAL_CEDULA = 'V-00000000'
const CONSUMIDOR_FINAL_NOMBRE = 'Consumidor Final'
const RETRY_SWEEP_LIMIT = 20

type ConsumidorFinal = { agroId: number }

async function ensureConsumidorFinal(baseUrl: string): Promise<number> {
  const cached = await getSetting<ConsumidorFinal>(SETTINGS_KEYS.AGRO_CONSUMIDOR_FINAL)
  if (cached?.agroId) return cached.agroId

  const existing = await fetchClients(baseUrl, CONSUMIDOR_FINAL_CEDULA)
  const found = existing.find((c) => c.cedula === CONSUMIDOR_FINAL_CEDULA)
  if (found) {
    await setSetting<ConsumidorFinal>(SETTINGS_KEYS.AGRO_CONSUMIDOR_FINAL, { agroId: found.agroId })
    return found.agroId
  }

  // "Consumidor Final" es un registro único compartido por TODAS las cajas de
  // la tienda. Si dos cajas lo necesitaran a la vez sin coordinación, cada
  // una crearía su propia copia duplicada en AgroOne. Solo el líder-uplink
  // (§31.10.4) puede crearlo; el resto reintenta más tarde y lo encuentra ya
  // creado vía fetchClients.
  if (!isUplinkLeader()) {
    throw new Error('esperando a que la caja líder cree "Consumidor Final" en AgroOne')
  }
  const agroId = await createClient(baseUrl, {
    nombreContacto: CONSUMIDOR_FINAL_NOMBRE,
    cedula: CONSUMIDOR_FINAL_CEDULA
  })
  await setSetting<ConsumidorFinal>(SETTINGS_KEYS.AGRO_CONSUMIDOR_FINAL, { agroId })
  return agroId
}

function buildCedula(
  docType: string | null,
  docId: string | null,
  localCustomerId: string
): string {
  if (docId) return docType ? `${docType}-${docId}` : docId
  return `LOCAL-${localCustomerId.slice(-10)}`
}

/** Resuelve el agroId del cliente de la venta, creándolo en AgroOne si hace falta. */
async function resolveClientAgroId(baseUrl: string, customerId: string | null): Promise<number> {
  if (!customerId) return ensureConsumidorFinal(baseUrl)

  const db = getDb()
  const cust = await db.select().from(customers).where(eq(customers.id, customerId)).get()
  if (!cust) return ensureConsumidorFinal(baseUrl)
  if (cust.agroId) return cust.agroId

  const cedula = buildCedula(cust.docType, cust.docId, cust.id)
  const agroId = await createClient(baseUrl, {
    nombreContacto: cust.name,
    cedula,
    descuentoEspecialBp: cust.specialDiscountBp
  })
  await db.update(customers).set({ agroId }).where(eq(customers.id, cust.id)).run()
  return agroId
}

async function markState(
  saleId: string,
  fields: Partial<{
    phase: 'NONE' | 'HEADER_DONE' | 'LINES_DONE' | 'ERROR'
    agroSaleId: number | null
    lastError: string | null
  }>
): Promise<void> {
  const db = getDb()
  const now = Date.now()
  const existing = await db.select().from(syncState).where(eq(syncState.saleId, saleId)).get()
  if (existing) {
    await db
      .update(syncState)
      .set({ ...fields, attempts: existing.attempts + 1, updatedAt: now })
      .where(eq(syncState.saleId, saleId))
      .run()
  } else {
    await db
      .insert(syncState)
      .values({ saleId, phase: 'NONE', attempts: 1, updatedAt: now, ...fields })
      .run()
  }
}

/**
 * Sincroniza una venta local con AgroOne, retomando desde donde quedó
 * (idempotente por venta). Nunca lanza — el resultado queda en `sync_state`.
 */
export async function pushSale(saleId: string): Promise<void> {
  const identity = await getIdentity()
  if (!isProvisioned(identity) || identity.storeId === null || !identity.agroBaseUrl) return
  const baseUrl = identity.agroBaseUrl
  const storeId = identity.storeId

  const db = getDb()
  try {
    const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get()
    if (!sale || sale.status !== 'completed') return

    const state = await db.select().from(syncState).where(eq(syncState.saleId, saleId)).get()
    if (state?.phase === 'LINES_DONE') return

    const lineRows = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId)).all()
    const productIds = [...new Set(lineRows.map((l) => l.productId))]
    const productRows =
      productIds.length > 0
        ? await db.select().from(products).where(inArray(products.id, productIds)).all()
        : []
    const agroIdByProduct = new Map(productRows.map((p) => [p.id, p.agroId]))
    const unmapped = lineRows.filter((l) => !agroIdByProduct.get(l.productId))
    if (unmapped.length > 0) {
      await markState(saleId, {
        phase: 'ERROR',
        lastError: `producto sin mapeo AgroOne: ${unmapped.map((l) => l.sku).join(', ')}`
      })
      return
    }

    const clientAgroId = await resolveClientAgroId(baseUrl, sale.customerId)
    const payRows = await db.select().from(payments).where(eq(payments.saleId, saleId)).all()
    const currencies = new Set(payRows.map((p) => p.currency))
    const currency = currencies.size > 1 ? 'MIXTO' : (payRows[0]?.currency ?? 'USD')

    // Comisionista de la venta. Se omite si el vendedor no tiene mapeo con el
    // máster: AgroOne rechazaría un `vendedor_id` que no existe allá.
    let vendedorAgroId: number | undefined
    if (sale.sellerId) {
      const seller = await db.select().from(sellers).where(eq(sellers.id, sale.sellerId)).get()
      vendedorAgroId = seller?.agroId ?? undefined
    }

    const result = await postSaleFull(baseUrl, {
      clientAgroId,
      storeId,
      saleDateIso: new Date(sale.createdAt).toISOString(),
      totalAmountUsd: sale.total / 100,
      currency,
      idempotencyKey: saleId,
      ...(vendedorAgroId !== undefined ? { vendedorAgroId } : {}),
      payments: payRows.map((p) => ({
        metodoPago: p.method,
        monto: p.currency === 'VES' ? (p.amountOriginal ?? p.amountUsd / 100) : p.amountUsd / 100,
        moneda: p.currency
      })),
      lines: lineRows.map((l) => ({
        productAgroId: agroIdByProduct.get(l.productId)!,
        quantity: l.qty,
        priceUsd: l.unitPrice / 100,
        // OJO: AgroOne interpreta este campo con una heurística ambigua por
        // rango (fracción / porcentaje / monto absoluto) que no coincide con
        // lo que mandamos acá (monto absoluto en USD siempre) — bug conocido
        // en el contrato, pendiente de coordinar un campo explícito con
        // AgroOne. No se detecta en la práctica porque hoy no se venden
        // líneas con descuento > 0.
        descuentoUsd: l.discountAmount / 100
      }))
    })

    await markState(saleId, { phase: 'LINES_DONE', agroSaleId: result.agroSaleId })
    logger.info(
      { saleId, agroSaleId: result.agroSaleId, idempotent: result.idempotent },
      'agro: sale pushed'
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn({ err: e, saleId }, 'agro: pushSale failed, will retry')
    await markState(saleId, { phase: 'ERROR', lastError: msg })
  }
}

function pendingSalesWhere(): SQL | undefined {
  return and(
    eq(sales.status, 'completed'),
    or(isNull(syncState.phase), inArray(syncState.phase, ['NONE', 'HEADER_DONE', 'ERROR']))
  )
}

/** Barrido de reintento: ventas completadas sin terminar de sincronizar. */
export async function pushPendingSales(): Promise<number> {
  const db = getDb()
  const rows = await db
    .select({ id: sales.id })
    .from(sales)
    .leftJoin(syncState, eq(syncState.saleId, sales.id))
    .where(pendingSalesWhere())
    .limit(RETRY_SWEEP_LIMIT)
    .all()
  for (const r of rows) {
    await pushSale(r.id)
  }
  return rows.length
}

export type PushStatus = {
  pending: number
  errors: Array<{ saleId: string; saleNumber: string; lastError: string | null }>
}

/** Estado de sync de ventas para la UI: cuántas faltan y las últimas fallidas. */
export async function getPushStatus(): Promise<PushStatus> {
  const db = getDb()
  const pendingRows = await db
    .select({ id: sales.id })
    .from(sales)
    .leftJoin(syncState, eq(syncState.saleId, sales.id))
    .where(pendingSalesWhere())
    .all()
  const errorRows = await db
    .select({ saleId: syncState.saleId, saleNumber: sales.number, lastError: syncState.lastError })
    .from(syncState)
    .innerJoin(sales, eq(sales.id, syncState.saleId))
    .where(eq(syncState.phase, 'ERROR'))
    .limit(10)
    .all()
  return { pending: pendingRows.length, errors: errorRows }
}
