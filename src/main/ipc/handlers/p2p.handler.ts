import { eq, desc } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { serialConflicts, serials, products, sales } from '@main/infrastructure/db/schema'
import { getP2pStatus } from '@main/infrastructure/sync/p2p/p2p.service'
import { requirePermission } from '@main/auth/guard'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type { P2pStatusDTO, SerialConflictDTO } from '@shared/ipc/contracts/p2p'

function toDto(
  row: typeof serialConflicts.$inferSelect,
  productName: string | null,
  saleNumber: string | null
): SerialConflictDTO {
  return {
    id: row.id,
    imei: row.imei,
    productName,
    localSaleId: row.localSaleId,
    localSaleNumber: saleNumber,
    winningNodeId: row.winningNodeId,
    detectedAt: row.detectedAt,
    resolved: row.resolved,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    resolutionNotes: row.resolutionNotes
  }
}

export const p2pHandlers = {
  async getStatus(): Promise<P2pStatusDTO> {
    return getP2pStatus()
  },

  async listSerialConflicts(input?: { includeResolved?: boolean }): Promise<SerialConflictDTO[]> {
    const db = getDb()
    const rows = db
      .select({ c: serialConflicts, productName: products.name, saleNumber: sales.number })
      .from(serialConflicts)
      .leftJoin(serials, eq(serials.id, serialConflicts.serialId))
      .leftJoin(products, eq(products.id, serials.productId))
      .leftJoin(sales, eq(sales.id, serialConflicts.localSaleId))
      .orderBy(desc(serialConflicts.detectedAt))
      .all()
    return rows
      .filter((r) => input?.includeResolved || !r.c.resolved)
      .map((r) => toDto(r.c, r.productName, r.saleNumber))
  },

  async resolveSerialConflict(input: {
    sessionId: string
    conflictId: string
    notes?: string | null | undefined
  }): Promise<SerialConflictDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_ADJUST)
    const db = getDb()
    const current = db
      .select()
      .from(serialConflicts)
      .where(eq(serialConflicts.id, input.conflictId))
      .get()
    if (!current) throw Object.assign(new Error('conflicto no existe'), { code: 'NOT_FOUND' })

    db.update(serialConflicts)
      .set({
        resolved: true,
        resolvedBy: session.userId,
        resolvedAt: Date.now(),
        resolutionNotes: input.notes ?? null
      })
      .where(eq(serialConflicts.id, input.conflictId))
      .run()

    await audit({
      userId: session.userId,
      action: 'p2p.serial_conflict.resolve',
      targetType: 'serial',
      targetId: current.serialId,
      before: { resolved: false },
      after: { resolved: true, notes: input.notes ?? null }
    })

    const row = db
      .select()
      .from(serialConflicts)
      .where(eq(serialConflicts.id, input.conflictId))
      .get()!
    const serial = db.select().from(serials).where(eq(serials.id, row.serialId)).get()
    const product = serial
      ? db.select().from(products).where(eq(products.id, serial.productId)).get()
      : undefined
    const sale = row.localSaleId
      ? db.select().from(sales).where(eq(sales.id, row.localSaleId)).get()
      : undefined
    return toDto(row, product?.name ?? null, sale?.number ?? null)
  }
}
