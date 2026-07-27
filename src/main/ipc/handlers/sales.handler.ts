import { and, eq, desc, inArray, sql, type SQL } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { z } from 'zod'
import { getDb, getRawDb } from '@main/infrastructure/db/client'
import {
  sales,
  saleLines,
  payments,
  products,
  categories,
  serials,
  stockLevels,
  customers
} from '@main/infrastructure/db/schema'
import { requirePermission } from '@main/auth/guard'
import { getActiveSession } from '@main/domain/cash/cash.service'
import { getCurrentRate } from '@main/infrastructure/fx/fx.service'
import { getIgtfConfig } from '@main/infrastructure/settings/settings.service'
import { nextSaleNumber } from '@main/domain/purchasing/numbering'
import { resolveDiscount, effectivePriceCents, type Discount } from '@shared/pricing'
import { PERMISSIONS } from '@shared/auth/permissions'
import { audit } from '@main/audit/logger'
import { pushSale } from '@main/infrastructure/sync/agroone/push.service'
import { emitLocalEvent } from '@main/infrastructure/sync/p2p/p2p.service'
import { getIdentity } from '@main/infrastructure/device/identity.service'
import { salesContract } from '@shared/ipc/contracts/sales'
import type { SaleDTO } from '@shared/ipc/contracts/sales'
import { PAYMENT_DIVISA, PAYMENT_CURRENCY } from '@shared/payment'

type Input<K extends keyof typeof salesContract> = z.infer<(typeof salesContract)[K]['input']>

class SaleError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

type ComputedLine = {
  id: string
  productId: string
  serialId: string | null
  sku: string
  description: string
  qty: number
  unitPrice: number
  discountAmount: number
  taxRateBp: number
  lineSubtotal: number
  lineTax: number
  lineTotal: number
}

export async function buildSaleDto(saleId: string): Promise<SaleDTO> {
  const db = getDb()
  const row = await db
    .select({ s: sales, customerName: customers.name })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.id, saleId))
    .get()
  if (!row) throw new SaleError('NOT_FOUND', 'venta no existe')

  const lineRows = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId)).all()
  const payRows = await db.select().from(payments).where(eq(payments.saleId, saleId)).all()

  return {
    id: row.s.id,
    number: row.s.number,
    customerId: row.s.customerId,
    customerName: row.customerName ?? null,
    userId: row.s.userId,
    cashSessionId: row.s.cashSessionId,
    status: row.s.status,
    subtotal: row.s.subtotal,
    discountTotal: row.s.discountTotal,
    taxTotal: row.s.taxTotal,
    igtfTotal: row.s.igtfTotal,
    total: row.s.total,
    rateUsed: row.s.rateUsed,
    notes: row.s.notes,
    createdAt: row.s.createdAt,
    lines: lineRows.map((l) => ({
      id: l.id,
      productId: l.productId,
      serialId: l.serialId,
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
      taxRateBp: l.taxRateBp,
      lineSubtotal: l.lineSubtotal,
      lineTax: l.lineTax,
      lineTotal: l.lineTotal
    })),
    payments: payRows.map((p) => ({
      id: p.id,
      method: p.method,
      currency: p.currency,
      isDivisa: p.isDivisa,
      amountUsd: p.amountUsd,
      amountOriginal: p.amountOriginal,
      igtf: p.igtf,
      reference: p.reference
    }))
  }
}

