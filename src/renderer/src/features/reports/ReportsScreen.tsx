import { useState } from 'react'
import {
  Loader2,
  Printer,
  Ban,
  Undo2,
  Search,
  CloudOff,
  CloudUpload,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { Card, CardContent } from '@renderer/components/ui/card'
import { useSales, useVoidSale, reprint } from './hooks'
import { useActiveSession } from '@renderer/features/cash/hooks'
import { useAuth } from '@renderer/stores/auth'
import { DualPrice } from '@renderer/components/DualPrice'
import { PAYMENT_METHOD_LABEL } from '@renderer/lib/paymentMethods'
import { ApprovalWaitDialog } from '@renderer/features/approvals/ApprovalWaitDialog'
import { ReturnRequestDialog } from '@renderer/features/approvals/ReturnRequestDialog'
import { ReprintRequestDialog } from '@renderer/features/approvals/ReprintRequestDialog'
import type { SaleDTO } from '@shared/ipc/contracts/sales'
import { useQueryClient } from '@tanstack/react-query'

function inicioDelDia(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime()
}
function finDelDia(iso: string): number {
  return new Date(`${iso}T23:59:59.999`).getTime()
}

/**
 * Estado de subida al máster. Se muestra porque tanto la reimpresión como la
 * devolución exigen que la venta ya exista en Galas Cloud: sin esto el cajero solo
 * se entera al apretar el botón y recibir el error.
 */
function SyncBadge({ sale }: { sale: SaleDTO }): React.JSX.Element {
  if (sale.syncStatus === 'synced') {
    return (
      <Badge variant="outline" className="gap-1 text-green-700">
        <CloudUpload className="h-3 w-3" /> En Galas Cloud
      </Badge>
    )
  }
  if (sale.syncStatus === 'error') {
    return (
      <Badge variant="outline" className="gap-1 text-destructive">
        <AlertTriangle className="h-3 w-3" /> Error al subir
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <CloudOff className="h-3 w-3" /> Sin subir
    </Badge>
  )
}

export function ReportsScreen(): React.JSX.Element {
  const queryClient = useQueryClient()
  const { data: active } = useActiveSession()
  const [scope, setScope] = useState<'session' | 'all'>('session')
  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const { data, isLoading } = useSales({
    cashSessionId: scope === 'session' ? active?.id : undefined,
    search: search.trim() || undefined,
    from: desde ? inicioDelDia(desde) : undefined,
    to: hasta ? finDelDia(hasta) : undefined
  })

  const voidMut = useVoidSale()
  const authSessionId = useAuth((s) => s.session?.id ?? '')
  const canVoid = useAuth((s) => s.hasPermission('sales.void'))

  // Reimpresión y devolución las autoriza un administrador en Galas Cloud.
  const [espera, setEspera] = useState<{ id: number; titulo: string; saleId: string } | null>(null)
  const [devolucion, setDevolucion] = useState<{ id: string; number: string } | null>(null)
  const [reimpresion, setReimpresion] = useState<{ id: string; number: string } | null>(null)

  /** La factura se imprime con datos locales; la aprobación solo da permiso. */
  async function imprimirAprobada(saleId: string): Promise<void> {
    try {
      await reprint(authSessionId, saleId)
      toast.success('Ticket reenviado a impresora')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'PRINTER_NOT_CONFIGURED' ? 'Impresora no configurada' : msg)
    }
  }

  async function handleVoid(saleId: string, number: string): Promise<void> {
    const reason = window.prompt(`Motivo de anulación de ${number}:`)
    if (!reason) return
    try {
      await voidMut.mutateAsync({ id: saleId, reason })
      toast.success(`Venta ${number} anulada`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'ALREADY_VOIDED' ? 'Ya estaba anulada' : msg)
    }
  }

  const hayFiltros = search.trim() !== '' || desde !== '' || hasta !== ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Historial de ventas</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} venta${data.total === 1 ? '' : 's'}` : '—'} · reimprimir factura o
            registrar una devolución requiere aprobación del administrador
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-1 text-sm">
          <button
            onClick={() => setScope('session')}
            className={
              'rounded px-3 py-1 ' +
              (scope === 'session' ? 'bg-primary text-primary-foreground' : '')
            }
          >
            Caja actual
          </button>
          <button
            onClick={() => setScope('all')}
            className={
              'rounded px-3 py-1 ' + (scope === 'all' ? 'bg-primary text-primary-foreground' : '')
            }
          >
            Todas
          </button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label htmlFor="buscar">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="buscar"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Número de factura o cliente"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {hayFiltros && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('')
                setDesde('')
                setHasta('')
              }}
            >
              Limpiar
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    {hayFiltros ? 'Ninguna venta coincide con el filtro.' : 'Sin ventas.'}
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((s) => {
                const sincronizada = s.syncStatus === 'synced'
                const anulada = s.status === 'voided'
                const devolucionPendiente = s.returnStatus === 'pending'
                const devuelta = s.returnStatus === 'approved'
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.number}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.customerName ?? 'Consumidor final'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.sellerName ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.payments.map((p) => PAYMENT_METHOD_LABEL[p.method] ?? p.method).join(', ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <DualPrice cents={s.total} />
                    </TableCell>
                    <TableCell className="space-y-1">
                      {anulada ? (
                        <Badge variant="destructive">Anulada</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                      <div>
                        <SyncBadge sale={s} />
                      </div>
                      {devolucionPendiente && (
                        <div><Badge variant="outline">Devolución pendiente</Badge></div>
                      )}
                      {devuelta && (
                        <div><Badge variant="secondary">Devuelta</Badge></div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        // Ambas acciones necesitan la venta en Galas Cloud: el
                        // administrador aprueba contra la factura del máster.
                        disabled={!sincronizada}
                        title={
                          sincronizada
                            ? 'Solicitar reimpresión'
                            : 'Sincroniza la venta con Galas Cloud para poder reimprimirla'
                        }
                        onClick={() => setReimpresion({ id: s.id, number: s.number })}
                      >
                        <Printer className="mr-1 h-4 w-4" /> Reimprimir
                      </Button>
                      {!anulada && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!sincronizada || devolucionPendiente || devuelta}
                          title={
                            devuelta
                              ? 'Esta venta ya fue devuelta'
                              : devolucionPendiente
                                ? 'Esta venta ya tiene una devolución pendiente'
                                : sincronizada
                              ? 'Solicitar devolución'
                              : 'Sincroniza la venta con Galas Cloud para poder devolver'
                          }
                          onClick={() => setDevolucion({ id: s.id, number: s.number })}
                        >
                          <Undo2 className="mr-1 h-4 w-4" /> Devolver
                        </Button>
                      )}
                      {canVoid && !anulada && !devolucionPendiente && !devuelta && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Anular venta"
                          onClick={() => void handleVoid(s.id, s.number)}
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ReprintRequestDialog
        saleId={reimpresion?.id ?? null}
        saleNumber={reimpresion?.number ?? ''}
        onClose={() => setReimpresion(null)}
        onRequested={(requestId) =>
          setEspera({
            id: requestId,
            titulo: `Reimpresión de ${reimpresion?.number ?? ''}`,
            saleId: reimpresion?.id ?? ''
          })
        }
      />

      <ReturnRequestDialog
        saleId={devolucion?.id ?? null}
        saleNumber={devolucion?.number ?? ''}
        onClose={() => setDevolucion(null)}
        onRequested={(requestId) =>
          setEspera({
            id: requestId,
            titulo: `Devolución de ${devolucion?.number ?? ''}`,
            saleId: devolucion?.id ?? ''
          })
        }
      />

      <ApprovalWaitDialog
        requestId={espera?.id ?? null}
        titulo={espera?.titulo ?? ''}
        onApproved={() => {
          // Solo la reimpresión tiene efecto local; la devolución la ejecuta
          // Galas Cloud y baja en el próximo pull.
          if (espera?.titulo.startsWith('Reimpresión') && espera.saleId) {
            void imprimirAprobada(espera.saleId)
          } else {
            toast.success('Devolución aprobada. Se aplicará en el próximo sincronizado.')
            void queryClient.invalidateQueries({ queryKey: ['sales'] })
          }
        }}
        onClose={() => setEspera(null)}
      />
    </div>
  )
}
