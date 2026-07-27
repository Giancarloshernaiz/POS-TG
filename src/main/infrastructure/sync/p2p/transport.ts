import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import { logger } from '@main/logger'
import type { EventEnvelope } from './event-log'
import type { DiscoveredPeer } from './discovery'

// Transporte WebSocket entre cajas (§8.1, §23.5). Full-mesh: cada caja corre
// un server y se conecta como cliente a los peers descubiertos. Para evitar
// conexiones duplicadas entre el mismo par, solo el nodo con nodeId menor
// (lexicográfico) inicia la conexión saliente; el otro solo acepta entrante.

const PROTOCOL_VERSION = 1
const SCHEMA_VERSION = 1 // bump junto con cambios de shape del EventEnvelope
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

type HelloMessage = {
  type: 'HELLO'
  nodeId: string
  storeId: number
  nodeLabel: string
  appVersion: string
  schemaVersion: number
  protocolVersion: number
}
type EventMessage = { type: 'EVENT'; envelope: EventEnvelope }
// Anti-entropía (§8.3): "esto es lo más nuevo que tengo de cada nodo".
type HaveMessage = { type: 'HAVE'; have: Record<string, string> }
type WireMessage = HelloMessage | EventMessage | HaveMessage

type PeerConn = {
  nodeId: string
  nodeLabel: string
  socket: WebSocket
  helloReceived: boolean
}

export type TransportHandlers = {
  onPeerOnline: (nodeId: string, nodeLabel: string) => void
  onPeerOffline: (nodeId: string) => void
  onEvent: (envelope: EventEnvelope, fromNodeId: string) => void
  onSchemaMismatch: (nodeId: string, remoteSchemaVersion: number) => void
  onHave: (have: Record<string, string>, fromNodeId: string) => void
}

type SelfInfo = { nodeId: string; storeId: number; nodeLabel: string; appVersion: string }

let server: WebSocketServer | null = null
let self: SelfInfo | null = null
let handlers: TransportHandlers | null = null
const peers = new Map<string, PeerConn>() // nodeId -> conexión activa
const pendingPeers = new Map<string, DiscoveredPeer>() // último host:port conocido, para reconectar
const reconnectTimers = new Map<string, NodeJS.Timeout>()
const reconnectAttempts = new Map<string, number>()

function send(socket: WebSocket, msg: WireMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
}

function helloPayload(): HelloMessage {
  const s = self!
  return {
    type: 'HELLO',
    nodeId: s.nodeId,
    storeId: s.storeId,
    nodeLabel: s.nodeLabel,
    appVersion: s.appVersion,
    schemaVersion: SCHEMA_VERSION,
    protocolVersion: PROTOCOL_VERSION
  }
}

function clearReconnect(nodeId: string): void {
  const t = reconnectTimers.get(nodeId)
  if (t) clearTimeout(t)
  reconnectTimers.delete(nodeId)
}

function scheduleReconnect(peer: DiscoveredPeer): void {
  clearReconnect(peer.nodeId)
  const attempt = reconnectAttempts.get(peer.nodeId) ?? 0
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
  reconnectAttempts.set(peer.nodeId, attempt + 1)
  const timer = setTimeout(() => {
    if (pendingPeers.has(peer.nodeId) && !peers.has(peer.nodeId)) connectToPeer(peer)
  }, delay)
  reconnectTimers.set(peer.nodeId, timer)
}

function handleMessage(nodeId: string, raw: WireMessage): void {
  if (raw.type === 'HELLO') {
    if (raw.protocolVersion !== PROTOCOL_VERSION) {
      logger.warn({ nodeId, remote: raw.protocolVersion }, 'p2p: protocol mismatch, closing')
      peers.get(nodeId)?.socket.close()
      return
    }
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      // Degradar, no cortar: una caja desactualizada no debe bloquear la operación.
      handlers?.onSchemaMismatch(nodeId, raw.schemaVersion)
    }
    const conn = peers.get(nodeId)
    if (conn) {
      conn.helloReceived = true
      conn.nodeLabel = raw.nodeLabel
    }
    handlers?.onPeerOnline(nodeId, raw.nodeLabel)
    return
  }
  if (raw.type === 'EVENT') {
    handlers?.onEvent(raw.envelope, nodeId)
    return
  }
  if (raw.type === 'HAVE') {
    handlers?.onHave(raw.have, nodeId)
  }
}

