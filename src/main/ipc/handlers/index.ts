import { healthHandlers } from './health.handler'
import { authHandlers } from './auth.handler'
import { catalogHandlers } from './catalog.handler'
import { inventoryHandlers } from './inventory.handler'
import { purchasingHandlers } from './purchasing.handler'
import { fxHandlers } from './fx.handler'
import { settingsHandlers } from './settings.handler'
import { cashHandlers } from './cash.handler'
import { customersHandlers } from './customers.handler'
import { salesHandlers } from './sales.handler'
import { printHandlers } from './print.handler'
import { backupHandlers } from './backup.handler'
import { deviceHandlers } from './device.handler'
import { syncHandlers } from './sync.handler'
import { p2pHandlers } from './p2p.handler'

export const handlers = {
  health: healthHandlers,
  auth: authHandlers,
  catalog: catalogHandlers,
  inventory: inventoryHandlers,
  purchasing: purchasingHandlers,
  fx: fxHandlers,
  settings: settingsHandlers,
  cash: cashHandlers,
  customers: customersHandlers,
  sales: salesHandlers,
  print: printHandlers,
  backup: backupHandlers,
  device: deviceHandlers,
  sync: syncHandlers,
  p2p: p2pHandlers
} as const
