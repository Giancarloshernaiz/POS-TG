import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    docType: text('doc_type', { enum: ['V', 'E', 'J', 'P', 'G'] }),
    docId: text('doc_id'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    creditLimit: integer('credit_limit').notNull().default(0),
    currentBalance: integer('current_balance').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [index('customers_name_idx').on(t.name), index('customers_doc_idx').on(t.docType, t.docId)]
)

export const arMovements = sqliteTable(
  'ar_movements',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    saleId: text('sale_id'),
    type: text('type', { enum: ['charge', 'payment', 'adjustment'] }).notNull(),
    amount: integer('amount').notNull(),
    notes: text('notes'),
    ts: integer('ts').notNull(),
    userId: text('user_id')
  },
  (t) => [index('ar_customer_idx').on(t.customerId), index('ar_ts_idx').on(t.ts)]
)
