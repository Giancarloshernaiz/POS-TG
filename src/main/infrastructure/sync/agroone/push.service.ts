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
import { postSaleFull, createClient, updateClient, fetchClients } from './agro.client'
import { isUplinkLeader } from './leader.service'

// Push de ventas hacia Galas Cloud (§31.7). `postSaleFull` crea cabecera+líneas de
// forma atómica en Galas Cloud; `idempotencyKey` (el saleId local) hace que un
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
  // una crearía su propia copia duplicada en Galas Cloud. Solo el líder-uplink
  // (§31.10.4) puede crearlo; el resto reintenta más tarde y lo encuentra ya
  // creado vía fetchClients.
  if (!isUplinkLeader()) {
    throw new Error('esperando a que la caja líder cree "Consumidor Final" en Galas Cloud')
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

type CustomerRow = typeof customers.$inferSelect

function customerPayload(customer: CustomerRow): {
  nombreContacto: string
  cedula: string
  telefono: string | null
  correo: string | null
  direccion: string | null
  descuentoEspecialBp: number
} {
  return {
    nombreContacto: customer.name,
    cedula: buildCedula(customer.docType, customer.docId, customer.id),
    telefono: customer.phone,
    correo: customer.email,
    direccion: customer.address,
    descuentoEspecialBp: customer.specialDiscountBp
  }
}

async function syncCustomerRow(baseUrl: string, customer: CustomerRow): Promise<number> {
  const db = getDb()
  const payload = customerPayload(customer)
  let agroId = customer.agroId

  if (agroId === null) {
    // Una venta pudo haber creado el mismo cliente en un intento anterior que
    // terminó antes de guardar el mapeo local. Buscar primero evita duplicados.
    const matches = await fetchClients(baseUrl, payload.cedula)
    agroId =
      matches.find((candidate) => candidate.cedula.toLowerCase() === payload.cedula.toLowerCase())
        ?.agroId ?? null
    if (agroId === null) {
      agroId = await createClient(baseUrl, payload)
    } else {
      await updateClient(baseUrl, agroId, payload)
    }
    await db.update(customers).set({ agroId }).where(eq(customers.id, customer.id)).run()
  } else {
    await updateClient(baseUrl, agroId, payload)
  }

  // No se limpia una edición más nueva que haya ocurrido mientras la petición
  // estaba en vuelo: esa versión debe permanecer pendiente para el siguiente ciclo.
  await db
    .update(customers)
    .set({ syncPending: false })
    .where(and(eq(customers.id, customer.id), eq(customers.updatedAt, customer.updatedAt)))
    .run()
  return agroId
}

async function pushCustomerOnce(customerId: string): Promise<boolean> {
  try {
    const identity = await getIdentity()
    if (!isProvisioned(identity) || !identity.agroBaseUrl) return false
    const db = getDb()
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get()
    if (!customer || !customer.syncPending) return false
    await syncCustomerRow(identity.agroBaseUrl, customer)
    logger.info({ customerId, agroId: customer.agroId }, 'agro: customer pushed')
    return true
  } catch (error) {
    logger.warn({ err: error, customerId }, 'agro: customer push failed, will retry')
    return false
  }
}

const customerPushes = new Map<string, Promise<boolean>>()

/** Intenta confirmar un cliente local en Galas Cloud sin perder el modo offline. */
export function pushCustomer(customerId: string): Promise<boolean> {
  const current = customerPushes.get(customerId)
  if (current) return current
  const task = pushCustomerOnce(customerId).finally(() => customerPushes.delete(customerId))
  customerPushes.set(customerId, task)
  return task
}

/** Reintenta todas las altas/ediciones de clientes aún no confirmadas. */
export async function pushPendingCustomers(): Promise<number> {
  const identity = await getIdentity()
  if (!isProvisioned(identity) || !identity.agroBaseUrl) return 0
  const db = getDb()
  const pending = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.syncPending, true))
    .limit(RETRY_SWEEP_LIMIT)
    .all()
  let pushed = 0
  for (const customer of pending) {
    if (await pushCustomer(customer.id)) pushed++
  }
  return pushed
}

