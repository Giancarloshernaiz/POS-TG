import { healthContract } from './health'
import { authContract } from './auth'
import { catalogContract } from './catalog'
import { inventoryContract } from './inventory'
import { purchasingContract } from './purchasing'
import { fxContract } from './fx'
import { settingsContract } from './settings'
import { cashContract } from './cash'
import { customersContract } from './customers'
import { salesContract } from './sales'
import { printContract } from './print'
import { backupContract } from './backup'

export const contracts = {
  health: healthContract,
  auth: authContract,
  catalog: catalogContract,
  inventory: inventoryContract,
  purchasing: purchasingContract,
  fx: fxContract,
  settings: settingsContract,
  cash: cashContract,
  customers: customersContract,
  sales: salesContract,
  print: printContract,
  backup: backupContract
} as const

export type Contracts = typeof contracts
