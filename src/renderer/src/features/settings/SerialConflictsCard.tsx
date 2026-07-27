import { useState } from 'react'
import { AlertTriangle, Loader2, Check } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Textarea } from '@renderer/components/ui/textarea'
import type { SerialConflictDTO } from '@shared/ipc/contracts/p2p'
import { useSerialConflicts, useResolveSerialConflict } from './hooks'

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Cuarentena de doble-venta de serial entre cajas (§9.1). Nunca se auto-anula
// una venta — requiere revisión de gerente.
export function SerialConflictsCard(): React.JSX.Element | null {
  const { data: conflicts } = useSerialConflicts()
  const resolveMut = useResolveSerialConflict()
  const [reviewing, setReviewing] = useState<SerialConflictDTO | null>(null)
  const [notes, setNotes] = useState('')

  if (!conflicts || conflicts.length === 0) return null

  async function handleResolve(): Promise<void> {
    if (!reviewing) return
    try {
      await resolveMut.mutateAsync({ conflictId: reviewing.id, notes: notes.trim() || null })
      toast.success('Conflicto marcado como resuelto')
      setReviewing(null)
      setNotes('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'FORBIDDEN' ? 'Sin permiso' : msg)
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" /> Conflictos de serial ({conflicts.length})
        </CardTitle>
        <CardDescription>
          El mismo IMEI se vendió en dos cajas al mismo tiempo estando offline. La venta con dinero
          ya cobrado <strong>no se anula sola</strong> — revisa con el cliente/gerente y marca
          resuelto cuando corresponda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {conflicts.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
          >
            <div className="text-sm">
              <div className="font-medium">
                {c.productName ?? 'Producto'} — IMEI <span className="font-mono">{c.imei}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Nuestra venta: {c.localSaleNumber ?? '—'} · Detectado {formatWhen(c.detectedAt)} ·
                Ganó la caja …{c.winningNodeId.slice(-8)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">Sin resolver</Badge>
              <Button variant="outline" size="sm" onClick={() => setReviewing(c)}>
                <Check className="h-3.5 w-3.5" /> Marcar resuelto
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver conflicto de serial</DialogTitle>
            <DialogDescription>
              Confirma que ya revisaste el caso (con el cliente, gerente, o ajustando la venta
              manualmente) antes de marcarlo resuelto. Esto no deshace ninguna venta ni movimiento
              de dinero automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Notas de la resolución (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleResolve()} disabled={resolveMut.isPending}>
              {resolveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirmar resuelto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
