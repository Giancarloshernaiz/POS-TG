import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    before: text('before', { mode: 'json' }),
    after: text('after', { mode: 'json' }),
    ts: integer('ts').notNull(),
    ip: text('ip'),
    nodeId: text('node_id')
  },
  (t) => [
    index('audit_log_user_idx').on(t.userId),
    index('audit_log_action_idx').on(t.action),
    index('audit_log_ts_idx').on(t.ts),
    index('audit_log_target_idx').on(t.targetType, t.targetId)
  ]
)
