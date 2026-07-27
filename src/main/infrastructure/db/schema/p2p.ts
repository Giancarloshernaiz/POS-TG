import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// Event log P2P entre cajas de una misma tienda (§8). Append-only; las
// proyecciones (stock_levels, sales, ...) son derivadas y reconstruibles.
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    hlc: text('hlc').notNull(),
    nodeId: text('node_id').notNull(),
    storeId: integer('store_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    originTs: integer('origin_ts').notNull(),
    appliedAt: integer('applied_at').notNull(),
    prevHash: text('prev_hash'),
    hash: text('hash')
  },
  (t) => [
    index('events_hlc_idx').on(t.hlc),
    index('events_aggregate_idx').on(t.aggregateType, t.aggregateId),
    index('events_node_idx').on(t.nodeId)
  ]
)

export const outbox = sqliteTable(
  'outbox',
  {
    eventId: text('event_id')
      .primaryKey()
      .references(() => events.id),
    status: text('status', { enum: ['pending', 'delivered'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: integer('last_attempt_at')
  },
  (t) => [index('outbox_status_idx').on(t.status)]
)

export const peerState = sqliteTable('peer_state', {
  nodeId: text('node_id').primaryKey(),
  nodeLabel: text('node_label'),
  lastSeenHlc: text('last_seen_hlc'),
  lastConnectedAt: integer('last_connected_at'),
  status: text('status', { enum: ['online', 'offline'] })
    .notNull()
    .default('offline')
})

// Cuarentena de conflictos de serial (§9.1) — doble-venta detectada por HLC.
export const serialConflicts = sqliteTable(
  'serial_conflicts',
  {
    id: text('id').primaryKey(),
    serialId: text('serial_id').notNull(),
    imei: text('imei').notNull(),
    localSaleId: text('local_sale_id'),
    localSaleNumber: text('local_sale_number'),
    winningNodeId: text('winning_node_id').notNull(),
    winningHlc: text('winning_hlc').notNull(),
    detectedAt: integer('detected_at').notNull(),
    resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
    resolvedBy: text('resolved_by'),
    resolvedAt: integer('resolved_at'),
    resolutionNotes: text('resolution_notes')
  },
  (t) => [index('serial_conflicts_resolved_idx').on(t.resolved)]
)
