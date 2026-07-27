import { eq, asc, sql, and, gt } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { events, outbox } from '@main/infrastructure/db/schema'
import { logger } from '@main/logger'
import { applyStockDelta } from './reducers/stock.reducer'
import {
  applyProductUpsert,
  applyCustomerUpsert,
  applyCategoryUpsert
} from './reducers/catalog.reducer'
import { applySerialSold, applySerialReturned } from './reducers/serial.reducer'

// Event log append-only (§8.2). Cada escritura de negocio que deba
// propagarse a otras cajas emite un EventEnvelope aquí, en la misma
// transacción que su proyección local. El outbox desacopla el envío.

export type EventEnvelope<T = unknown> = {
  v: 1
  id: string // ULID, clave de idempotencia
  hlc: string
  nodeId: string
  storeId: number
  aggregate: { type: string; id: string }
  type: string
  payload: T
  meta: { userId: string | null; deviceTs: number; appVersion: string }
}

/** Inserta el evento + su fila de outbox. Idempotente por id (ON CONFLICT ignora). */
export function appendEvent(env: EventEnvelope): void {
  const db = getDb()
  const now = Date.now()
  db.insert(events)
    .values({
      id: env.id,
      hlc: env.hlc,
      nodeId: env.nodeId,
      storeId: env.storeId,
      aggregateType: env.aggregate.type,
      aggregateId: env.aggregate.id,
      type: env.type,
      payload: JSON.stringify(env.payload),
      originTs: env.meta.deviceTs,
      appliedAt: now
    })
    .onConflictDoNothing()
    .run()
  db.insert(outbox).values({ eventId: env.id }).onConflictDoNothing().run()
}

export function hasEvent(id: string): boolean {
  const db = getDb()
  return !!db.select({ id: events.id }).from(events).where(eq(events.id, id)).get()
}

function rowToEnvelope(row: typeof events.$inferSelect): EventEnvelope {
  return {
    v: 1,
    id: row.id,
    hlc: row.hlc,
    nodeId: row.nodeId,
    storeId: row.storeId,
    aggregate: { type: row.aggregateType, id: row.aggregateId },
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    meta: { userId: null, deviceTs: row.originTs, appVersion: '' }
  }
}

/** Aplica el reducer correspondiente al aggregate.type del evento (§8.4). */
function runReducer(env: EventEnvelope): void {
  const ts = env.meta.deviceTs
  try {
    switch (env.aggregate.type) {
      case 'stock_level':
        applyStockDelta(env.aggregate.id, env.payload as { delta: number }, ts)
        break
      case 'product':
        applyProductUpsert(
          env.aggregate.id,
          env.payload as Parameters<typeof applyProductUpsert>[1],
          env.hlc,
          ts
        )
        break
      case 'customer':
        applyCustomerUpsert(
          env.aggregate.id,
          env.payload as Parameters<typeof applyCustomerUpsert>[1],
          env.hlc,
          ts
        )
        break
      case 'category':
        applyCategoryUpsert(
          env.aggregate.id,
          env.payload as Parameters<typeof applyCategoryUpsert>[1],
          env.hlc,
          ts
        )
        break
      case 'serial':
        if (env.type === 'serial.returned') {
          applySerialReturned(env.payload as Parameters<typeof applySerialReturned>[0], env.hlc, ts)
        } else {
          applySerialSold(
            env.nodeId,
            env.payload as Parameters<typeof applySerialSold>[1],
            env.hlc,
            ts
          )
        }
        break
      default:
        logger.warn(
          { type: env.aggregate.type },
          'p2p: aggregate.type sin reducer, evento solo queda en el log'
        )
    }
  } catch (e) {
    logger.error(
      { err: e, id: env.id, aggregateType: env.aggregate.type },
      'p2p: reducer falló al aplicar evento'
    )
  }
}

/** Aplica un evento recibido de un peer: idempotente, ignora si ya lo tenemos. */
export function applyRemoteEvent(env: EventEnvelope): 'applied' | 'duplicate' {
  if (hasEvent(env.id)) return 'duplicate'
  const db = getDb()
  db.insert(events)
    .values({
      id: env.id,
      hlc: env.hlc,
      nodeId: env.nodeId,
      storeId: env.storeId,
      aggregateType: env.aggregate.type,
      aggregateId: env.aggregate.id,
      type: env.type,
      payload: JSON.stringify(env.payload),
      originTs: env.meta.deviceTs,
      appliedAt: Date.now()
    })
    .onConflictDoNothing()
    .run()
  runReducer(env)
  return 'applied'
}

export type OutboxItem = { eventId: string; envelope: EventEnvelope; attempts: number }

/** Eventos pendientes de entregar a los peers, en orden de creación. */
export function getPendingOutbox(limit = 100): OutboxItem[] {
  const db = getDb()
  const rows = db
    .select({ e: events, o: outbox })
    .from(outbox)
    .innerJoin(events, eq(events.id, outbox.eventId))
    .where(eq(outbox.status, 'pending'))
    .orderBy(asc(events.appliedAt))
    .limit(limit)
    .all()
  return rows.map((r) => ({
    eventId: r.o.eventId,
    envelope: rowToEnvelope(r.e),
    attempts: r.o.attempts
  }))
}

export function markOutboxAttempt(eventId: string): void {
  const db = getDb()
  db.update(outbox)
    .set({ attempts: sql`${outbox.attempts} + 1`, lastAttemptAt: Date.now() })
    .where(eq(outbox.eventId, eventId))
    .run()
}

export function markDelivered(eventId: string): void {
  const db = getDb()
  db.update(outbox).set({ status: 'delivered' }).where(eq(outbox.eventId, eventId)).run()
}

/** El HLC más nuevo que tenemos por cada nodo origen (para el HAVE del gossip anti-entropía, §8.3). */
export function getMaxHlcByNode(): Record<string, string> {
  const db = getDb()
  const rows = db
    .select({ nodeId: events.nodeId, hlc: sql<string>`MAX(${events.hlc})` })
    .from(events)
    .groupBy(events.nodeId)
    .all()
  const out: Record<string, string> = {}
  for (const r of rows) out[r.nodeId] = r.hlc
  return out
}

/** Eventos de un nodo con hlc > afterHlc (catch-up de un peer que estuvo offline, §8.3). */
export function getEventsAfter(
  nodeId: string,
  afterHlc: string | null,
  limit = 200
): EventEnvelope[] {
  const db = getDb()
  const rows = afterHlc
    ? db
        .select()
        .from(events)
        .where(and(eq(events.nodeId, nodeId), gt(events.hlc, afterHlc)))
        .orderBy(asc(events.hlc))
        .limit(limit)
        .all()
    : db
        .select()
        .from(events)
        .where(eq(events.nodeId, nodeId))
        .orderBy(asc(events.hlc))
        .limit(limit)
        .all()
  return rows.map(rowToEnvelope)
}
