import { useState } from 'react'
import { Loader2, Printer, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
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

export function ReportsScreen(): React.JSX.Element {
  const { data: active } = useActiveSession()
  const [scope, setScope] = useState<'session' | 'all'>('session')
  const { data, isLoading } = useSales(scope === 'session' ? active?.id : undefined)
  const voidMut = useVoidSale()
  const authSessionId = useAuth((s) => s.session?.id ?? '')
  const canVoid = useAuth((s) => s.hasPermission('sales.void'))

  async function handleReprint(saleId: string): Promise<void> {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ventas</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} venta${data.total === 1 ? '' : 's'}` : '—'}
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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    Sin ventas.
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.number}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(s.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{s.customerName ?? 'Consumidor final'}</TableCell>
                  <TableCell className="text-xs">
                    {s.payments.map((p) => PAYMENT_METHOD_LABEL[p.method] ?? p.method).join(', ')}
                  </TableCell>
                  <TableCell>
                    <DualPrice cents={s.total} />
                  </TableCell>
                  <TableCell>
                    {s.status === 'voided' ? (
                      <Badge variant="destructive">Anulada</Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => void handleReprint(s.id)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {canVoid && s.status === 'completed' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleVoid(s.id, s.number)}
                      >
                        <Ban className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
