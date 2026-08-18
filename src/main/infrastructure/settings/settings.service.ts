import { eq } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { settings } from '@main/infrastructure/db/schema'

export const SETTINGS_KEYS = {
  LOW_STOCK_GLOBAL: 'inventory.lowStockThreshold',
  FX_BCV: 'fx.bcv',
  STORE_PROFILE: 'store.profile',
  DEVICE_IDENTITY: 'device.identity',
  AGRO_LAST_PULL: 'sync.agro.lastPull',
  AGRO_CONSUMIDOR_FINAL: 'sync.agro.consumidorFinal',
  DISCOUNT_USD: 'sales.discountUsd',
  // Usuario de Galas Cloud bajo el que esta caja firma sus solicitudes de
  // autorización. Es un usuario de máquina por caja: el nombre del cajero real
  // viaja en `metadata`, así no hay que dar de alta a cada persona en el máster.
  AGRO_REQUESTER_USER: 'sync.agro.requesterUserId'
} as const

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
