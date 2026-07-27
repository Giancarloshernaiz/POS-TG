import { eq, sql } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { products, stockLevels } from '@main/infrastructure/db/schema'
import { logger } from '@main/logger'

// Reducer de stock (§8.4): PN-Counter CRDT. El delta es conmutativo y
// asociativo — aplicar los mismos deltas en cualquier orden converge al
// mismo total. Idempotencia de "no aplicar dos veces" ya la garantiza el
// dedup por event.id en event-log.ts; este reducer solo suma el delta.

export type StockDeltaPayload = { delta: number }

/** Aplica un delta de stock recibido de un peer. No-op si el producto no existe localmente aún. */
export function applyStockDelta(productId: string, payload: StockDeltaPayload, ts: number): void {
  const db = getDb()
  const product = db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .get()
  if (!product) {
    logger.warn(
      { productId },
      'p2p: evento de stock para producto desconocido localmente, ignorado'
    )
    return
  }
  db.insert(stockLevels)
    .values({ productId, locationId: 'main', quantity: payload.delta, updatedAt: ts })
    .onConflictDoUpdate({
      target: [stockLevels.productId, stockLevels.locationId],
      set: { quantity: sql`${stockLevels.quantity} + ${payload.delta}`, updatedAt: ts }
    })
    .run()
}
