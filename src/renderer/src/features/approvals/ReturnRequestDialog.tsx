import { useEffect, useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
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
import { Input } from '@renderer/components/ui/input'
import { formatMoney } from '@renderer/lib/money'
import { ApproverPicker } from './ApproverPicker'
import { useSale, useRequestReturn, approvalMessage } from './hooks'

type Props = {
  saleId: string | null
  saleNumber: string
  onClose: () => void
  /** Recibe el id de la solicitud creada, para abrir la espera. */
  onRequested: (requestId: number) => void
}

/**
 * Selección de qué devolver. La caja solo propone: quién repone el stock y
 * emite el crédito es AgroOne, cuando el administrador aprueba.
 */
export function ReturnRequestDialog({
  saleId,
  saleNumber,
  onClose,
  onRequested
}: Props): React.JSX.Element {
  const { data: sale, isLoading } = useSale(saleId)
  const request = useRequestReturn()
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [approverIds, setApproverIds] = useState<number[]>([])

  // Al abrir otra venta, se limpia lo tipeado de la anterior.
  useEffect(() => {
    setCantidades({})
    setApproverIds([])
  }, [saleId])

  const lineas = sale?.lines ?? []
  const seleccion = lineas
    .map((l) => ({ linea: l, qty: cantidades[l.productId] ?? 0 }))
    .filter((x) => x.qty > 0)
  const totalEstimado = seleccion.reduce(
    (s, x) => s + Math.round((x.linea.lineTotal / x.linea.qty) * x.qty),
    0
  )

  async function enviar(): Promise<void> {
    if (!saleId || seleccion.length === 0) return
    try {
      const req = await request.mutateAsync({
        saleId,
        approverIds,
        items: seleccion.map((x) => ({ productId: x.linea.productId, qty: x.qty }))
      })
      onRequested(req.id)
      onClose()
    } catch (e) {
      toast.error(approvalMessage(e))
    }
  }

  return (
    <Dialog open={saleId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" /> Solicitar devolución — {saleNumber}
          </DialogTitle>
          <DialogDescription>
            Indicá cuántas unidades devuelve el cliente. La devolución la ejecuta AgroOne cuando
            el administrador la apruebe: ahí se repone el stock y se genera el crédito.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {lineas.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.qty} vendidas · {formatMoney(l.lineTotal)}
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={l.qty}
                  value={cantidades[l.productId] ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(l.qty, Number(e.target.value) || 0))
                    setCantidades((c) => ({ ...c, [l.productId]: v }))
                  }}
                  className="w-20 text-right font-mono"
                />
              </div>
            ))}
            <div className="pt-2">
              <ApproverPicker seleccion={approverIds} onChange={setApproverIds} />
            </div>
            {seleccion.length > 0 && (
              <p className="pt-1 text-right text-sm">
                Estimado a devolver: <strong>{formatMoney(totalEstimado)}</strong>
                <span className="block text-xs text-muted-foreground">
                  El monto final lo calcula AgroOne sobre la venta original.
                </span>
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void enviar()}
            disabled={seleccion.length === 0 || approverIds.length === 0 || request.isPending}
          >
            {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
