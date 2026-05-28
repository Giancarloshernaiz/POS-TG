import { and, eq, like, or, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { getDb } from '@main/infrastructure/db/client'
import { products, stockLevels, serials, categories } from '@main/infrastructure/db/schema'
import { requirePermission } from '@main/auth/guard'
import { adjustStock, getStock } from '@main/domain/inventory/stock.service'
import { findSerialByImei } from '@main/domain/inventory/serial.service'
import { getGlobalLowStock } from '@main/infrastructure/settings/settings.service'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import { inventoryContract } from '@shared/ipc/contracts/inventory'
import type { SerialDTO, StockRowDTO } from '@shared/ipc/contracts/inventory'

type Input<K extends keyof typeof inventoryContract> = z.infer<
  (typeof inventoryContract)[K]['input']
>

function toSerialDto(
  row: typeof serials.$inferSelect,
  productSku: string,
  productName: string
): SerialDTO {
  return {
    id: row.id,
    productId: row.productId,
    productSku,
    productName,
    imei: row.imei,
    status: row.status,
    currentSaleId: row.currentSaleId,
    locationId: row.locationId,
    receivedAt: row.receivedAt,
    receivedVia: row.receivedVia,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export const inventoryHandlers = {
  async listStock(input: Input<'listStock'>): Promise<StockRowDTO[]> {
    const db = getDb()
    const conds: SQL[] = []
    if (input.activeOnly) conds.push(eq(products.active, true))
    if (input.search) {
      const s = `%${input.search}%`
      conds.push(or(like(products.sku, s), like(products.name, s), like(products.barcode, s))!)
    }
    const where = conds.length > 0 ? and(...conds) : undefined

    const globalThreshold = await getGlobalLowStock()

    const rows = await db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        tracksSerial: products.tracksSerial,
        active: products.active,
        productThreshold: products.lowStockThreshold,
        categoryThreshold: categories.lowStockThreshold,
        quantity: stockLevels.quantity,
        serialsAvailable: sql<number>`(
          SELECT COUNT(*) FROM serials
          WHERE serials.product_id = ${products.id}
            AND serials.status = 'available'
            AND serials.location_id = 'main'
        )`
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        stockLevels,
        and(eq(stockLevels.productId, products.id), eq(stockLevels.locationId, 'main'))
      )
      .where(where)
      .orderBy(products.name)
      .all()

    let mapped: StockRowDTO[] = rows.map((r) => {
      // Resolution: product override > category > global
      const effectiveThreshold = r.productThreshold ?? r.categoryThreshold ?? globalThreshold
      const quantity = r.quantity ?? 0
      return {
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        tracksSerial: r.tracksSerial,
        quantity,
        serialsAvailable: r.serialsAvailable ?? 0,
        effectiveThreshold,
        isLow: quantity <= effectiveThreshold,
        active: r.active
      }
    })

    if (input.lowOnly) {
      mapped = mapped.filter((r) => r.isLow)
    }
    return mapped
  },

  async adjustStock(input: Input<'adjustStock'>): Promise<{ newQuantity: number }> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_ADJUST)
    const db = getDb()
    const product = await db.select().from(products).where(eq(products.id, input.productId)).get()
    if (!product) {
      throw Object.assign(new Error('producto no existe'), { code: 'PRODUCT_NOT_FOUND' })
    }
    const before = await getStock(db, input.productId)
    await adjustStock(db, input.productId, input.delta)
    const after = before + input.delta
    await audit({
      userId: session.userId,
      action: 'inventory.adjust',
      targetType: 'product',
      targetId: input.productId,
      before: { quantity: before },
      after: { quantity: after, reason: input.reason, delta: input.delta }
    })
    return { newQuantity: after }
  },

  async findSerial(input: Input<'findSerial'>): Promise<SerialDTO | null> {
    const db = getDb()
    const serial = await findSerialByImei(db, input.imei)
    if (!serial) return null
    const product = await db.select().from(products).where(eq(products.id, serial.productId)).get()
    return toSerialDto(serial, product?.sku ?? '', product?.name ?? '')
  },

  async listSerials(input: Input<'listSerials'>): Promise<{ items: SerialDTO[]; total: number }> {
    const db = getDb()
    const conds: SQL[] = []
    if (input.productId) conds.push(eq(serials.productId, input.productId))
    if (input.status) conds.push(eq(serials.status, input.status))
    if (input.search) conds.push(like(serials.imei, `%${input.search}%`))
    const where = conds.length > 0 ? and(...conds) : undefined

    const items = await db
      .select({
        s: serials,
        sku: products.sku,
        name: products.name
      })
      .from(serials)
      .innerJoin(products, eq(serials.productId, products.id))
      .where(where)
      .orderBy(serials.imei)
      .limit(input.limit)
      .offset(input.offset)
      .all()

    const total = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(serials)
      .where(where)
      .get()

    return {
      items: items.map((r) => toSerialDto(r.s, r.sku, r.name)),
      total: total?.c ?? 0
    }
  }
}
