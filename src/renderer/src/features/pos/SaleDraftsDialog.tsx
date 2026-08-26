import { Clock3, Loader2, Play, ShoppingCart, Trash2 } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { SaleDraftDTO } from '@shared/ipc/contracts/sales'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  drafts: SaleDraftDTO[]
  isLoading: boolean
  deletingId: string | null
  onResume: (draft: SaleDraftDTO) => void
  onDelete: (draft: SaleDraftDTO) => void
}

function formatReference(cents: number): string {
  return (cents / 100).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export function SaleDraftsDialog({
  open,
  onOpenChange,
  drafts,
  isLoading,
  deletingId,
  onResume,
  onDelete
}: Props): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5" /> Facturas en espera
          </DialogTitle>
          <DialogDescription>
            Retoma una venta con sus productos, cliente, vendedor y pagos tal como se dejó.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center text-muted-foreground">
              <ShoppingCart className="mb-3 h-10 w-10 opacity-40" />
              <p className="font-medium text-foreground">No hay facturas en espera</p>
              <p className="mt-1 text-sm">Las facturas que guardes aparecerán aquí.</p>
            </div>
          ) : (
            drafts.map((draft) => {
              const quantity = draft.state.lines.reduce((sum, line) => sum + line.qty, 0)
              const total = draft.state.lines.reduce(
                (sum, line) => sum + line.effectivePrice * line.qty,
                0
              )
              return (
                <div key={draft.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{draft.label}</h3>
                        <Badge variant="secondary">
                          {quantity} {quantity === 1 ? 'producto' : 'productos'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Guardada {new Date(draft.updatedAt).toLocaleString('es-VE')}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Subtotal guardado</div>
                      <div className="font-semibold">Ref. {formatReference(total)}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">
                    {draft.state.lines
                      .slice(0, 3)
                      .map((line) => `${line.qty} × ${line.name}`)
                      .join(' · ')}
                    {draft.state.lines.length > 3 && ` · +${draft.state.lines.length - 3} más`}
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === draft.id}
                      onClick={() => onDelete(draft)}
                    >
                      {deletingId === draft.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Eliminar
                    </Button>
                    <Button type="button" size="sm" onClick={() => onResume(draft)}>
                      <Play className="mr-2 h-4 w-4" /> Retomar venta
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
