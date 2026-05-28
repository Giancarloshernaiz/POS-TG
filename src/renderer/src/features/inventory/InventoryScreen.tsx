import { useState } from 'react'
import { Search, AlertTriangle, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@renderer/components/ui/input'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'
import { useStock, useAdjustStock } from './hooks'
import { useAuth } from '@renderer/stores/auth'
import { SerialLookup } from './SerialLookup'
import type { StockRowDTO } from '@shared/ipc/contracts/inventory'

export function InventoryScreen(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<StockRowDTO | null>(null)

  const { data: rows, isLoading } = useStock({
    search: search || undefined,
    lowOnly,
    activeOnly: true
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Inventario</h2>
        <p className="text-sm text-muted-foreground">
          Stock por producto y trazabilidad de seriales.
        </p>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="serials">Seriales / IMEI</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto…"
                className="pl-8"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Solo stock bajo
            </label>
          </div>

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Avisar bajo de</TableHead>
                  <TableHead className="text-right">Seriales libres</TableHead>
                  <TableHead></TableHead>
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
                {!isLoading && rows?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      Sin resultados.
                    </TableCell>
                  </TableRow>
                )}
                {rows?.map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {r.effectiveThreshold}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.tracksSerial ? r.serialsAvailable : '—'}
                    </TableCell>
                    <TableCell>
                      {r.tracksSerial && <Badge variant="info">Serial</Badge>}
                      {r.quantity <= 0 && <Badge variant="destructive">Sin stock</Badge>}
                      {r.quantity > 0 && r.isLow && (
                        <Badge variant="warning">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Bajo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setAdjustTarget(r)}>
                        <Pencil className="h-3 w-3" />
                        Ajustar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="serials">
          <SerialLookup />
        </TabsContent>
      </Tabs>

      <AdjustStockDialog target={adjustTarget} onClose={() => setAdjustTarget(null)} />
    </div>
  )
}

function AdjustStockDialog({
  target,
  onClose
}: {
  target: StockRowDTO | null
  onClose: () => void
}): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const mut = useAdjustStock()
  const [delta, setDelta] = useState<number>(0)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(): Promise<void> {
    if (!target || !session) return
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error('Delta debe ser entero distinto de cero')
      return
    }
    if (!reason.trim()) {
      toast.error('Especificá un motivo')
      return
    }
    setSubmitting(true)
    try {
      await mut.mutateAsync({
        sessionId: session.id,
        productId: target.productId,
        delta,
        reason: reason.trim()
      })
      toast.success('Stock ajustado')
      setDelta(0)
      setReason('')
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        FORBIDDEN: 'No tenés permiso para ajustar inventario',
        PRODUCT_NOT_FOUND: 'Producto no existe'
      }
      toast.error(human[msg] ?? msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
          <DialogDescription>
            {target ? `${target.name} (${target.sku}) — actual: ${target.quantity}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="delta">Delta (positivo o negativo)</Label>
            <Input
              id="delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(parseInt(e.target.value || '0', 10))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (audit log)</Label>
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: corrección por recuento físico, devolución a proveedor, daño…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aplicar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
