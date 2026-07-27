import { app } from 'electron'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '@main/infrastructure/db/client'
import { peerState } from '@main/infrastructure/db/schema'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import { logger } from '@main/logger'
import { HlcClock, parseHlc, formatHlc } from './hlc'
import {
  appendEvent,
  applyRemoteEvent,
  getMaxHlcByNode,
  getEventsAfter,
  type EventEnvelope
} from './event-log'
import { startDiscovery, stopDiscovery } from './discovery'
import {
  startTransport,
  stopTransport,
  onPeerDiscovered,
  onPeerLost,
  broadcastEvent,
  broadcastHave,
  sendEventTo,
  getConnectedPeers
} from './transport'

// Orquestador del motor P2P intra-tienda (§8, §31.10 punto 1). Ata discovery
// + transporte + event log + HLC. Los reducers por aggregate.type (stock
// CRDT, seriales unique-claim, LWW de catálogo) son la siguiente iteración —
// hoy los eventos remotos quedan registrados en el log pero no mutan
// proyecciones todavía.

type PublishFn = (channel: string, payload: unknown) => void

let clock: HlcClock | null = null
let selfNodeId: string | null = null
let selfStoreId: number | null = null
let selfPort: number | null = null
let started = false
let publish: PublishFn = () => {}
let gossipTimer: NodeJS.Timeout | null = null

const GOSSIP_INTERVAL_MS = 5000
const CATCHUP_BATCH_LIMIT = 200

/** Anti-entropía (§8.3): responde a un HAVE mandando lo que el peer se perdió. */
function handleHave(have: Record<string, string>, fromNodeId: string): void {
  const mine = getMaxHlcByNode()
  const nodeIds = new Set([...Object.keys(mine), ...Object.keys(have)])
  for (const nodeId of nodeIds) {
    const theirs = have[nodeId] ?? null
    const ours = mine[nodeId]
    if (!ours) continue // no tenemos nada de ese nodo, nada que mandar
    if (theirs !== null && theirs >= ours) continue // ya está al día para ese nodo
    const missing = getEventsAfter(nodeId, theirs, CATCHUP_BATCH_LIMIT)
    for (const env of missing) sendEventTo(fromNodeId, env)
    if (missing.length > 0) {
      logger.info(
        { toNodeId: fromNodeId, fromNodeId: nodeId, count: missing.length },
        'p2p: catch-up enviado'
      )
    }
  }
}

function upsertPeerState(
  nodeId: string,
  nodeLabel: string | null,
  status: 'online' | 'offline'
): void {
  const db = getDb()
  const now = Date.now()
  const existing = db.select().from(peerState).where(eq(peerState.nodeId, nodeId)).get()
  if (existing) {
    db.update(peerState)
      .set({
        nodeLabel: nodeLabel ?? existing.nodeLabel,
        status,
        lastConnectedAt: status === 'online' ? now : existing.lastConnectedAt
      })
      .where(eq(peerState.nodeId, nodeId))
      .run()
  } else {
    db.insert(peerState)
      .values({
        nodeId,
        nodeLabel,
        status,
        lastConnectedAt: status === 'online' ? now : null
      })
      .run()
  }
}

function updateLastSeenHlc(nodeId: string, hlc: string): void {
  const db = getDb()
  db.update(peerState).set({ lastSeenHlc: hlc }).where(eq(peerState.nodeId, nodeId)).run()
}

