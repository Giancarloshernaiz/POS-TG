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
import { deviceContract } from './device'
import { syncContract } from './sync'
import { p2pContract } from './p2p'

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
  backup: backupContract,
  device: deviceContract,
  sync: syncContract,
  p2p: p2pContract
} as const

export type Contracts = typeof contracts
