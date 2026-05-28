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
  print: printHandlers
} as const