export async function startP2p(publishFn: PublishFn = () => {}): Promise<void> {
  if (started) return
  publish = publishFn
  const identity = await getIdentity()
  if (!isProvisioned(identity) || identity.storeId === null) {
    logger.info('p2p: caja no vinculada, motor P2P no arranca todavía')
    return
  }

  clock = new HlcClock(identity.nodeId)
  selfNodeId = identity.nodeId
  selfStoreId = identity.storeId
  const storeId = identity.storeId

  const port = await startTransport(
    {
      nodeId: identity.nodeId,
      storeId,
      nodeLabel: identity.nodeLabel,
      appVersion: app.getVersion()
    },
    {
      onPeerOnline: (nodeId, nodeLabel) => {
        upsertPeerState(nodeId, nodeLabel, 'online')
        logger.info({ nodeId, nodeLabel }, 'p2p: peer online')
        publish('p2p.peersChanged', getP2pStatus())
      },
      onPeerOffline: (nodeId) => {
        upsertPeerState(nodeId, null, 'offline')
        logger.info({ nodeId }, 'p2p: peer offline')
        publish('p2p.peersChanged', getP2pStatus())
      },
      onEvent: (envelope, fromNodeId) => {
        clock!.receive(parseHlc(envelope.hlc))
        const result = applyRemoteEvent(envelope)
        if (result === 'applied') updateLastSeenHlc(fromNodeId, envelope.hlc)
      },
      onSchemaMismatch: (nodeId, remoteSchemaVersion) => {
        logger.warn({ nodeId, remoteSchemaVersion }, 'p2p: peer con schema distinto (degradado)')
      },
      onHave: handleHave
    }
  )

  selfPort = port

  if (gossipTimer) clearInterval(gossipTimer)
  gossipTimer = setInterval(() => broadcastHave(getMaxHlcByNode()), GOSSIP_INTERVAL_MS)

  startDiscovery(
    { nodeId: identity.nodeId, storeId, nodeLabel: identity.nodeLabel, port },
    { onUp: onPeerDiscovered, onDown: onPeerLost }
  )

  started = true
  logger.info({ nodeId: identity.nodeId, storeId, port }, 'p2p: motor iniciado')
}

export function stopP2p(): void {
  if (!started) return
  if (gossipTimer) {
    clearInterval(gossipTimer)
    gossipTimer = null
  }
  stopDiscovery()
  stopTransport()
  clock = null
  selfNodeId = null
  selfStoreId = null
  selfPort = null
  started = false
}

/**
 * Emite un evento local: lo persiste en el log (+ outbox) y lo transmite de
 * inmediato a los peers conectados (push-on-write, §8.3). El gossip de
 * anti-entropía para peers que estuvieron offline es la siguiente iteración.
 */
export function emitLocalEvent<T>(
  aggregateType: string,
  aggregateId: string,
  type: string,
  payload: T
): EventEnvelope<T> | null {
  if (!clock || !selfNodeId || selfStoreId === null) return null
  const hlc = clock.tick()
  const envelope: EventEnvelope<T> = {
    v: 1,
    id: ulid(),
    hlc: formatHlc(hlc),
    nodeId: selfNodeId,
    storeId: selfStoreId,
    aggregate: { type: aggregateType, id: aggregateId },
    type,
    payload,
    meta: { userId: null, deviceTs: Date.now(), appVersion: app.getVersion() }
  }
  appendEvent(envelope as EventEnvelope)
  const sent = broadcastEvent(envelope as EventEnvelope)
  logger.info({ id: envelope.id, type, sentTo: sent }, 'p2p: evento local emitido')
  return envelope
}

export type P2pStatus = {
  started: boolean
  nodeId: string | null
  port: number | null
  connectedPeers: Array<{ nodeId: string; nodeLabel: string }>
  knownPeers: Array<{
    nodeId: string
    nodeLabel: string | null
    status: 'online' | 'offline'
    lastConnectedAt: number | null
  }>
}

export function getP2pStatus(): P2pStatus {
  const db = getDb()
  const known = started ? db.select().from(peerState).all() : []
  return {
    started,
    nodeId: selfNodeId,
    port: selfPort,
    connectedPeers: started ? getConnectedPeers() : [],
    knownPeers: known.map((p) => ({
      nodeId: p.nodeId,
      nodeLabel: p.nodeLabel,
      status: p.status,
      lastConnectedAt: p.lastConnectedAt
    }))
  }
}
