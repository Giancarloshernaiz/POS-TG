import type { z } from 'zod'
import { requireSession, requirePermission } from '@main/auth/guard'
import {
  getPrinterConfig,
  setPrinterConfig,
  printTest,
  printSaleTicket,
  openCashDrawer,
  type PrinterConfig
} from '@main/infrastructure/printer/printer.service'
import { getSetting, SETTINGS_KEYS } from '@main/infrastructure/settings/settings.service'
import { buildSaleDto } from './sales.handler'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import { printContract } from '@shared/ipc/contracts/print'
import type { PrinterConfigDTO } from '@shared/ipc/contracts/print'
import type { StoreProfileDTO } from '@shared/ipc/contracts/settings'

type Input<K extends keyof typeof printContract> = z.infer<(typeof printContract)[K]['input']>

export const printHandlers = {
  async getConfig(): Promise<PrinterConfigDTO> {
    return getPrinterConfig()
  },

  async setConfig(input: Input<'setConfig'>): Promise<PrinterConfigDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const cfg: PrinterConfig = {
      type: input.type,
      interface: input.interface,
      widthChars: input.widthChars,
      enabled: input.enabled
    }
    await setPrinterConfig(cfg)
    await audit({ userId: session.userId, action: 'printer.config', after: { ...cfg } })
    return cfg
  },

  async test(input: Input<'test'>): Promise<{ ok: true }> {
    requireSession(input.sessionId)
    await printTest()
    return { ok: true }
  },

  async ticket(input: Input<'ticket'>): Promise<{ ok: true }> {
    requireSession(input.sessionId)
    const sale = await buildSaleDto(input.saleId)
    const store = await getSetting<StoreProfileDTO>(SETTINGS_KEYS.STORE_PROFILE)
    await printSaleTicket(sale, store)
    return { ok: true }
  },

  async openDrawer(input: Input<'openDrawer'>): Promise<{ ok: true }> {
    requirePermission(input.sessionId, PERMISSIONS.CASH_DRAWER_OPEN)
    await openCashDrawer()
    return { ok: true }
  }
}
