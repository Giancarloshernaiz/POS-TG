import { eq } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { settings } from '@main/infrastructure/db/schema'

export const SETTINGS_KEYS = {
  LOW_STOCK_GLOBAL: 'inventory.lowStockThreshold',
  FX_BCV: 'fx.bcv',
  STORE_PROFILE: 'store.profile',
  IGTF: 'fiscal.igtf'
} as const

export type IgtfConfig = { enabled: boolean; rateBp: number }

const DEFAULT_IGTF: IgtfConfig = { enabled: true, rateBp: 300 }

export async function getIgtfConfig(): Promise<IgtfConfig> {
  const v = await getSetting<IgtfConfig>(SETTINGS_KEYS.IGTF)
  return v ?? DEFAULT_IGTF
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = getDb()
  const row = await db.select().from(settings).where(eq(settings.key, key)).get()
  return row ? (row.value as T) : null
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = getDb()
  const now = Date.now()
  await db
    .insert(settings)
    .values({ key, value: value as unknown, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as unknown, updatedAt: now } })
    .run()
}

export async function getGlobalLowStock(): Promise<number> {
  const v = await getSetting<{ value: number }>(SETTINGS_KEYS.LOW_STOCK_GLOBAL)
  return v?.value ?? 5
}