/** Resuelve el agroId del cliente de la venta, creándolo en Galas Cloud si hace falta. */
async function resolveClientAgroId(baseUrl: string, customerId: string | null): Promise<number> {
  if (!customerId) return ensureConsumidorFinal(baseUrl)

  const db = getDb()
  const cust = await db.select().from(customers).where(eq(customers.id, customerId)).get()
  if (!cust) return ensureConsumidorFinal(baseUrl)
  if (cust.agroId) return cust.agroId
  return syncCustomerRow(baseUrl, cust)
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
 * Sincroniza una venta local con Galas Cloud, retomando desde donde quedó
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
        lastError: `producto sin mapeo Galas Cloud: ${unmapped.map((l) => l.sku).join(', ')}`
      })
      return
    }

    const clientAgroId = await resolveClientAgroId(baseUrl, sale.customerId)
    const payRows = await db.select().from(payments).where(eq(payments.saleId, saleId)).all()
    const currencies = new Set(payRows.map((p) => p.currency))
    const currency = currencies.size > 1 ? 'MIXTO' : (payRows[0]?.currency ?? 'USD')

    // Comisionista de la venta. Se omite si el vendedor no tiene mapeo con el
    // máster: Galas Cloud rechazaría un `vendedor_id` que no existe allá.
    let vendedorAgroId: number | undefined
    if (sale.sellerId) {
      const seller = await db.select().from(sellers).where(eq(sellers.id, sale.sellerId)).get()
      vendedorAgroId = seller?.agroId ?? undefined
    }

    const result = await postSaleFull(baseUrl, {
      clientAgroId,
      storeId,
      saleDateIso: new Date(sale.createdAt).toISOString(),
      // El mÃ¡ster aplica nuevamente los beneficios sobre el total comercial.
      // Por eso se envÃ­a el total previo a crédito/fidelización y el crédito
      // solicitado por separado; los pagos siguen siendo lo realmente cobrado.
      totalAmountUsd: (sale.total + sale.creditApplied + sale.fidelityApplied) / 100,
      subtotalOriginalUsd: sale.subtotal / 100,
      usarSaldoFavor: sale.creditApplied > 0,
      saldoFavorMonto: sale.creditApplied / 100,
      ...(sale.usdDiscountTotal > 0
        ? { descripcion: `[DESCUENTO_GLOBAL:${(sale.usdDiscountTotal / 100).toFixed(2)}]` }
        : {}),
      currency,
      idempotencyKey: saleId,
      ...(vendedorAgroId !== undefined ? { vendedorAgroId } : {}),
      payments: payRows.map((p) => {
        const montoOriginalVes =
          p.currency === 'VES'
            ? (p.amountOriginal ??
              (sale.rateUsed ? Math.round((p.amountUsd / 100) * sale.rateUsed * 100) / 100 : null))
            : null
        if (p.currency === 'VES' && montoOriginalVes === null) {
          throw new Error(`pago VES sin monto original ni tasa: ${p.id}`)
        }
        return {
          metodoPago: p.method,
          monto: p.currency === 'VES' ? montoOriginalVes! : p.amountUsd / 100,
          moneda: p.currency
        }
      }),
      lines: lineRows.map((l) => ({
        productAgroId: agroIdByProduct.get(l.productId)!,
        quantity: l.qty,
        priceUsd: l.unitPrice / 100,
        // OJO: Galas Cloud interpreta este campo con una heurística ambigua por
        // rango (fracción / porcentaje / monto absoluto) que no coincide con
        // lo que mandamos acá (monto absoluto en USD siempre) — bug conocido
        // en el contrato, pendiente de coordinar un campo explícito con
        // Galas Cloud. No se detecta en la práctica porque hoy no se venden
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
