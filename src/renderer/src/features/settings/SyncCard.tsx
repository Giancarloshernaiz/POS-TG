import {
  RefreshCw,
  Loader2,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Crown,
  Link2Off
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  useDeviceIdentity,
  useSyncStatus,
  usePullFromAgro,
  useRetryPush,
  useCatalogHealth,
  useReconcileCatalog
} from './hooks'

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Sincronización con el máster AgroOne — pull de catálogo, existencias,
// clientes y tasa BCV (plan §31.5, Capa B).
export function SyncCard(): React.JSX.Element {
  const { data: identity } = useDeviceIdentity()
  const { data: status } = useSyncStatus()
  const { data: health } = useCatalogHealth()
  const pull = usePullFromAgro()
  const retryPush = useRetryPush()
  const reconcile = useReconcileCatalog()

  const last = status?.lastPull ?? null
  const push = status?.push ?? null
  const leader = status?.uplinkLeader ?? null
  const provisioned = !!identity && identity.storeId !== null && identity.provisionedAt !== null

  async function handlePull(): Promise<void> {
    try {
      const s = await pull.mutateAsync()
      toast.success(
        `Sincronizado: ${s.products} productos, ${s.stock} existencias, ${s.customers} clientes`
      )
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        NOT_PROVISIONED: 'Vincula la caja con AgroOne primero',
        AGRO_UNREACHABLE: 'AgroOne no responde. Revisa la conexión.',
        FORBIDDEN: 'Sin permiso'
      }
      toast.error(human[code] ?? `No se pudo sincronizar: ${code}`)
    }
  }

  async function handleReconcile(): Promise<void> {
    try {
      const r = await reconcile.mutateAsync()
      if (r.mapeados.length === 0 && r.fusionados.length === 0 && r.sinCorrespondencia.length === 0) {
        toast.success('Todo el catálogo local ya está mapeado con AgroOne')
        return
      }
      const partes = [`${r.mapeados.length} producto(s) vinculado(s)`]
      if (r.fusionados.length > 0) {
        partes.push(`${r.fusionados.length} duplicado(s) fusionado(s)`)
      }
      if (r.ventasReintentadas > 0) partes.push(`${r.ventasReintentadas} venta(s) reintentada(s)`)
      if (r.sinCorrespondencia.length > 0) {
        partes.push(`${r.sinCorrespondencia.length} sin equivalente en el máster`)
      }
      const msg = partes.join(', ')
      if (r.sinCorrespondencia.length > 0) toast.warning(msg)
      else toast.success(msg)
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        NOT_PROVISIONED: 'Vincula la caja con AgroOne primero',
        AGRO_UNREACHABLE: 'AgroOne no responde. Revisa la conexión.',
        FORBIDDEN: 'Sin permiso'
      }
      toast.error(human[code] ?? `No se pudo reconciliar: ${code}`)
    }
  }

  async function handleRetryPush(): Promise<void> {
    try {
      const r = await retryPush.mutateAsync()
      toast.success(
        r.retried > 0 ? `Reintentadas ${r.retried} ventas` : 'No había ventas pendientes'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Sincronización con AgroOne
            </CardTitle>
            <CardDescription>
              Baja catálogo, existencias de tu tienda, clientes y tasa BCV desde el máster.
            </CardDescription>
            {leader?.leaderNodeId && (
              <Badge variant={leader.isLeader ? 'default' : 'outline'} className="mt-2 gap-1">
                <Crown className="h-3 w-3" />
                {leader.isLeader
                  ? 'Esta caja es líder de sincronización'
                  : `Líder: ${leader.leaderNodeLabel ?? leader.leaderNodeId.slice(0, 8)}`}
              </Badge>
            )}
          </div>
          <Button onClick={() => void handlePull()} disabled={!provisioned || pull.isPending}>
            {pull.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar ahora
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!provisioned ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
            <CloudOff className="h-4 w-4" /> Caja sin vincular. Configura la vinculación con AgroOne
            arriba para poder sincronizar.
          </div>
        ) : last ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Última sincronización: <strong>{formatWhen(last.at)}</strong>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Productos" value={last.products} />
              <Stat label="Existencias" value={last.stock} />
              <Stat label="Clientes" value={last.customers} />
              <Stat label="Categorías" value={last.categories} />
            </div>
            {last.rateUpdated && (
              <p className="text-xs text-muted-foreground">Tasa BCV actualizada desde el máster.</p>
            )}
          </div>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            Aún no has sincronizado. Pulsa «Sincronizar ahora» para bajar el catálogo.
          </p>
        )}

        {provisioned && health && health.productosSinMapeo > 0 && (
          <div className="mt-4 space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2Off className="h-4 w-4 text-destructive" />
                <span>
                  <strong>{health.productosSinMapeo}</strong> producto
                  {health.productosSinMapeo === 1 ? '' : 's'} sin vincular a AgroOne
                  {health.ventasBloqueadas > 0 && (
                    <>
                      {' '}
                      — bloquea<strong> {health.ventasBloqueadas}</strong> venta
                      {health.ventasBloqueadas === 1 ? '' : 's'}
                    </>
                  )}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleReconcile()}
                disabled={reconcile.isPending}
              >
                {reconcile.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Reconciliar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Son productos creados en esta caja antes de que el catálogo pasara a administrarse
              solo desde el Centro de Acopio. Mientras no estén vinculados, las ventas que los
              incluyan no pueden subir al máster. La reconciliación los busca por código de barras y
              por SKU; los que no existan allá hay que darlos de alta en AgroOne.
            </p>
            <div className="space-y-1">
              {health.orphans.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span>
                    <Badge variant="outline" className="mr-1">
                      {o.sku}
                    </Badge>
                    {o.name}
                    {o.ventasBloqueadas > 0 && ` — ${o.ventasBloqueadas} venta(s) trabada(s)`}
                  </span>
                </div>
              ))}
              {health.orphans.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  …y {health.orphans.length - 5} más
                </p>
              )}
            </div>
          </div>
        )}

        {provisioned && push && (push.pending > 0 || push.errors.length > 0) && (
          <div className="mt-4 space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                <span>
                  <strong>{push.pending}</strong> venta{push.pending === 1 ? '' : 's'} pendiente
                  {push.pending === 1 ? '' : 's'} de subir a AgroOne
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRetryPush()}
                disabled={retryPush.isPending}
              >
                {retryPush.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Reintentar
              </Button>
            </div>
            {push.errors.length > 0 && (
              <div className="space-y-1">
                {push.errors.map((e) => (
                  <div
                    key={e.saleId}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>
                      <Badge variant="outline" className="mr-1">
                        {e.saleNumber}
                      </Badge>
                      {e.lastError ?? 'error desconocido'}
                    </span>
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

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
