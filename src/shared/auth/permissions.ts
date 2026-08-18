export const PERMISSIONS = {
  // Sales
  SALES_CREATE: 'sales.create',
  SALES_VOID: 'sales.void',
  SALES_DISCOUNT_LINE: 'sales.discount.line',
  SALES_DISCOUNT_TOTAL: 'sales.discount.total',
  SALES_RETURN: 'sales.return',
  // Cash
  CASH_OPEN: 'cash.open',
  CASH_CLOSE: 'cash.close',
  CASH_WITHDRAW: 'cash.withdraw',
  CASH_DEPOSIT: 'cash.deposit',
  CASH_DRAWER_OPEN: 'cash.drawer.open',
  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_RECEIVE: 'inventory.receive',
  // Products
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',
  // Customers
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_MANAGE: 'customers.manage',
  // Reports
  REPORTS_X: 'reports.x',
  REPORTS_Z: 'reports.z',
  REPORTS_SALES: 'reports.sales',
  // Admin
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view'
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS)

export const DEFAULT_ROLES = {
  admin: {
    name: 'admin',
    description: 'Acceso completo al sistema',
    permissions: ALL_PERMISSIONS
  },
  manager: {
    name: 'manager',
    description: 'Gerente de tienda',
    permissions: [
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_VOID,
      PERMISSIONS.SALES_DISCOUNT_LINE,
      PERMISSIONS.SALES_DISCOUNT_TOTAL,
      PERMISSIONS.SALES_RETURN,
      PERMISSIONS.CASH_OPEN,
      PERMISSIONS.CASH_CLOSE,
      PERMISSIONS.CASH_WITHDRAW,
      PERMISSIONS.CASH_DEPOSIT,
      PERMISSIONS.CASH_DRAWER_OPEN,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_RECEIVE,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCTS_CREATE,
      PERMISSIONS.PRODUCTS_UPDATE,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_MANAGE,
      PERMISSIONS.REPORTS_X,
      PERMISSIONS.REPORTS_Z,
      PERMISSIONS.REPORTS_SALES,
      PERMISSIONS.AUDIT_VIEW
    ]
  },
  cashier: {
    name: 'cashier',
    description: 'Cajero',
    permissions: [
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.CASH_OPEN,
      PERMISSIONS.CASH_DRAWER_OPEN,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.REPORTS_X
    ]
  },
  inventory_clerk: {
    name: 'inventory_clerk',
    description: 'Inventario',
    permissions: [
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCTS_CREATE,
      PERMISSIONS.PRODUCTS_UPDATE,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_RECEIVE
    ]
  },
  auditor: {
    name: 'auditor',
    description: 'Solo lectura para auditoría',
    permissions: [
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.REPORTS_X,
      PERMISSIONS.REPORTS_Z,
      PERMISSIONS.REPORTS_SALES,
      PERMISSIONS.AUDIT_VIEW
    ]
  }
} as const
