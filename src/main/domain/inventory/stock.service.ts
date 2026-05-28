import { and, eq, sql } from 'drizzle-orm'
import { stockLevels } from '@main/infrastructure/db/schema'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

type Db = BetterSQLite3Database<Record<string, unknown>>

export async function getStock(db: Db, productId: string, locationId = 'main'): Promise<number> {
  const row = await db
    .select({ q: stockLevels.quantity })
    .from(stockLevels)
    .where(and(eq(stockLevels.productId, productId), eq(stockLevels.locationId, locationId)))
    .get()
  return row?.q ?? 0
}

export async function adjustStock(
  db: Db,
  productId: string,
  delta: number,
  locationId = 'main'
): Promise<void> {
  const now = Date.now()
  await db
    .insert(stockLevels)
    .values({ productId, locationId, quantity: delta, updatedAt: now })
    .onConflictDoUpdate({
      target: [stockLevels.productId, stockLevels.locationId],
      set: {
        quantity: sql`${stockLevels.quantity} + ${delta}`,
        updatedAt: now
      }
    })
    .run()
}

export async function setStock(
  db: Db,
  productId: string,
  quantity: number,
  locationId = 'main'
): Promise<void> {
  const now = Date.now()
  await db
    .insert(stockLevels)
    .values({ productId, locationId, quantity, updatedAt: now })
    .onConflictDoUpdate({
      target: [stockLevels.productId, stockLevels.locationId],
      set: { quantity, updatedAt: now }
    })
    .run()
}
