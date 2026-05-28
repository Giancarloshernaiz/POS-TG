import { useState } from 'react'
import { Loader2, Send, X, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
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
import { usePurchaseOrder, useSubmitPO, useCancelPO } from './hooks'
import { useAuth } from '@renderer/stores/auth'
import { ReceivePODialog } from './ReceivePODialog'
import { formatMoney } from '@renderer/lib/money'
import { DualPrice } from '@renderer/components/DualPrice'

type Props = {
  poId: string | null
  onClose: () => void
}

export function PODetailDialog({ poId, onClose }: Props): React.JSX.Element {
  const { data: po, isLoading } = usePurchaseOrder(poId)
  const session = useAuth((s) => s.session)
  const submitMut = useSubmitPO()
  const cancelMut = useCancelPO()
  const [receiveOpen, setReceiveOpen] = useState(false)

  async function handleSubmit(): Promise<void> {
    if (!po || !session) return
    try {
      await submitMut.mutateAsync({ sessionId: session.id, id: po.id })
      toast.success('PO enviada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  async function handleCancel(): Promise<void> {
    if (!po || !session) return
    if (!confirm('¿Cancelar esta orden de compra?')) return
    try {
      await cancelMut.mutateAsync({ sessionId: session.id, id: po.id })
      toast.success('PO cancelada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Dialog open={!!poId} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{po ? `Orden ${po.number}` : 'Orden de compra'}</DialogTitle>
            <DialogDescription>
              {po ? `Proveedor: ${po.supplierName} • Estado: ${po.status}` : ''}
            </DialogDescription>
          </DialogHeader>

          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {po && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Field label="Estado">
                  <Badge>{po.status}</Badge>
                </Field>
                <Field label="Creada por">{po.createdByName}</Field>
                <Field label="Total">
                  <DualPrice cents={po.totalAmount} align="left" />
                </Field>
                <Field label="Esperada">
                  {po.expectedAt ? new Date(po.expectedAt).toLocaleDateString() : '—'}
                </Field>
                <Field label="Enviada">
                  {po.submittedAt ? new Date(po.submittedAt).toLocaleDateString() : '—'}
                </Field>
                <Field label="Recibida">
                  {po.receivedAt ? new Date(po.receivedAt).toLocaleDateString() : '—'}
                </Field>
              </div>

              {po.notes && (
                <div className="rounded-md bg-muted/30 p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">Notas</div>
                  {po.notes}
                </div>
              )}

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Pedido</TableHead>
                      <TableHead className="text-right">Recibido</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {po.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.productSku}</TableCell>
                        <TableCell>
                          {l.productName}
                          {l.tracksSerial && (
                            <Badge variant="info" className="ml-2">
                              Serial
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{l.qtyOrdered}</TableCell>
                        <TableCell className="text-right font-mono">
                          {l.qtyReceived} / {l.qtyOrdered}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatMoney(l.unitCost)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatMoney(l.lineTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            {po?.status === 'draft' && (
              <>
                <Button variant="destructive" onClick={() => void handleCancel()}>
                  <X className="h-4 w-4" />
                  Cancelar PO
                </Button>
                <Button onClick={() => void handleSubmit()}>
                  <Send className="h-4 w-4" />
                  Enviar
                </Button>
              </>
            )}
            {po && (po.status === 'submitted' || po.status === 'partial') && (
              <Button onClick={() => setReceiveOpen(true)}>
                <PackageCheck className="h-4 w-4" />
                Recibir mercancía
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {po && receiveOpen && (
        <ReceivePODialog key={po.id} po={po} onClose={() => setReceiveOpen(false)} />
      )}
    </>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
