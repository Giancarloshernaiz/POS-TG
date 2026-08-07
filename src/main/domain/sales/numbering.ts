import { eq } from 'drizzle-orm'
import { settings } from '@main/infrastructure/db/schema'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

// Numeración correlativa de ventas.
//
// Vivía en `domain/purchasing/` junto a las secuencias de órdenes de compra y
// recepciones. Al sacar compras del POS quedó sola, y su lugar natural es
// ventas: es lo único que numera esta caja.

type Db = BetterSQLite3Database<Record<string, unknown>>

const SETTINGS_KEY_SALE_SEQ = 'numbering.sale.sequence'

async function getSeq(db: Db, key: string): Promise<number> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get()
  if (!row) return 0
  const v = row.value as { seq?: number } | null
  return v?.seq ?? 0
}

async function setSeq(db: Db, key: string, next: number): Promise<void> {
  const now = Date.now()
  await db
    .insert(settings)
    .values({ key, value: { seq: next }, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { seq: next }, updatedAt: now }
    })
    .run()
}

/**
 * Siguiente número de venta, formato `FAC-AAAA-00001`.
 *
 * Ni el formato ni la clave de settings cambian: las cajas que ya operan
 * continúan su correlativo sin saltos ni facturas con dos prefijos distintos.
 */
export async function nextSaleNumber(db: Db): Promise<string> {
  const next = (await getSeq(db, SETTINGS_KEY_SALE_SEQ)) + 1
  await setSeq(db, SETTINGS_KEY_SALE_SEQ, next)
  return `FAC-${new Date().getFullYear()}-${String(next).padStart(5, '0')}`
}
