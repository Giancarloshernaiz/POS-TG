import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
    // Descuento especial del cliente en basis points (100 = 1%), espejo de
    // Clientes.descuento_especial en AgroOne. No se aplica aún automáticamente
    // en el pricing de venta (§ver CLAUDE memory / conversación).
    specialDiscountBp: integer('special_discount_bp').notNull().default(0),
    /** Saldo total informado por AgroOne: devoluciones + recompensa de fidelidad. */
    favorBalance: integer('favor_balance').notNull().default(0),
    returnCreditBalance: integer('return_credit_balance').notNull().default(0),
    fidelityBalance: integer('fidelity_balance').notNull().default(0),
    fidelityAccumulated: integer('fidelity_accumulated').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    agroId: integer('agro_id'),
    lwwHlc: text('lww_hlc'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('customers_name_idx').on(t.name),
    index('customers_doc_idx').on(t.docType, t.docId),
    uniqueIndex('customers_agro_idx').on(t.agroId)
  ]
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