function wireSocket(nodeId: string, nodeLabel: string, socket: WebSocket): void {
  const conn: PeerConn = { nodeId, nodeLabel, socket, helloReceived: false }
  peers.set(nodeId, conn)
  reconnectAttempts.delete(nodeId)
  clearReconnect(nodeId)

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as WireMessage
      handleMessage(nodeId, msg)
    } catch (e) {
      logger.warn({ err: e, nodeId }, 'p2p: mensaje inválido')
    }
  })
  socket.on('close', () => {
    peers.delete(nodeId)
    handlers?.onPeerOffline(nodeId)
    const peer = pendingPeers.get(nodeId)
    if (peer) scheduleReconnect(peer)
  })
  socket.on('error', (err) => {
    logger.warn({ err, nodeId }, 'p2p: socket error')
  })
}

function connectToPeer(peer: DiscoveredPeer): void {
  if (peers.has(peer.nodeId)) return
  const socket = new WebSocket(`ws://${peer.host}:${peer.port}`)
  wireSocket(peer.nodeId, peer.nodeLabel, socket)
  socket.on('open', () => send(socket, helloPayload()))
}

/** Registra un peer descubierto por mDNS y decide quién inicia la conexión. */
export function onPeerDiscovered(peer: DiscoveredPeer): void {
  pendingPeers.set(peer.nodeId, peer)
  if (self && self.nodeId < peer.nodeId && !peers.has(peer.nodeId)) {
    connectToPeer(peer)
  }
  // Si peer.nodeId < self.nodeId, esperamos su conexión entrante (server).
}

export function onPeerLost(nodeId: string): void {
  pendingPeers.delete(nodeId)
  clearReconnect(nodeId)
  reconnectAttempts.delete(nodeId)
  const conn = peers.get(nodeId)
  if (conn) {
    conn.socket.close()
    peers.delete(nodeId)
    handlers?.onPeerOffline(nodeId)
  }
}

export async function startTransport(
  selfInfo: SelfInfo,
  h: TransportHandlers,
  preferredPort = 0
): Promise<number> {
  self = selfInfo
  handlers = h
  return new Promise((resolve, reject) => {
    server = new WebSocketServer({ port: preferredPort })
    server.on('listening', () => {
      const addr = server!.address() as AddressInfo
      logger.info({ port: addr.port }, 'p2p: transport listening')
      resolve(addr.port)
    })
    server.on('error', (err) => {
      logger.error({ err }, 'p2p: server error')
      reject(err)
    })
    server.on('connection', (socket) => {
      // No sabemos el nodeId hasta el HELLO entrante. No registramos nada en
      // `peers` (ni el listener persistente de wireSocket) hasta confirmarlo:
      // hacerlo antes deja un listener 'message' colgado con un id temporal
      // que procesa cada mensaje por duplicado y atribuye eventos al peer
      // equivocado una vez llega el HELLO real (bug detectado en prueba viva).
      socket.once('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WireMessage
          if (msg.type === 'HELLO') {
            wireSocket(msg.nodeId, msg.nodeLabel, socket)
            send(socket, helloPayload())
            handleMessage(msg.nodeId, msg)
          } else {
            logger.warn('p2p: primer mensaje entrante no fue HELLO, cerrando')
            socket.close()
          }
        } catch (e) {
          logger.warn({ err: e }, 'p2p: HELLO inválido en conexión entrante')
          socket.close()
        }
      })
    })
  })
}

export function broadcastEvent(envelope: EventEnvelope): number {
  let sent = 0
  for (const conn of peers.values()) {
    if (conn.helloReceived && conn.socket.readyState === WebSocket.OPEN) {
      send(conn.socket, { type: 'EVENT', envelope })
      sent++
    }
  }
  return sent
}

export function sendEventTo(nodeId: string, envelope: EventEnvelope): boolean {
  const conn = peers.get(nodeId)
  if (!conn || !conn.helloReceived) return false
  send(conn.socket, { type: 'EVENT', envelope })
  return true
}

export function broadcastHave(have: Record<string, string>): void {
  for (const conn of peers.values()) {
    if (conn.helloReceived && conn.socket.readyState === WebSocket.OPEN) {
      send(conn.socket, { type: 'HAVE', have })
    }
  }
}

export function getConnectedPeers(): Array<{ nodeId: string; nodeLabel: string }> {
  return [...peers.values()]
    .filter((c) => c.helloReceived)
    .map((c) => ({ nodeId: c.nodeId, nodeLabel: c.nodeLabel }))
}

export function stopTransport(): void {
  for (const t of reconnectTimers.values()) clearTimeout(t)
  reconnectTimers.clear()
  reconnectAttempts.clear()
  pendingPeers.clear()
  for (const conn of peers.values()) conn.socket.close()
  peers.clear()
  server?.close()
  server = null
  self = null
  handlers = null
}
