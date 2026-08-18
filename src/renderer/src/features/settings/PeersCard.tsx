import { Radio, Wifi, WifiOff, Loader2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { useP2pStatus, useDeviceIdentity } from './hooks'

function formatWhen(ms: number | null): string {
  if (ms === null) return 'nunca'
  return new Date(ms).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Estado del motor P2P entre cajas de esta tienda (plan §8, §31.10).
export function PeersCard(): React.JSX.Element {
  const { data: identity } = useDeviceIdentity()
  const { data: status, isLoading } = useP2pStatus()

  const provisioned = !!identity && identity.storeId !== null && identity.provisionedAt !== null
  const onlineCount = status?.connectedPeers.length ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-4 w-4" /> Cajas en la red
        </CardTitle>
        <CardDescription>
          Otras cajas de esta tienda detectadas en la red local (LAN). Sincronizan ventas,
          existencias y seriales entre sí, sin depender de internet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!provisioned ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
            <WifiOff className="h-4 w-4" /> Vincula esta caja con Galas Cloud primero para identificar
            su tienda.
          </div>
        ) : isLoading || !status ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando red…
          </div>
        ) : !status.started ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
            <WifiOff className="h-4 w-4" /> Motor P2P detenido.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {onlineCount > 0 ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span>
                <strong>{onlineCount}</strong> caja{onlineCount === 1 ? '' : 's'} conectada
                {onlineCount === 1 ? '' : 's'} ahora
              </span>
            </div>

            {status.knownPeers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no se ha detectado otra caja de esta tienda en la red.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {status.knownPeers.map((p) => (
                  <div key={p.nodeId} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{p.nodeLabel ?? p.nodeId}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        …{p.nodeId.slice(-8)}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={p.status === 'online' ? 'success' : 'secondary'}>
                        {p.status === 'online' ? 'En línea' : 'Desconectada'}
                      </Badge>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.status === 'online'
                          ? 'ahora'
                          : `últ. vez ${formatWhen(p.lastConnectedAt)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
