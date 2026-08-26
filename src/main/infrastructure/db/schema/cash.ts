import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { users } from './users'

export const cashSessions = sqliteTable(
  'cash_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    openedAt: integer('opened_at').notNull(),
    closedAt: integer('closed_at'),
    openingAmount: integer('opening_amount').notNull(),
    openingVes: real('opening_ves').notNull().default(0),
    closingAmount: integer('closing_amount'),
    closingVes: real('closing_ves'),
    expectedAmount: integer('expected_amount'),
    expectedVes: real('expected_ves'),
    overShortAmount: integer('over_short_amount'),
    overShortVes: real('over_short_ves'),
    status: text('status', { enum: ['open', 'closed', 'reconciled'] }).notNull(),
    notes: text('notes')
  },
  (t) => [
    index('cash_sessions_user_idx').on(t.userId),
    index('cash_sessions_status_idx').on(t.status),
    index('cash_sessions_opened_idx').on(t.openedAt)
  ]
)

export const cashMovements = sqliteTable(
  'cash_movements',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => cashSessions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type', {
      enum: ['sale', 'refund', 'withdrawal', 'deposit', 'adjustment', 'drop']
    }).notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency', { enum: ['USD', 'VES'] }).notNull().default('USD'),
    amountOriginal: real('amount_original'),
    reference: text('reference'),
    notes: text('notes'),
    ts: integer('ts').notNull()
  },
  (t) => [
    index('cash_movements_session_idx').on(t.sessionId),
    index('cash_movements_ts_idx').on(t.ts)
  ]
)
