import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './users'
import { products } from './catalog'

export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    fiscalType: text('fiscal_type', { enum: ['ordinario', 'especial', 'formal'] }),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [uniqueIndex('suppliers_name_idx').on(t.name)]
)

export const purchaseOrders = sqliteTable(
  'purchase_orders',
  {
    id: text('id').primaryKey(),
    number: text('number').notNull(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    status: text('status', {
      enum: ['draft', 'submitted', 'partial', 'received', 'closed', 'cancelled']
    }).notNull(),
    expectedAt: integer('expected_at'),
    notes: text('notes'),
    totalAmount: integer('total_amount').notNull().default(0),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    submittedAt: integer('submitted_at'),
    receivedAt: integer('received_at'),
    closedAt: integer('closed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('po_number_idx').on(t.number),
    index('po_supplier_status_idx').on(t.supplierId, t.status),
    index('po_status_idx').on(t.status),
    index('po_created_idx').on(t.createdAt)
  ]
)

export const poLines = sqliteTable(
  'po_lines',
  {
    id: text('id').primaryKey(),
    poId: text('po_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qtyOrdered: integer('qty_ordered').notNull(),
    qtyReceived: integer('qty_received').notNull().default(0),
    unitCost: integer('unit_cost').notNull(),
    lineTotal: integer('line_total').notNull()
  },
  (t) => [index('po_lines_po_idx').on(t.poId), index('po_lines_product_idx').on(t.productId)]
)

export const goodsReceipts = sqliteTable(
  'goods_receipts',
  {
    id: text('id').primaryKey(),
    number: text('number').notNull(),
    poId: text('po_id')
      .notNull()
      .references(() => purchaseOrders.id),
    receivedBy: text('received_by')
      .notNull()
      .references(() => users.id),
    ts: integer('ts').notNull(),
    notes: text('notes')
  },
  (t) => [
    uniqueIndex('gr_number_idx').on(t.number),
    index('gr_po_idx').on(t.poId),
    index('gr_ts_idx').on(t.ts)
  ]
)

export const goodsReceiptLines = sqliteTable(
  'goods_receipt_lines',
  {
    id: text('id').primaryKey(),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
    poLineId: text('po_line_id')
      .notNull()
      .references(() => poLines.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull()
  },
  (t) => [index('grl_receipt_idx').on(t.receiptId), index('grl_poline_idx').on(t.poLineId)]
)
