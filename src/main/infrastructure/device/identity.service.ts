import { ulid } from 'ulid'
import {
  getSetting,
  setSetting,
  SETTINGS_KEYS
} from '@main/infrastructure/settings/settings.service'
import { normalizeBaseUrl } from '@main/infrastructure/sync/agroone/agro.client'
import type { DeviceIdentityDTO } from '@shared/ipc/contracts/device'

// Identidad de esta caja (plan §31.3): nodeId estable (ULID, primer boot),
// vinculado a una Tienda de AgroOne (storeId) durante el provisioning.

const DEFAULT_LABEL = 'Caja sin nombre'

type Stored = {
  nodeId: string
  nodeLabel?: string
  storeId?: number | null
  storeName?: string | null
  sedeId?: number | null
  agroBaseUrl?: string | null
  provisionedAt?: number | null
}

function hydrate(s: Stored): DeviceIdentityDTO {
  return {
    nodeId: s.nodeId,
    nodeLabel: s.nodeLabel ?? DEFAULT_LABEL,
    storeId: s.storeId ?? null,
    storeName: s.storeName ?? null,
    sedeId: s.sedeId ?? null,
    agroBaseUrl: s.agroBaseUrl ?? null,
    provisionedAt: s.provisionedAt ?? null
  }
}

/**
 * Devuelve la identidad, generando el nodeId la primera vez (idempotente).
 * El nodeId nunca cambia una vez creado.
 */
export async function getIdentity(): Promise<DeviceIdentityDTO> {
  const stored = await getSetting<Stored>(SETTINGS_KEYS.DEVICE_IDENTITY)
  if (stored?.nodeId) return hydrate(stored)
  const fresh: Stored = { nodeId: ulid(), nodeLabel: DEFAULT_LABEL }
  await setSetting(SETTINGS_KEYS.DEVICE_IDENTITY, fresh)
  return hydrate(fresh)
}

export function isProvisioned(id: DeviceIdentityDTO): boolean {
  return id.storeId !== null && id.provisionedAt !== null
}

/** Vincula esta caja a una Tienda de AgroOne. Conserva el nodeId. */
export async function provision(input: {
  agroBaseUrl: string
  storeId: number
  storeName: string
  sedeId: number
  nodeLabel: string
}): Promise<DeviceIdentityDTO> {
  const current = await getIdentity()
  const next: Stored = {
    nodeId: current.nodeId,
    nodeLabel: input.nodeLabel,
    storeId: input.storeId,
    storeName: input.storeName,
    sedeId: input.sedeId,
    agroBaseUrl: normalizeBaseUrl(input.agroBaseUrl),
    provisionedAt: Date.now()
  }
  await setSetting(SETTINGS_KEYS.DEVICE_IDENTITY, next)
  return hydrate(next)
}

/** Renombra la caja sin tocar la vinculación. */
export async function setNodeLabel(nodeLabel: string): Promise<DeviceIdentityDTO> {
  const current = await getIdentity()
  const next: Stored = { ...current, nodeLabel }
  await setSetting(SETTINGS_KEYS.DEVICE_IDENTITY, next)
  return hydrate(next)
}
