import { getIdentity } from '@main/infrastructure/device/identity.service'
import { getP2pStatus } from '@main/infrastructure/sync/p2p/p2p.service'

// Elección de líder-uplink entre cajas de una tienda (§31.10.4). Determinista
// y sin estado propio: gana el nodeId menor entre los peers P2P conectados
// en este instante, recalculado en cada llamada — se re-elige solo con la
// próxima caída/reconexión, sin protocolo de consenso ni coordinación extra.
//
// Solo protege escrituras GLOBALES/compartidas hacia Galas Cloud (hoy: la
// creación de "Consumidor Final"). El push de ventas propias NO se gatea:
// cada caja solo ve y empuja sus propias ventas (no hay replicación
// cross-nodo de ventas todavía), así que ahí no existe riesgo de duplicado.

export function isUplinkLeader(): boolean {
  const status = getP2pStatus()
  if (!status.nodeId) return true // P2P no arrancó (single-caja o sin provisionar): actúa sola
  const ids = [status.nodeId, ...status.connectedPeers.map((p) => p.nodeId)]
  return ids.sort()[0] === status.nodeId
}

export type UplinkLeaderInfo = {
  isLeader: boolean
  leaderNodeId: string | null
  leaderNodeLabel: string | null
}

export async function getUplinkLeaderInfo(): Promise<UplinkLeaderInfo> {
  const status = getP2pStatus()
  if (!status.nodeId) return { isLeader: true, leaderNodeId: null, leaderNodeLabel: null }
  const self = await getIdentity()
  const candidates = [
    { nodeId: status.nodeId, nodeLabel: self.nodeLabel },
    ...status.connectedPeers
  ]
  const leader = [...candidates].sort((a, b) => a.nodeId.localeCompare(b.nodeId))[0]!
  return {
    isLeader: leader.nodeId === status.nodeId,
    leaderNodeId: leader.nodeId,
    leaderNodeLabel: leader.nodeLabel
  }
}