export const salesHandlers = {
  async create(input: Input<'create'>): Promise<{ sale: SaleDTO; changeUsd: number }> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SALES_CREATE)
    const db = getDb()

    const cashSession = await getActiveSession(db, session.userId)
    if (!cashSession) throw new SaleError('NO_CASH_SESSION', 'abre la caja antes de vender')

    // ---- Compute lines (server is source of truth) ----
    const computed: ComputedLine[] = []
    let subtotal = 0
    let discountTotal = 0
    let taxTotal = 0
    const serialsToSell: Array<{ id: string; imei: string }> = []
    const stockDecrements = new Map<string, number>()

    for (const line of input.lines) {
      const prod = await db
        .select({
          p: products,
          catDiscType: categories.discountType,
          catDiscVal: categories.discountValue
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(products.id, line.productId))
        .get()
      if (!prod) throw new SaleError('PRODUCT_NOT_FOUND', `producto ${line.productId} no existe`)

      const productDiscount: Discount = { type: prod.p.discountType, value: prod.p.discountValue }
      const categoryDiscount: Discount | null =
        prod.catDiscType != null ? { type: prod.catDiscType, value: prod.catDiscVal ?? 0 } : null
      const { discount } = resolveDiscount(productDiscount, categoryDiscount)
      const effPrice = effectivePriceCents(prod.p.basePrice, discount)

      let serialId: string | null = null
      if (prod.p.tracksSerial) {
        if (!line.serialId) throw new SaleError('SERIAL_REQUIRED', `${prod.p.name} requiere serial`)
        if (line.qty !== 1)
          throw new SaleError('SERIAL_REQUIRED', 'productos con serial: 1 por línea')
        const serial = await db.select().from(serials).where(eq(serials.id, line.serialId)).get()
        if (!serial || serial.status !== 'available') {
          throw new SaleError('SERIAL_NOT_AVAILABLE', 'serial no disponible')
        }
        serialId = serial.id
        serialsToSell.push({ id: serial.id, imei: serial.imei })
      }

      // stock check (aggregate across lines of same product)
      const already = stockDecrements.get(line.productId) ?? 0
      const stockRow = await db
        .select({ q: stockLevels.quantity })
        .from(stockLevels)
        .where(and(eq(stockLevels.productId, line.productId), eq(stockLevels.locationId, 'main')))
        .get()
      const available = stockRow?.q ?? 0
      if (available - already < line.qty) {
        throw new SaleError('INSUFFICIENT_STOCK', `stock insuficiente: ${prod.p.name}`)
      }
      stockDecrements.set(line.productId, already + line.qty)

      const lineSubtotal = effPrice * line.qty
      const discountAmount = (prod.p.basePrice - effPrice) * line.qty
      const lineTax = Math.round((lineSubtotal * prod.p.taxRateBp) / 10_000)
      computed.push({
        id: ulid(),
        productId: prod.p.id,
        serialId,
        sku: prod.p.sku,
        description: prod.p.name,
        qty: line.qty,
        unitPrice: prod.p.basePrice,
        discountAmount,
        taxRateBp: prod.p.taxRateBp,
        lineSubtotal,
        lineTax,
        lineTotal: lineSubtotal + lineTax
      })
      subtotal += lineSubtotal
      discountTotal += discountAmount
      taxTotal += lineTax
    }

    const goodsTotal = subtotal + taxTotal

    // ---- Payments + IGTF ----
    // IGTF only applies to divisa (USD cash / Zelle) payments, and only when enabled in settings.
    const igtfCfg = await getIgtfConfig()
    let igtfTotal = 0
    let totalPaid = 0
    let creditAmount = 0
    const computedPayments = input.payments.map((p) => {
      const isDivisa = PAYMENT_DIVISA[p.method] ?? false
      const currency = PAYMENT_CURRENCY[p.method] ?? 'USD'
      const igtf =
        igtfCfg.enabled && isDivisa ? Math.round((p.amountUsd * igtfCfg.rateBp) / 10_000) : 0
      igtfTotal += igtf
      totalPaid += p.amountUsd
      if (p.method === 'credit') creditAmount += p.amountUsd
      return {
        id: ulid(),
        method: p.method,
        currency,
        isDivisa,
        amountUsd: p.amountUsd,
        amountOriginal: p.amountOriginal ?? null,
        igtf,
        reference: p.reference ?? null
      }
    })

    const total = goodsTotal + igtfTotal

    if (totalPaid < total) {
      throw new SaleError('PAYMENT_SHORT', 'el pago no cubre el total')
    }

    // Credit validation
    if (creditAmount > 0) {
      if (!input.customerId) throw new SaleError('CREDIT_NO_CUSTOMER', 'crédito requiere cliente')
      const cust = await db.select().from(customers).where(eq(customers.id, input.customerId)).get()
      if (!cust) throw new SaleError('CREDIT_NO_CUSTOMER', 'cliente no existe')
      if (cust.currentBalance + creditAmount > cust.creditLimit) {
        throw new SaleError('CREDIT_LIMIT_EXCEEDED', 'excede el límite de crédito')
      }
    }

    const changeUsd = Math.max(0, totalPaid - total)
    const fxRate = await getCurrentRate()
    const rateUsed = fxRate?.rate ?? null
    const saleId = ulid()
    const number = await nextSaleNumber(db)
    const now = Date.now()

    const raw = getRawDb()
    raw.exec('BEGIN IMMEDIATE')
    try {
      raw
        .prepare(
          `INSERT INTO sales (id, number, customer_id, user_id, cash_session_id, status, subtotal, discount_total, tax_total, igtf_total, total, rate_used, notes, created_at)
           VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          saleId,
          number,
          input.customerId ?? null,
          session.userId,
          cashSession.id,
          subtotal,
          discountTotal,
          taxTotal,
          igtfTotal,
          total,
          rateUsed,
          input.notes ?? null,
          now
        )

      const insLine = raw.prepare(
        `INSERT INTO sale_lines (id, sale_id, product_id, serial_id, sku, description, qty, unit_price, discount_amount, tax_rate_bp, line_subtotal, line_tax, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const l of computed) {
        insLine.run(
          l.id,
          saleId,
          l.productId,
          l.serialId,
          l.sku,
          l.description,
          l.qty,
          l.unitPrice,
          l.discountAmount,
          l.taxRateBp,
          l.lineSubtotal,
          l.lineTax,
          l.lineTotal
        )
      }

      const insPay = raw.prepare(
        `INSERT INTO payments (id, sale_id, method, currency, is_divisa, amount_usd, amount_original, igtf, reference, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const p of computedPayments) {
        insPay.run(
          p.id,
          saleId,
          p.method,
          p.currency,
          p.isDivisa ? 1 : 0,
          p.amountUsd,
          p.amountOriginal,
          p.igtf,
          p.reference,
          now
        )
      }

      // stock decrement
      const updStock = raw.prepare(
        `UPDATE stock_levels SET quantity = quantity - ?, updated_at = ? WHERE product_id = ? AND location_id = 'main'`
      )
      for (const [productId, qty] of stockDecrements) {
        updStock.run(qty, now, productId)
      }

      // serials → sold
      const updSerial = raw.prepare(
        `UPDATE serials SET status = 'sold', current_sale_id = ?, updated_at = ? WHERE id = ?`
      )
      for (const s of serialsToSell) {
        updSerial.run(saleId, now, s.id)
      }

      // cash movement for the session
      raw
        .prepare(
          `INSERT INTO cash_movements (id, session_id, user_id, type, amount, reference, ts) VALUES (?, ?, ?, 'sale', ?, ?, ?)`
        )
        .run(ulid(), cashSession.id, session.userId, total, number, now)

      // credit → AR
      if (creditAmount > 0 && input.customerId) {
        raw
          .prepare(
            `INSERT INTO ar_movements (id, customer_id, sale_id, type, amount, notes, ts, user_id) VALUES (?, ?, ?, 'charge', ?, ?, ?, ?)`
          )
          .run(
            ulid(),
            input.customerId,
            saleId,
            creditAmount,
            `Venta ${number}`,
            now,
            session.userId
          )
        raw
          .prepare(
            `UPDATE customers SET current_balance = current_balance + ?, updated_at = ? WHERE id = ?`
          )
          .run(creditAmount, now, input.customerId)
      }

      raw.exec('COMMIT')
    } catch (e) {
      raw.exec('ROLLBACK')
      throw e
    }

    await audit({
      userId: session.userId,
      action: 'sale.create',
      targetType: 'sale',
      targetId: saleId,
      after: { number, total, igtfTotal }
    })

    // Sincroniza con AgroOne en segundo plano; la venta ya quedó persistida
    // localmente, así que un fallo aquí no afecta la respuesta al cajero.
    void pushSale(saleId)

    // P2P (§8.4): comparte el delta de stock y la reclamación de seriales con
    // las demás cajas de la tienda. La venta/pago en sí (hechos inmutables)
    // no se proyecta cross-nodo todavía — referencia user/cash_session
    // locales a este nodo; queda para una iteración futura.
    for (const [productId, qty] of stockDecrements) {
      emitLocalEvent('stock_level', productId, 'stock.decremented', { delta: -qty })
    }
    if (serialsToSell.length > 0) {
      const identity = await getIdentity()
      for (const s of serialsToSell) {
        emitLocalEvent('serial', s.id, 'serial.sold', {
          imei: s.imei,
          saleNumber: number,
          nodeLabel: identity.nodeLabel
        })
      }
    }

    return { sale: await buildSaleDto(saleId), changeUsd }
  },

  async get(input: Input<'get'>): Promise<SaleDTO> {
    return buildSaleDto(input.id)
  },

  async list(input?: Input<'list'>): Promise<{ items: SaleDTO[]; total: number }> {
    const db = getDb()
    const limit = input?.limit ?? 50
    const offset = input?.offset ?? 0
    const conds: SQL[] = []
    if (input?.cashSessionId) conds.push(eq(sales.cashSessionId, input.cashSessionId))
    const where = conds.length > 0 ? and(...conds) : undefined
    const rows = await db
      .select({ id: sales.id })
      .from(sales)
      .where(where)
      .orderBy(desc(sales.createdAt))
      .limit(limit)
      .offset(offset)
      .all()
    const totalRow = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(sales)
      .where(where)
      .get()
    const items = await Promise.all(rows.map((r) => buildSaleDto(r.id)))
    return { items, total: totalRow?.c ?? 0 }
  },

  async void(input: Input<'void'>): Promise<SaleDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SALES_VOID)
    const db = getDb()
    const sale = await db.select().from(sales).where(eq(sales.id, input.id)).get()
    if (!sale) throw new SaleError('NOT_FOUND', 'venta no existe')
    if (sale.status === 'voided') throw new SaleError('ALREADY_VOIDED', 'venta ya anulada')

    const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, input.id)).all()
    const soldSerialIds = lines.filter((l) => l.serialId).map((l) => l.serialId!)
    const serialImeiById = new Map(
      soldSerialIds.length > 0
        ? (
            await db
              .select({ id: serials.id, imei: serials.imei })
              .from(serials)
              .where(inArray(serials.id, soldSerialIds))
              .all()
          ).map((s) => [s.id, s.imei] as const)
        : []
    )
    const payRows = await db.select().from(payments).where(eq(payments.saleId, input.id)).all()
    const creditPaid = payRows
      .filter((p) => p.method === 'credit')
      .reduce((s, p) => s + p.amountUsd, 0)

    const raw = getRawDb()
    const now = Date.now()
    raw.exec('BEGIN IMMEDIATE')
    try {
      raw
        .prepare(`UPDATE sales SET status = 'voided', voided_at = ?, voided_by = ? WHERE id = ?`)
        .run(now, session.userId, input.id)

      // restore stock + serials
      const updStock = raw.prepare(
        `UPDATE stock_levels SET quantity = quantity + ?, updated_at = ? WHERE product_id = ? AND location_id = 'main'`
      )
      const updSerial = raw.prepare(
        `UPDATE serials SET status = 'available', current_sale_id = NULL, updated_at = ? WHERE id = ?`
      )
      for (const l of lines) {
        updStock.run(l.qty, now, l.productId)
        if (l.serialId) updSerial.run(now, l.serialId)
      }

      // reverse cash movement
      raw
        .prepare(
          `INSERT INTO cash_movements (id, session_id, user_id, type, amount, reference, ts) VALUES (?, ?, ?, 'adjustment', ?, ?, ?)`
        )
        .run(
          ulid(),
          sale.cashSessionId,
          session.userId,
          -sale.total,
          `Anulación ${sale.number}`,
          now
        )

      // reverse AR if credit
      if (creditPaid > 0 && sale.customerId) {
        raw
          .prepare(
            `INSERT INTO ar_movements (id, customer_id, sale_id, type, amount, notes, ts, user_id) VALUES (?, ?, ?, 'adjustment', ?, ?, ?, ?)`
          )
          .run(
            ulid(),
            sale.customerId,
            input.id,
            -creditPaid,
            `Anulación ${sale.number}`,
            now,
            session.userId
          )
        raw
          .prepare(
            `UPDATE customers SET current_balance = current_balance - ?, updated_at = ? WHERE id = ?`
          )
          .run(creditPaid, now, sale.customerId)
      }

      raw.exec('COMMIT')
    } catch (e) {
      raw.exec('ROLLBACK')
      throw e
    }

    await audit({
      userId: session.userId,
      action: 'sale.void',
      targetType: 'sale',
      targetId: input.id,
      after: { reason: input.reason }
    })

    // P2P (§8.4): comparte la reversión de stock y libera los seriales para
    // las demás cajas de la tienda.
    const stockRestored = new Map<string, number>()
    for (const l of lines) {
      stockRestored.set(l.productId, (stockRestored.get(l.productId) ?? 0) + l.qty)
    }
    for (const [productId, qty] of stockRestored) {
      emitLocalEvent('stock_level', productId, 'stock.adjusted', { delta: qty })
    }
    for (const l of lines) {
      if (!l.serialId) continue
      const imei = serialImeiById.get(l.serialId)
      if (imei) emitLocalEvent('serial', l.serialId, 'serial.returned', { imei })
    }

    return buildSaleDto(input.id)
  }
}
