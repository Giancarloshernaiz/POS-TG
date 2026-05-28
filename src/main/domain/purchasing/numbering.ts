import { eq } from 'drizzle-orm'
import { settings } from '@main/infrastructure/db/schema'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

type Db = BetterSQLite3Database<Record<string, unknown>>

const SETTINGS_KEY_PO_SEQ = 'numbering.po.sequence'
const SETTINGS_KEY_GR_SEQ = 'numbering.gr.sequence'
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

function fmt(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`
}

export async function nextPoNumber(db: Db): Promise<string> {
  const next = (await getSeq(db, SETTINGS_KEY_PO_SEQ)) + 1
  await setSeq(db, SETTINGS_KEY_PO_SEQ, next)
  return fmt('PO', new Date().getFullYear(), next)
}

export async function nextGrNumber(db: Db): Promise<string> {
  const next = (await getSeq(db, SETTINGS_KEY_GR_SEQ)) + 1
  await setSeq(db, SETTINGS_KEY_GR_SEQ, next)
  return fmt('GR', new Date().getFullYear(), next)
}

export async function nextSaleNumber(db: Db): Promise<string> {
  const next = (await getSeq(db, SETTINGS_KEY_SALE_SEQ)) + 1
  await setSeq(db, SETTINGS_KEY_SALE_SEQ, next)
  return fmt('FAC', new Date().getFullYear(), next)
}
