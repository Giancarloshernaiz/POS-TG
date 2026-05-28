import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    lowStockThreshold: integer('low_stock_threshold'),
    discountType: text('discount_type', { enum: ['none', 'percent', 'amount'] })
      .notNull()
      .default('none'),
    discountValue: integer('discount_value').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('categories_name_parent_idx').on(t.parentId, t.name),
    index('categories_parent_idx').on(t.parentId)
  ]
)

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: text('category_id').references(() => categories.id),
    basePrice: integer('base_price').notNull(),
    costPrice: integer('cost_price'),
    taxRateBp: integer('tax_rate_bp').notNull().default(0),
    tracksSerial: integer('tracks_serial', { mode: 'boolean' }).notNull().default(false),
    lowStockThreshold: integer('low_stock_threshold'),
    discountType: text('discount_type', { enum: ['none', 'percent', 'amount'] })
      .notNull()
      .default('none'),
    discountValue: integer('discount_value').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('products_sku_idx').on(t.sku),
    index('products_barcode_idx').on(t.barcode),
    index('products_category_active_idx').on(t.categoryId, t.active),
    index('products_name_idx').on(t.name)
  ]
)

export const stockLevels = sqliteTable(
  'stock_levels',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    locationId: text('location_id').notNull().default('main'),
    quantity: integer('quantity').notNull().default(0),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('stock_levels_pk').on(t.productId, t.locationId),
    index('stock_levels_low_idx').on(t.quantity)
  ]
)

export const serials = sqliteTable(
  'serials',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    imei: text('imei').notNull(),
    status: text('status', {
      enum: ['available', 'reserved', 'sold', 'returned', 'defective']
    }).notNull(),
    currentSaleId: text('current_sale_id'),
    locationId: text('location_id').notNull().default('main'),
    receivedAt: integer('received_at').notNull(),
    receivedVia: text('received_via'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('serials_imei_idx').on(t.imei),
    index('serials_product_status_idx').on(t.productId, t.status),
    index('serials_status_location_idx').on(t.status, t.locationId),
    index('serials_sale_idx').on(t.currentSaleId)
  ]
)
