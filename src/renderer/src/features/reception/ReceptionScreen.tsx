import { useEffect, useRef, useState } from 'react'
import {
  PackageCheck,
  Loader2,
  ScanLine,
  CheckCircle2,
  CloudOff,
  ArrowLeft,
  Truck
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
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import type { DispatchDTO, DispatchLineDTO } from '@shared/ipc/contracts/reception'
import { useDispatches, useDispatch, useScanReception } from './hooks'

/** Barra de avance mínima; el design system no trae una. */
function Progress({ value, className }: { value: number; className?: string }): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}>
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function formatWhen(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const ESTADO_LINEA: Record<DispatchLineDTO['estado'], { label: string; variant: 'default' | 'outline' | 'secondary' }> = {
  POR_VALIDAR: { label: 'Pendiente', variant: 'outline' },
  NO_RECIBIDO: { label: 'No recibido', variant: 'outline' },
  RECIBIDO_PARCIALMENTE: { label: 'Parcial', variant: 'secondary' },
  RECIBIDO: { label: 'Completo', variant: 'default' }
}

// Recepción en la tienda de los despachos del Centro de Acopio.
// El operador escanea cada unidad; el máster valida y acumula.
export function ReceptionScreen(): React.JSX.Element {
  const [selected, setSelected] = useState<number | null>(null)
  if (selected === null) return <DispatchList onSelect={setSelected} />
  return <DispatchReceive agroDispatchId={selected} onBack={() => setSelected(null)} />
}

function DispatchList({ onSelect }: { onSelect: (id: number) => void }): React.JSX.Element {
  const { data, isLoading, error } = useDispatches()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando despachos…
      </div>
    )
  }

  if (error) {
    const code = error instanceof Error ? error.message : String(error)
    return (
      <Card className="m-6">
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <CloudOff className="h-4 w-4" />
          {code === 'NOT_PROVISIONED'
            ? 'Esta caja no está vinculada a AgroOne. Configúrala en Ajustes.'
            : 'No se pudo consultar los despachos. Revisa la conexión con AgroOne.'}
        </CardContent>
      </Card>
    )
  }

  const dispatches = data ?? []
  const pendientes = dispatches.filter((d) => d.pendiente > 0)
  const completos = dispatches.filter((d) => d.pendiente <= 0)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <PackageCheck className="h-6 w-6" /> Recepciones
        </h1>
        <p className="text-sm text-muted-foreground">
          Mercancía enviada por el Centro de Acopio a esta tienda. Escanea cada unidad al recibirla.
        </p>
      </div>

      {dispatches.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No hay despachos para esta tienda.
          </CardContent>
        </Card>
      )}

      {pendientes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Por recibir</h2>
          {pendientes.map((d) => (
            <DispatchCard key={d.agroId} dispatch={d} onSelect={onSelect} />
          ))}
        </section>
      )}

      {completos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Recibidos</h2>
          {completos.map((d) => (
            <DispatchCard key={d.agroId} dispatch={d} onSelect={onSelect} />
          ))}
        </section>
      )}
    </div>
  )
}

function DispatchCard({
  dispatch,
  onSelect
}: {
  dispatch: DispatchDTO
  onSelect: (id: number) => void
}): React.JSX.Element {
  const pct =
    dispatch.totalDespachado > 0
      ? Math.round((dispatch.totalRecibido / dispatch.totalDespachado) * 100)
      : 0
  const completo = dispatch.pendiente <= 0
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/40"
      onClick={() => onSelect(dispatch.agroId)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" /> {dispatch.referencia}
            </CardTitle>
            <CardDescription>
              {formatWhen(dispatch.fecha)} · {dispatch.lineas.length} producto
              {dispatch.lineas.length === 1 ? '' : 's'}
            </CardDescription>
          </div>
          {completo ? (
            <Badge className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Completo
            </Badge>
          ) : (
            <Badge variant="outline">Faltan {dispatch.pendiente}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={pct} />
        <p className="mt-1 text-xs text-muted-foreground">
          {dispatch.totalRecibido} de {dispatch.totalDespachado} unidades recibidas
        </p>
      </CardContent>
    </Card>
  )
}

function DispatchReceive({
  agroDispatchId,
  onBack
}: {
  agroDispatchId: number
  onBack: () => void
}): React.JSX.Element {
  const { data: dispatch, isLoading } = useDispatch(agroDispatchId)
  const scan = useScanReception()
  const [codigo, setCodigo] = useState('')
  const [ultimo, setUltimo] = useState<{ nombre: string; recibido: number; despachado: number } | null>(
    null
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // El lector "teclea" el código y manda Enter, así que el foco debe volver al
  // campo tras cada lectura para poder escanear en ráfaga sin tocar el mouse.
  useEffect(() => {
    inputRef.current?.focus()
  }, [dispatch])

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const c = codigo.trim()
    if (!c) return
    try {
      const r = await scan.mutateAsync({ agroDispatchId, codigo: c })
      setUltimo({ nombre: r.nombre, recibido: r.recibido, despachado: r.despachado })
      setCodigo('')
      if (r.pendiente === 0) toast.success(`${r.nombre} completo (${r.recibido}/${r.despachado})`)
    } catch (err) {
      // El máster ya devuelve mensajes redactados para el operador.
      toast.error(err instanceof Error ? err.message : String(err))
      setCodigo('')
    } finally {
      inputRef.current?.focus()
    }
  }

  if (isLoading || !dispatch) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando despacho…
      </div>
    )
  }

  const completo = dispatch.pendiente <= 0

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <div>
          <h1 className="text-xl font-bold">{dispatch.referencia}</h1>
          <p className="text-sm text-muted-foreground">
            {dispatch.totalRecibido} de {dispatch.totalDespachado} unidades ·{' '}
            {formatWhen(dispatch.fecha)}
          </p>
        </div>
      </div>

      {completo ? (
        <Card className="border-green-600/30 bg-green-600/10">
          <CardContent className="flex items-center gap-2 p-4 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Despacho recibido por completo.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="h-4 w-4" /> Escanear
            </CardTitle>
            <CardDescription>
              Pasa el lector por cada unidad. Cada lectura suma 1 al producto correspondiente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void submit(e)} className="space-y-2">
              <Label htmlFor="rcpCode">Código de barras</Label>
              <div className="flex gap-2">
                <Input
                  id="rcpCode"
                  ref={inputRef}
                  autoFocus
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Escanea o escribe el código"
                  className="font-mono"
                />
                <Button type="submit" disabled={scan.isPending || !codigo.trim()}>
                  {scan.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ScanLine className="h-4 w-4" />
                  )}
                  Sumar
                </Button>
              </div>
              {ultimo && (
                <p className="text-sm text-muted-foreground">
                  Último: <strong>{ultimo.nombre}</strong> — {ultimo.recibido}/{ultimo.despachado}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Productos del despacho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dispatch.lineas.map((l) => {
            const badge = ESTADO_LINEA[l.estado]
            const pct = l.cantidad > 0 ? Math.round((l.cantidadRecibida / l.cantidad) * 100) : 0
            return (
              <div key={l.lineaId} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.nombre}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {l.codigoBarras ?? l.codigo}
                    </p>
                    {l.productIdLocal === null && (
                      <p className="text-xs text-amber-600">
                        Aún no está en el catálogo local — sincroniza para verlo en inventario.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <p className="mt-1 text-sm">
                      <strong>{l.cantidadRecibida}</strong> / {l.cantidad}
                      {l.unidadMedida ? ` ${l.unidadMedida.toLowerCase()}` : ''}
                    </p>
                  </div>
                </div>
                <Progress value={pct} className="mt-2" />
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
