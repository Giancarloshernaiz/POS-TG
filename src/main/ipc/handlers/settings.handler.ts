import { requirePermission } from '@main/auth/guard'
import {
  getGlobalLowStock,
  getIgtfConfig,
  getSetting,
  setSetting,
  SETTINGS_KEYS,
  type IgtfConfig
} from '@main/infrastructure/settings/settings.service'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import { isValidRif, normalizeRif } from '@shared/fiscal'
import type { StoreProfileDTO } from '@shared/ipc/contracts/settings'

export const settingsHandlers = {
  async getLowStockGlobal(): Promise<{ threshold: number }> {
    return { threshold: await getGlobalLowStock() }
  },

  async getIgtf(): Promise<IgtfConfig> {
    return getIgtfConfig()
  },

  async setIgtf(input: {
    sessionId: string
    enabled: boolean
    rateBp: number
  }): Promise<IgtfConfig> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const cfg: IgtfConfig = { enabled: input.enabled, rateBp: input.rateBp }
    await setSetting(SETTINGS_KEYS.IGTF, cfg)
    await audit({ userId: session.userId, action: 'settings.igtf', after: { ...cfg } })
    return cfg
  },

  async setLowStockGlobal(input: {
    sessionId: string
    threshold: number
  }): Promise<{ threshold: number }> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    await setSetting(SETTINGS_KEYS.LOW_STOCK_GLOBAL, { value: input.threshold })
    await audit({
      userId: session.userId,
      action: 'settings.lowStockGlobal',
      after: { threshold: input.threshold }
    })
    return { threshold: input.threshold }
  },

  async getStoreProfile(): Promise<StoreProfileDTO | null> {
    return getSetting<StoreProfileDTO>(SETTINGS_KEYS.STORE_PROFILE)
  },

  async setStoreProfile(input: {
    sessionId: string
    legalName: string
    rif: string
    address: string
    city: string
    state: string
    phone: string
    fiscalType: 'ordinario' | 'especial' | 'formal'
  }): Promise<StoreProfileDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    if (input.rif && !isValidRif(input.rif)) {
      throw Object.assign(new Error('RIF inválido'), { code: 'INVALID_RIF' })
    }
    const profile: StoreProfileDTO = {
      legalName: input.legalName,
      rif: input.rif ? normalizeRif(input.rif) : '',
      address: input.address,
      city: input.city,
      state: input.state,
      phone: input.phone,
      fiscalType: input.fiscalType
    }
    await setSetting(SETTINGS_KEYS.STORE_PROFILE, profile)
    await audit({
      userId: session.userId,
      action: 'settings.storeProfile',
      after: { rif: profile.rif, legalName: profile.legalName }
    })
    return profile
  }
}
