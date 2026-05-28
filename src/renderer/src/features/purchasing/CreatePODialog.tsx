import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { useSuppliers } from '@renderer/features/suppliers/hooks'
import { useProducts } from '@renderer/features/products/hooks'
import { useCreatePO } from './hooks'
import { useAuth } from '@renderer/stores/auth'
import { formatMoney } from '@renderer/lib/money'
import { MoneyInput } from '@renderer/components/MoneyInput'

type LineDraft = {
  productId: string
  productLabel: string
  qty: number
  unitCostCents: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreatePODialog({ open, onOpenChange }: Props): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const { data: suppliers = [] } = useSuppliers(true)
  const { data: productsRes } = useProducts({ activeOnly: true, limit: 500 })
  const products = productsRes?.items ?? []
  const createMut = useCreatePO()

  const [supplierId, setSupplierId] = useState<string>('')
  const [expectedAt, setExpectedAt] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [productPicker, setProductPicker] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  function addLine(): void {
    const p = products.find((p) => p.id === productPicker)
    if (!p) return
    if (lines.some((l) => l.productId === p.id)) {
      toast.error('Producto ya en la PO')
      return
    }
    setLines((cur) => [
      ...cur,
      {
        productId: p.id,
        productLabel: `${p.sku} — ${p.name}`,
        qty: 1,
        unitCostCents: p.costPrice ?? 0
      }
    ])
    setProductPicker('')
  }

  function updateLine(idx: number, patch: Partial<LineDraft>): void {
    setLines((cur) => cur.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function removeLine(idx: number): void {
    setLines((cur) => cur.filter((_, i) => i !== idx))
  }

  const total = lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0)

  async function submit(): Promise<void> {
    if (!session) return
    if (!supplierId) {
      toast.error('Elegí un proveedor')
      return
    }
    if (lines.length === 0) {
      toast.error('Añadí al menos una línea')
      return
    }
    if (lines.some((l) => l.qty <= 0)) {
      toast.error('Cantidades deben ser positivas')
      return
    }

    setSubmitting(true)
    try {
      await createMut.mutateAsync({
        sessionId: session.id,
        supplierId,
        expectedAt: expectedAt ? new Date(expectedAt).getTime() : null,
        notes: notes || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          qtyOrdered: l.qty,
          unitCost: l.unitCostCents
        }))
      })
      toast.success('Orden de compra creada')
      onOpenChange(false)
      setSupplierId('')
      setExpectedAt('')
      setNotes('')
      setLines([])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        FORBIDDEN: 'No tenés permiso para crear PO',
        SUPPLIER_NOT_FOUND: 'Proveedor no existe',
        PRODUCT_NOT_FOUND: 'Algún producto no existe'
      }
      toast.error(human[msg] ?? msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nueva orden de compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedAt">Fecha esperada</Label>
              <Input
                id="expectedAt"
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-2">
            <Label>Agregar producto</Label>
            <div className="flex gap-2">
              <Select value={productPicker} onValueChange={setProductPicker}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Buscar producto…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={addLine} disabled={!productPicker}>
                <Plus className="h-4 w-4" />
                Añadir
              </Button>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-20">Cant.</TableHead>
                    <TableHead className="w-56">Costo unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, idx) => (
                    <TableRow key={l.productId}>
                      <TableCell className="text-sm">{l.productLabel}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={l.qty}
                          onChange={(e) =>
                            updateLine(idx, { qty: parseInt(e.target.value || '0', 10) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <MoneyInput
                          valueCents={l.unitCostCents}
                          onChangeCents={(c) => updateLine(idx, { unitCostCents: c })}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoney(l.qty * l.unitCostCents)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end border-t bg-muted/30 px-4 py-3">
                <div className="text-sm">
                  Total: <span className="font-mono font-semibold">{formatMoney(total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear PO (draft)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
