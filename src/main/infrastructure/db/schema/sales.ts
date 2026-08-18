import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './users'
import { cashSessions } from './cash'
import { customers } from './customers'
import { products, serials } from './catalog'
import { sellers } from './sellers'

export const sales = sqliteTable(
  'sales',
  {
    id: text('id').primaryKey(),
    number: text('number').notNull(),
    customerId: text('customer_id').references(() => customers.id),
    // Comisionista atribuido a la venta. Lo define Galas Cloud; null si no aplica.
    sellerId: text('seller_id').references(() => sellers.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    cashSessionId: text('cash_session_id')
      .notNull()
      .references(() => cashSessions.id),
    status: text('status', { enum: ['completed', 'voided'] }).notNull(),
    subtotal: integer('subtotal').notNull(),
    discountTotal: integer('discount_total').notNull().default(0),
    usdDiscountTotal: integer('usd_discount_total').notNull().default(0),
    usdDiscountRateBp: integer('usd_discount_rate_bp').notNull().default(0),
    creditApplied: integer('credit_applied').notNull().default(0),
    fidelityApplied: integer('fidelity_applied').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    igtfTotal: integer('igtf_total').notNull().default(0),
    total: integer('total').notNull(),
    rateUsed: real('rate_used'),
    notes: text('notes'),
    returnStatus: text('return_status', { enum: ['pending', 'approved', 'rejected'] }),
    returnRequestId: integer('return_request_id'),
    createdAt: integer('created_at').notNull(),
    voidedAt: integer('voided_at'),
    voidedBy: text('voided_by').references(() => users.id)
  },
  (t) => [
    uniqueIndex('sales_number_idx').on(t.number),
    index('sales_session_idx').on(t.cashSessionId),
    index('sales_customer_idx').on(t.customerId),
    index('sales_created_idx').on(t.createdAt),
    index('sales_status_idx').on(t.status),
    index('sales_seller_idx').on(t.sellerId)
  ]
)

export const saleLines = sqliteTable(
  'sale_lines',
  {
    id: text('id').primaryKey(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    serialId: text('serial_id').references(() => serials.id),
    sku: text('sku').notNull(),
    description: text('description').notNull(),
    qty: integer('qty').notNull(),
    unitPrice: integer('unit_price').notNull(),
    discountAmount: integer('discount_amount').notNull().default(0),
    taxRateBp: integer('tax_rate_bp').notNull().default(0),
    lineSubtotal: integer('line_subtotal').notNull(),
    lineTax: integer('line_tax').notNull().default(0),
    lineTotal: integer('line_total').notNull()
  },
  (t) => [
    index('sale_lines_sale_idx').on(t.saleId),
    index('sale_lines_product_idx').on(t.productId),
    index('sale_lines_serial_idx').on(t.serialId)
  ]
)

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    method: text('method', {
      enum: ['cash_ves', 'cash_usd', 'card', 'pago_movil', 'transfer', 'zelle', 'credit']
    }).notNull(),
    currency: text('currency', { enum: ['USD', 'VES'] }).notNull(),
    isDivisa: integer('is_divisa', { mode: 'boolean' }).notNull().default(false),
    amountUsd: integer('amount_usd').notNull(),
    amountOriginal: real('amount_original'),
    igtf: integer('igtf').notNull().default(0),
    reference: text('reference'),
    capturedAt: integer('captured_at').notNull()
  },
  (t) => [index('payments_sale_idx').on(t.saleId), index('payments_method_idx').on(t.method)]
)
