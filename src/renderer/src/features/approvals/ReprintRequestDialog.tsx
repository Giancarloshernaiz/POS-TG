import { useEffect, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
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
import { ApproverPicker } from './ApproverPicker'
import { useRequestReprint, approvalMessage } from './hooks'

type Props = {
  saleId: string | null
  saleNumber: string
  onClose: () => void
  onRequested: (requestId: number) => void
}

/** La reimpresión necesita visto bueno: acá se elige a quién pedírselo. */
export function ReprintRequestDialog({
  saleId,
  saleNumber,
  onClose,
  onRequested
}: Props): React.JSX.Element {
  const request = useRequestReprint()
  const [approverIds, setApproverIds] = useState<number[]>([])

  useEffect(() => {
    setApproverIds([])
  }, [saleId])

  async function enviar(): Promise<void> {
    if (!saleId || approverIds.length === 0) return
    try {
      const req = await request.mutateAsync({ saleId, approverIds })
      onRequested(req.id)
      onClose()
    } catch (e) {
      toast.error(approvalMessage(e))
    }
  }

  return (
    <Dialog open={saleId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Reimprimir {saleNumber}
          </DialogTitle>
          <DialogDescription>
            La reimpresión de una factura requiere autorización. Elegí a quién se la pedís; cuando
            alguno apruebe, el ticket se imprime solo.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <ApproverPicker seleccion={approverIds} onChange={setApproverIds} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void enviar()}
            disabled={approverIds.length === 0 || request.isPending}
          >
            {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
