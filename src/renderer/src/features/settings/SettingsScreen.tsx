import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { useAuth } from '@renderer/stores/auth'
import { useFx } from '@renderer/stores/fx'
import { formatRate } from '@renderer/lib/money'
import { useLowStockGlobal, useSetLowStockGlobal, useRefreshFx, useSetManualFx } from './hooks'
import { StoreProfileCard } from './StoreProfileCard'
import { PrinterCard } from './PrinterCard'
import { IgtfCard } from './IgtfCard'
import { BackupCard } from './BackupCard'

const SOURCE_LABEL: Record<string, string> = {
  api: 'API (dolarapi)',
  bcv: 'BCV (scrape)',
  manual: 'Manual'
}

export function SettingsScreen(): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const canManage = useAuth((s) => s.hasPermission('settings.manage'))
  const rate = useFx((s) => s.rate)
  const setRateStore = useFx((s) => s.setRate)

  const { data: lowStock } = useLowStockGlobal()
  const setLowStock = useSetLowStockGlobal()
  const refreshFx = useRefreshFx()
  const setManualFx = useSetManualFx()

  const [thresholdEdit, setThresholdEdit] = useState<number | null>(null)
  const [manualRate, setManualRate] = useState<string>('')
  const [now, setNow] = useState<number>(() => Date.now())

  // null = mostrar el valor del servidor; al editar pasa a número local.
  const thresholdInput = thresholdEdit ?? lowStock?.threshold ?? 5

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  async function handleRefresh(): Promise<void> {
    if (!session) return
    try {
      const r = await refreshFx.mutateAsync({ sessionId: session.id })
      setRateStore(r)
      toast.success(`Tasa actualizada: ${formatRate(r.rate)}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'FX_FETCH_FAILED' ? 'No se pudo obtener la tasa (sin internet?)' : msg)
    }
  }

  async function handleManualRate(): Promise<void> {
    if (!session) return
    const r = parseFloat(manualRate)
    if (!Number.isFinite(r) || r <= 0) {
      toast.error('Tasa inválida')
      return
    }
    try {
      const res = await setManualFx.mutateAsync({ sessionId: session.id, rate: r })
      setRateStore(res)
      setManualRate('')
      toast.success('Tasa manual aplicada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleSaveThreshold(): Promise<void> {
    if (!session) return
    try {
      await setLowStock.mutateAsync({ sessionId: session.id, threshold: thresholdInput })
      toast.success('Umbral global guardado')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'FORBIDDEN' ? 'Sin permiso' : msg)
    }
  }

  const rateAgeHours = rate ? Math.floor((now - rate.fetchedAt) / 3_600_000) : null
  const stale = rateAgeHours !== null && rateAgeHours >= 24

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Configuración</h2>
        <p className="text-sm text-muted-foreground">
          Datos fiscales, tasa de cambio y parámetros de inventario.
        </p>
      </div>

      <StoreProfileCard />
      <PrinterCard />
      {canManage && <BackupCard />}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tasa de cambio BCV</CardTitle>
            <CardDescription>USD → VES. Se actualiza al abrir y cada 6 horas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <div className="text-2xl font-bold">{formatRate(rate?.rate ?? null)}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {rate && <Badge variant="secondary">{SOURCE_LABEL[rate.source]}</Badge>}
                  {rate && <span>{rateAgeHours === 0 ? 'hace <1h' : `hace ${rateAgeHours}h`}</span>}
                  {stale && <Badge variant="warning">desactualizada</Badge>}
                  {!rate && <span>sin tasa todavía</span>}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => void handleRefresh()}
                disabled={refreshFx.isPending || !session}
              >
                {refreshFx.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Actualizar
              </Button>
            </div>

            {canManage && (
              <div className="space-y-2">
                <Label htmlFor="manualRate">Tasa manual (override)</Label>
                <div className="flex gap-2">
                  <Input
                    id="manualRate"
                    type="number"
                    step="0.01"
                    value={manualRate}
                    onChange={(e) => setManualRate(e.target.value)}
                    placeholder="Ej: 40.50"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void handleManualRate()}
                    disabled={setManualFx.isPending || !manualRate}
                  >
                    Aplicar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Usa esto si BCV no está disponible. El próximo refresco automático lo sobrescribe.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aviso de stock bajo</CardTitle>
            <CardDescription>
              Cuándo marcar un producto como &quot;stock bajo&quot; en el inventario.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="threshold">Aviso general de la tienda</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Avisar al bajar de</span>
                <Input
                  id="threshold"
                  type="number"
                  min={0}
                  className="w-24"
                  value={thresholdInput}
                  onChange={(e) => setThresholdEdit(parseInt(e.target.value || '0', 10))}
                  disabled={!canManage}
                />
                <span className="text-sm text-muted-foreground">unidades</span>
                <Button
                  onClick={() => void handleSaveThreshold()}
                  disabled={setLowStock.isPending || !canManage}
                >
                  {setLowStock.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
            <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              Este aviso aplica a todos los productos. Si quieres, puedes poner un aviso distinto a
              una <strong>categoría</strong> (en Productos → Categorías) o a un{' '}
              <strong>producto</strong> puntual (al editarlo). El más específico manda: producto,
              luego categoría, luego este general.
            </div>
          </CardContent>
        </Card>

        <IgtfCard />
      </div>
    </div>
  )
}
