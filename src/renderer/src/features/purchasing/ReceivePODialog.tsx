import { useState } from 'react'
import { Loader2, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from '@renderer/components/ui/badge'
import { useReceivePO } from './hooks'
import { useAuth } from '@renderer/stores/auth'
import type { PurchaseOrderDTO } from '@shared/ipc/contracts/purchasing'

type LineState = {
  poLineId: string
  qty: number
  serials: string
}

type Props = {
  po: PurchaseOrderDTO | null
  onClose: () => void
}

export function ReceivePODialog({ po, onClose }: Props): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const recvMut = useReceivePO()
  const [linesState, setLinesState] = useState<Record<string, LineState>>(() => {
    if (!po) return {}
    const init: Record<string, LineState> = {}
    for (const l of po.lines) {
      const remaining = l.qtyOrdered - l.qtyReceived
      init[l.id] = { poLineId: l.id, qty: remaining, serials: '' }
    }
    return init
  })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(): Promise<void> {
    if (!po || !session) return
    type RecvLine = { poLineId: string; qty: number; serials?: string[] }
    const linesPayload: RecvLine[] = []
    for (const l of po.lines) {
      const s = linesState[l.id]
      if (!s || s.qty <= 0) continue
      const entry: RecvLine = { poLineId: l.id, qty: s.qty }
      if (l.tracksSerial && s.serials.trim()) {
        entry.serials = s.serials
          .split(/[\n,;\s]+/)
          .map((x) => x.trim())
          .filter(Boolean)
      }
      linesPayload.push(entry)
    }

    if (linesPayload.length === 0) {
      toast.error('Nada para recibir')
      return
    }

    setSubmitting(true)
    try {
      const res = await recvMut.mutateAsync({
        sessionId: session.id,
        poId: po.id,
        lines: linesPayload,
        notes: notes || null
      })
      toast.success(`Recepción ${res.receiptNumber} registrada`)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        OVER_RECEIPT: 'Excede cantidad pedida',
        SERIAL_REQUIRED: 'Seriales no aplican para este producto',
        SERIAL_DUPLICATE: 'Serial duplicado o ya existe',
        SERIAL_QTY_MISMATCH: 'Cantidad de seriales no coincide con cantidad recibida',
        FORBIDDEN: 'No tenés permiso para recibir mercancía'
      }
      toast.error(human[msg] ?? msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!po} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recibir mercancía</DialogTitle>
          <DialogDescription>{po ? `PO ${po.number} • ${po.supplierName}` : ''}</DialogDescription>
        </DialogHeader>

        {po && (
          <div className="space-y-4">
            <div className="space-y-3">
              {po.lines.map((l) => {
                const remaining = l.qtyOrdered - l.qtyReceived
                const s = linesState[l.id]
                return (
                  <div key={l.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{l.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.productSku} • Pedido {l.qtyOrdered} • Pendiente {remaining}
                        </div>
                      </div>
                      {l.tracksSerial && <Badge variant="info">Serial</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Cantidad a recibir</Label>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          value={s?.qty ?? 0}
                          onChange={(e) =>
                            setLinesState((cur) => ({
                              ...cur,
                              [l.id]: {
                                ...(cur[l.id] ?? { poLineId: l.id, qty: 0, serials: '' }),
                                qty: parseInt(e.target.value || '0', 10)
                              }
                            }))
                          }
                          disabled={remaining === 0}
                        />
                      </div>
                      {l.tracksSerial && (
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Seriales (uno por línea o separados por coma)
                          </Label>
                          <Textarea
                            rows={2}
                            value={s?.serials ?? ''}
                            onChange={(e) =>
                              setLinesState((cur) => ({
                                ...cur,
                                [l.id]: {
                                  ...(cur[l.id] ?? { poLineId: l.id, qty: 0, serials: '' }),
                                  serials: e.target.value
                                }
                              }))
                            }
                            placeholder="IMEI1, IMEI2, …"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="space-y-2">
              <Label>Notas de recepción</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="mr-2 h-4 w-4" />
            )}
            Confirmar recepción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
