import { useEffect, useRef } from 'react'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useApprovalStatus } from './hooks'

type Props = {
  requestId: number | null
  titulo: string
  /** Se dispara una sola vez cuando la solicitud pasa a APPROVED. */
  onApproved?: () => void
  onClose: () => void
}

/**
 * Espera a que el administrador resuelva la solicitud en AgroOne.
 *
 * Cerrar el diálogo NO cancela nada: la solicitud sigue viva del otro lado y el
 * administrador puede aprobarla más tarde. Se dice explícitamente para que el
 * cajero no la vuelva a pedir creyendo que se perdió.
 */
export function ApprovalWaitDialog({
  requestId,
  titulo,
  onApproved,
  onClose
}: Props): React.JSX.Element {
  const { data, isLoading } = useApprovalStatus(requestId)
  const yaAvisado = useRef(false)

  useEffect(() => {
    if (data?.status === 'APPROVED' && !yaAvisado.current) {
      yaAvisado.current = true
      onApproved?.()
    }
  }, [data?.status, onApproved])

  // Reset al abrir otra solicitud con el mismo diálogo montado.
  useEffect(() => {
    yaAvisado.current = false
  }, [requestId])

  const estado = data?.status ?? 'PENDING'

  return (
    <Dialog open={requestId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Solicitud #{requestId} enviada a AgroOne. Un administrador debe aprobarla.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-4">
          {isLoading || estado === 'PENDING' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">Esperando aprobación…</p>
                <p className="text-muted-foreground">
                  Podés cerrar esta ventana: la solicitud queda pendiente y no hace falta pedirla
                  de nuevo.
                </p>
              </div>
            </>
          ) : estado === 'APPROVED' ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium">Aprobada</p>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm font-medium">Rechazada por el administrador</p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant={estado === 'PENDING' ? 'outline' : 'default'} onClick={onClose}>
            {estado === 'PENDING' ? (
              <>
                <Clock className="mr-2 h-4 w-4" /> Seguir después
              </>
            ) : (
              'Cerrar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
