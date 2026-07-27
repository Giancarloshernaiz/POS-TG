import { Bonjour, type Service, type Browser } from 'bonjour-service'
import { logger } from '@main/logger'

// Descubrimiento de cajas en la LAN (§8.1). Cada caja anuncia un servicio
// mDNS con su nodeId/storeId en el txt record; solo nos interesan pares de
// la MISMA tienda (filtrado aquí, no a nivel de mDNS).

const SERVICE_TYPE = 'pos-tg-sync'

export type DiscoveredPeer = {
  nodeId: string
  storeId: number
  nodeLabel: string
  host: string
  port: number
}

export type DiscoveryHandlers = {
  onUp: (peer: DiscoveredPeer) => void
  onDown: (nodeId: string) => void
}

type SelfInfo = { nodeId: string; storeId: number; nodeLabel: string; port: number }

let bonjour: Bonjour | null = null
let browser: Browser | null = null

function readTxt(service: Service): { nodeId?: string; storeId?: string; nodeLabel?: string } {
  return (service.txt ?? {}) as { nodeId?: string; storeId?: string; nodeLabel?: string }
}

export function startDiscovery(self: SelfInfo, handlers: DiscoveryHandlers): void {
  if (bonjour) stopDiscovery()

  bonjour = new Bonjour(undefined, (err) => {
    logger.warn({ err }, 'p2p: bonjour error')
  })

  bonjour.publish({
    name: `pos-tg-${self.nodeId}`,
    type: SERVICE_TYPE,
    port: self.port,
    txt: { nodeId: self.nodeId, storeId: String(self.storeId), nodeLabel: self.nodeLabel }
  })

  browser = bonjour.find({ type: SERVICE_TYPE }, (service) => {
    const txt = readTxt(service)
    if (!txt.nodeId || txt.nodeId === self.nodeId) return // ignora nuestro propio anuncio
    if (Number(txt.storeId) !== self.storeId) return // otra tienda, ignorar

    const host = service.addresses?.find((a) => !a.includes(':')) ?? service.host
    if (!host) return
    handlers.onUp({
      nodeId: txt.nodeId,
      storeId: Number(txt.storeId),
      nodeLabel: txt.nodeLabel ?? txt.nodeId,
      host,
      port: service.port
    })
  })

  browser.on('down', (service: Service) => {
    const txt = readTxt(service)
    if (txt.nodeId) handlers.onDown(txt.nodeId)
  })

  logger.info(
    { nodeId: self.nodeId, storeId: self.storeId, port: self.port },
    'p2p: discovery started'
  )
}

export function stopDiscovery(): void {
  browser?.stop()
  browser = null
  if (bonjour) {
    const b = bonjour
    bonjour = null
    b.unpublishAll(() => b.destroy())
  }
}
