import { and, eq, sql, desc, inArray, type SQL } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb, getRawDb } from '@main/infrastructure/db/client'
import {
  suppliers,
  purchaseOrders,
  poLines,
  products,
  users,
  serials
} from '@main/infrastructure/db/schema'
import { requirePermission } from '@main/auth/guard'
import { PERMISSIONS } from '@shared/auth/permissions'
import { nextPoNumber, nextGrNumber } from '@main/domain/purchasing/numbering'
import { audit } from '@main/audit/logger'
import type { z } from 'zod'
import { purchasingContract } from '@shared/ipc/contracts/purchasing'
import type {
  PurchaseOrderDTO,
  PurchaseOrderLineDTO,
  SupplierDTO
} from '@shared/ipc/contracts/purchasing'

type Input<K extends keyof typeof purchasingContract> = z.infer<
  (typeof purchasingContract)[K]['input']
>

class PurchasingError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

function toSupplierDto(row: typeof suppliers.$inferSelect): SupplierDTO {
  return {
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    fiscalType: row.fiscalType ?? null,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

async function buildPoDto(poId: string): Promise<PurchaseOrderDTO> {
  const db = getDb()
  const row = await db
    .select({
      po: purchaseOrders,
      supplierName: suppliers.name,
      createdByName: users.fullName
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(users, eq(purchaseOrders.createdBy, users.id))
    .where(eq(purchaseOrders.id, poId))
    .get()
  if (!row) throw new PurchasingError('NOT_FOUND', 'PO no existe')

  const lines = await db
    .select({
      l: poLines,
      sku: products.sku,
      name: products.name,
      tracksSerial: products.tracksSerial
    })
    .from(poLines)
    .innerJoin(products, eq(poLines.productId, products.id))
    .where(eq(poLines.poId, poId))
    .all()

  const lineDtos: PurchaseOrderLineDTO[] = lines.map((r) => ({
    id: r.l.id,
    poId: r.l.poId,
    productId: r.l.productId,
    productSku: r.sku,
    productName: r.name,
    tracksSerial: r.tracksSerial,
    qtyOrdered: r.l.qtyOrdered,
    qtyReceived: r.l.qtyReceived,
    unitCost: r.l.unitCost,
    lineTotal: r.l.lineTotal
  }))

  return {
    id: row.po.id,
    number: row.po.number,
    supplierId: row.po.supplierId,
    supplierName: row.supplierName,
    status: row.po.status,
    expectedAt: row.po.expectedAt,
    notes: row.po.notes,
    totalAmount: row.po.totalAmount,
    createdBy: row.po.createdBy,
    createdByName: row.createdByName,
    submittedAt: row.po.submittedAt,
    receivedAt: row.po.receivedAt,
    closedAt: row.po.closedAt,
    createdAt: row.po.createdAt,
    updatedAt: row.po.updatedAt,
    lines: lineDtos
  }
}

export const purchasingHandlers = {
  async listSuppliers(input?: Input<'listSuppliers'>): Promise<SupplierDTO[]> {
    const db = getDb()
    const where = input?.activeOnly ? eq(suppliers.active, true) : undefined
    const rows = await db.select().from(suppliers).where(where).orderBy(suppliers.name).all()
    return rows.map(toSupplierDto)
  },

  async createSupplier(input: Input<'createSupplier'>): Promise<SupplierDTO> {
    const db = getDb()
    const dupe = await db.select().from(suppliers).where(eq(suppliers.name, input.name)).get()
    if (dupe) throw new PurchasingError('DUPLICATE_NAME', 'proveedor ya existe')
    const id = ulid()
    const now = Date.now()
    await db
      .insert(suppliers)
      .values({
        id,
        name: input.name,
        taxId: input.taxId ?? null,
        fiscalType: input.fiscalType ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        active: input.active,
        createdAt: now,
        updatedAt: now
      })
      .run()
    const row = await db.select().from(suppliers).where(eq(suppliers.id, id)).get()
    return toSupplierDto(row!)
  },

  async updateSupplier(input: Input<'updateSupplier'>): Promise<SupplierDTO> {
    const db = getDb()
    const current = await db.select().from(suppliers).where(eq(suppliers.id, input.id)).get()
    if (!current) throw new PurchasingError('NOT_FOUND', 'proveedor no existe')
    if (input.name && input.name !== current.name) {
      const dupe = await db.select().from(suppliers).where(eq(suppliers.name, input.name)).get()
      if (dupe) throw new PurchasingError('DUPLICATE_NAME', 'nombre ya existe')
    }
    const updates: Partial<typeof suppliers.$inferInsert> = { updatedAt: Date.now() }
    for (const k of [
      'name',
      'taxId',
      'fiscalType',
      'email',
      'phone',
      'address',
      'notes',
      'active'
    ] as const) {
      if (input[k] !== undefined) (updates as Record<string, unknown>)[k] = input[k]
    }
    await db.update(suppliers).set(updates).where(eq(suppliers.id, input.id)).run()
    const row = await db.select().from(suppliers).where(eq(suppliers.id, input.id)).get()
    return toSupplierDto(row!)
  },

  async listPOs(input?: Input<'listPOs'>): Promise<{ items: PurchaseOrderDTO[]; total: number }> {
    const db = getDb()
    const limit = input?.limit ?? 100
    const offset = input?.offset ?? 0
    const conds: SQL[] = []
    if (input?.status) conds.push(eq(purchaseOrders.status, input.status))
    if (input?.supplierId) conds.push(eq(purchaseOrders.supplierId, input.supplierId))
    const where = conds.length > 0 ? and(...conds) : undefined

    const rows = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(where)
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(limit)
      .offset(offset)
      .all()
    const total = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(purchaseOrders)
      .where(where)
      .get()
    const items = await Promise.all(rows.map((r) => buildPoDto(r.id)))
    return { items, total: total?.c ?? 0 }
  },

  async getPO(input: Input<'getPO'>): Promise<PurchaseOrderDTO> {
    return buildPoDto(input.id)
  },

  async createPO(input: Input<'createPO'>): Promise<PurchaseOrderDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_RECEIVE)
    const db = getDb()
    const supplier = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .get()
    if (!supplier) throw new PurchasingError('SUPPLIER_NOT_FOUND', 'proveedor no existe')

    const productIds = input.lines.map((l) => l.productId)
    const foundProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds))
      .all()
    if (foundProducts.length !== new Set(productIds).size) {
      throw new PurchasingError('PRODUCT_NOT_FOUND', 'algún producto no existe')
    }

    const raw = getRawDb()
    const id = ulid()
    const number = await nextPoNumber(db)
    const now = Date.now()
    const totalAmount = input.lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0)

    raw.exec('BEGIN IMMEDIATE')
    try {
      raw
        .prepare(
          'INSERT INTO purchase_orders (id, number, supplier_id, status, expected_at, notes, total_amount, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          id,
          number,
          input.supplierId,
          'draft',
          input.expectedAt ?? null,
          input.notes ?? null,
          totalAmount,
          session.userId,
          now,
          now
        )
      const ins = raw.prepare(
        'INSERT INTO po_lines (id, po_id, product_id, qty_ordered, qty_received, unit_cost, line_total) VALUES (?, ?, ?, ?, 0, ?, ?)'
      )
      for (const l of input.lines) {
        ins.run(ulid(), id, l.productId, l.qtyOrdered, l.unitCost, l.qtyOrdered * l.unitCost)
      }
      raw.exec('COMMIT')
    } catch (e) {
      raw.exec('ROLLBACK')
      throw e
    }

    await audit({
      userId: session.userId,
      action: 'po.create',
      targetType: 'po',
      targetId: id,
      after: { number, supplierId: input.supplierId, totalAmount }
    })
    return buildPoDto(id)
  },

  async updatePO(input: Input<'updatePO'>): Promise<PurchaseOrderDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_RECEIVE)
    const db = getDb()
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).get()
    if (!po) throw new PurchasingError('NOT_FOUND', 'PO no existe')
    if (po.status !== 'draft') throw new PurchasingError('BAD_STATUS', 'solo PO en draft editable')

    const raw = getRawDb()
    const now = Date.now()
    raw.exec('BEGIN IMMEDIATE')
    try {
      const updateCols: string[] = ['updated_at = ?']
      const updateVals: unknown[] = [now]
      if (input.expectedAt !== undefined) {
        updateCols.push('expected_at = ?')
        updateVals.push(input.expectedAt)
      }
      if (input.notes !== undefined) {
        updateCols.push('notes = ?')
        updateVals.push(input.notes)
      }

      if (input.lines) {
        raw.prepare('DELETE FROM po_lines WHERE po_id = ?').run(input.id)
        const ins = raw.prepare(
          'INSERT INTO po_lines (id, po_id, product_id, qty_ordered, qty_received, unit_cost, line_total) VALUES (?, ?, ?, ?, 0, ?, ?)'
        )
        let total = 0
        for (const l of input.lines) {
          ins.run(
            ulid(),
            input.id,
            l.productId,
            l.qtyOrdered,
            l.unitCost,
            l.qtyOrdered * l.unitCost
          )
          total += l.qtyOrdered * l.unitCost
        }
        updateCols.push('total_amount = ?')
        updateVals.push(total)
      }
      updateVals.push(input.id)
      raw
        .prepare(`UPDATE purchase_orders SET ${updateCols.join(', ')} WHERE id = ?`)
        .run(...updateVals)
      raw.exec('COMMIT')
    } catch (e) {
      raw.exec('ROLLBACK')
      throw e
    }

    await audit({
      userId: session.userId,
      action: 'po.update',
      targetType: 'po',
      targetId: input.id
    })
    return buildPoDto(input.id)
  },

  async submitPO(input: Input<'submitPO'>): Promise<PurchaseOrderDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_RECEIVE)
    const db = getDb()
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).get()
    if (!po) throw new PurchasingError('NOT_FOUND', 'PO no existe')
    if (po.status !== 'draft') throw new PurchasingError('BAD_STATUS', 'PO no está en draft')
    const now = Date.now()
    await db
      .update(purchaseOrders)
      .set({ status: 'submitted', submittedAt: now, updatedAt: now })
      .where(eq(purchaseOrders.id, input.id))
      .run()
    await audit({
      userId: session.userId,
      action: 'po.submit',
      targetType: 'po',
      targetId: input.id
    })
    return buildPoDto(input.id)
  },

  async cancelPO(input: Input<'cancelPO'>): Promise<PurchaseOrderDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_RECEIVE)
    const db = getDb()
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).get()
    if (!po) throw new PurchasingError('NOT_FOUND', 'PO no existe')
    if (po.status === 'received' || po.status === 'closed') {
      throw new PurchasingError('BAD_STATUS', 'PO ya recibida/cerrada')
    }
    const now = Date.now()
    await db
      .update(purchaseOrders)
      .set({ status: 'cancelled', closedAt: now, updatedAt: now })
      .where(eq(purchaseOrders.id, input.id))
      .run()
    await audit({
      userId: session.userId,
      action: 'po.cancel',
      targetType: 'po',
      targetId: input.id
    })
    return buildPoDto(input.id)
  },

  async receivePO(
    input: Input<'receivePO'>
  ): Promise<{ receiptId: string; receiptNumber: string; po: PurchaseOrderDTO }> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_RECEIVE)
    const db = getDb()
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).get()
    if (!po) throw new PurchasingError('NOT_FOUND', 'PO no existe')
    if (po.status !== 'submitted' && po.status !== 'partial') {
      throw new PurchasingError('BAD_STATUS', 'PO no recibible')
    }

    const lineIds = input.lines.map((l) => l.poLineId)
    const lineRows = await db
      .select({ l: poLines, tracksSerial: products.tracksSerial, productId: products.id })
      .from(poLines)
      .innerJoin(products, eq(poLines.productId, products.id))
      .where(inArray(poLines.id, lineIds))
      .all()
    if (lineRows.length !== new Set(lineIds).size) {
      throw new PurchasingError('NOT_FOUND', 'línea de PO inválida')
    }

    const byLineId = new Map(lineRows.map((r) => [r.l.id, r]))
    for (const recv of input.lines) {
      const r = byLineId.get(recv.poLineId)
      if (!r) throw new PurchasingError('NOT_FOUND', 'línea no encontrada')
      const remaining = r.l.qtyOrdered - r.l.qtyReceived
      if (recv.qty > remaining) {
        throw new PurchasingError('OVER_RECEIPT', `excedente en SKU línea ${recv.poLineId}`)
      }
      if (r.tracksSerial) {
        if (!recv.serials || recv.serials.length !== recv.qty) {
          throw new PurchasingError(
            'SERIAL_QTY_MISMATCH',
            `seriales requeridos: ${recv.qty}, recibidos: ${recv.serials?.length ?? 0}`
          )
        }
        const dedup = new Set(recv.serials)
        if (dedup.size !== recv.serials.length) {
          throw new PurchasingError('SERIAL_DUPLICATE', 'seriales duplicados en input')
        }
        const existing = await db
          .select({ imei: serials.imei })
          .from(serials)
          .where(inArray(serials.imei, recv.serials))
          .all()
        if (existing.length > 0) {
          throw new PurchasingError(
            'SERIAL_DUPLICATE',
            `serial(es) ya existe(n): ${existing.map((e) => e.imei).join(', ')}`
          )
        }
      } else if (recv.serials && recv.serials.length > 0) {
        throw new PurchasingError('SERIAL_REQUIRED', 'producto no rastrea seriales')
      }
    }

    const raw = getRawDb()
    const receiptId = ulid()
    const receiptNumber = await nextGrNumber(db)
    const now = Date.now()

    raw.exec('BEGIN IMMEDIATE')
    try {
      raw
        .prepare(
          'INSERT INTO goods_receipts (id, number, po_id, received_by, ts, notes) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(receiptId, receiptNumber, input.poId, session.userId, now, input.notes ?? null)

      const insLine = raw.prepare(
        'INSERT INTO goods_receipt_lines (id, receipt_id, po_line_id, product_id, qty) VALUES (?, ?, ?, ?, ?)'
      )
      const updLine = raw.prepare(
        'UPDATE po_lines SET qty_received = qty_received + ? WHERE id = ?'
      )
      const upsertStock = raw.prepare(
        `INSERT INTO stock_levels (product_id, location_id, quantity, updated_at)
         VALUES (?, 'main', ?, ?)
         ON CONFLICT(product_id, location_id)
         DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at`
      )
      const insSerial = raw.prepare(
        'INSERT INTO serials (id, product_id, imei, status, location_id, received_at, received_via, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )

      for (const recv of input.lines) {
        const r = byLineId.get(recv.poLineId)!
        insLine.run(ulid(), receiptId, recv.poLineId, r.productId, recv.qty)
        updLine.run(recv.qty, recv.poLineId)
        upsertStock.run(r.productId, recv.qty, now)
        if (r.tracksSerial && recv.serials) {
          for (const imei of recv.serials) {
            insSerial.run(
              ulid(),
              r.productId,
              imei.trim(),
              'available',
              'main',
              now,
              `po:${input.poId}`,
              now,
              now
            )
          }
        }
      }

      // recompute status from lines
      const linesAfter = raw
        .prepare('SELECT qty_ordered, qty_received FROM po_lines WHERE po_id = ?')
        .all(input.poId) as { qty_ordered: number; qty_received: number }[]
      const allReceived = linesAfter.every((l) => l.qty_received >= l.qty_ordered)
      const anyReceived = linesAfter.some((l) => l.qty_received > 0)
      const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : 'submitted'
      const closedAt = newStatus === 'received' ? now : null
      const receivedAt = newStatus === 'received' ? now : null

      raw
        .prepare(
          'UPDATE purchase_orders SET status = ?, received_at = COALESCE(received_at, ?), closed_at = ?, updated_at = ? WHERE id = ?'
        )
        .run(newStatus, receivedAt, closedAt, now, input.poId)

      raw.exec('COMMIT')
    } catch (e) {
      raw.exec('ROLLBACK')
      throw e
    }

    await audit({
      userId: session.userId,
      action: 'po.receive',
      targetType: 'po',
      targetId: input.poId,
      after: { receiptId, receiptNumber, lines: input.lines.length }
    })

    return {
      receiptId,
      receiptNumber,
      po: await buildPoDto(input.poId)
    }
  }
}
