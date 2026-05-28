import { ulid } from 'ulid'
import { and, eq, inArray } from 'drizzle-orm'
import { serials } from '@main/infrastructure/db/schema'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

type Db = BetterSQLite3Database<Record<string, unknown>>

export type SerialStatus = 'available' | 'reserved' | 'sold' | 'returned' | 'defective'

const TRANSITIONS: Record<SerialStatus, SerialStatus[]> = {
  available: ['reserved', 'defective'],
  reserved: ['sold', 'available', 'defective'],
  sold: ['returned'],
  returned: ['available', 'defective'],
  defective: ['available']
}

export function canTransition(from: SerialStatus, to: SerialStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export class SerialError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export async function createSerials(
  db: Db,
  input: {
    productId: string
    imeis: string[]
    receivedAt: number
    receivedVia?: string
    locationId?: string
  }
): Promise<string[]> {
  if (input.imeis.length === 0) return []

  const dupes = await db
    .select({ imei: serials.imei })
    .from(serials)
    .where(inArray(serials.imei, input.imeis))
    .all()
  if (dupes.length > 0) {
    throw new SerialError(
      'SERIAL_DUPLICATE',
      `serial(es) ya existe(n): ${dupes.map((d) => d.imei).join(', ')}`
    )
  }

  const now = Date.now()
  const rows = input.imeis.map((imei) => ({
    id: ulid(),
    productId: input.productId,
    imei: imei.trim(),
    status: 'available' as const,
    locationId: input.locationId ?? 'main',
    receivedAt: input.receivedAt,
    receivedVia: input.receivedVia ?? null,
    createdAt: now,
    updatedAt: now
  }))
  await db.insert(serials).values(rows).run()
  return rows.map((r) => r.id)
}

export async function transitionSerial(
  db: Db,
  serialId: string,
  to: SerialStatus,
  extra: { currentSaleId?: string | null } = {}
): Promise<void> {
  const current = await db.select().from(serials).where(eq(serials.id, serialId)).get()
  if (!current) throw new SerialError('SERIAL_NOT_FOUND', `serial ${serialId} no existe`)
  if (!canTransition(current.status, to)) {
    throw new SerialError(
      'SERIAL_BAD_TRANSITION',
      `transición ${current.status} → ${to} no permitida`
    )
  }
  await db
    .update(serials)
    .set({
      status: to,
      currentSaleId:
        extra.currentSaleId === undefined ? current.currentSaleId : extra.currentSaleId,
      updatedAt: Date.now()
    })
    .where(eq(serials.id, serialId))
    .run()
}

export async function findSerialByImei(
  db: Db,
  imei: string
): Promise<typeof serials.$inferSelect | null> {
  const row = await db.select().from(serials).where(eq(serials.imei, imei.trim())).get()
  return row ?? null
}

export async function countSerialsByStatus(
  db: Db,
  productId: string,
  status: SerialStatus,
  locationId = 'main'
): Promise<number> {
  const rows = await db
    .select()
    .from(serials)
    .where(
      and(
        eq(serials.productId, productId),
        eq(serials.status, status),
        eq(serials.locationId, locationId)
      )
    )
    .all()
  return rows.length
}
