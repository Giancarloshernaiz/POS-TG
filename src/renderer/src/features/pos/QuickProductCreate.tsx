import { useState } from 'react'
import { Loader2, PackagePlus } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { MoneyInput } from '@renderer/components/MoneyInput'
import { useCreateProduct } from '@renderer/features/products/hooks'
import { IVA_PRESETS } from '@shared/fiscal'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'

type Props = {
  open: boolean
  /** Pre-filled SKU/barcode from the scanner. */
  initialCode: string
  onClose: () => void
  onCreated: (product: ProductDTO) => void
}

export function QuickProductCreate({
  open,
  initialCode,
  onClose,
  onCreated
}: Props): React.JSX.Element {
  // Parent remounts (key) on each open → useState initializers read latest props.
  const [sku, setSku] = useState(initialCode)
  const [name, setName] = useState('')
  const [priceCents, setPriceCents] = useState(0)
  const [costCents, setCostCents] = useState(0)
  const [taxRateBp, setTaxRateBp] = useState(1600)
  const [tracksSerial, setTracksSerial] = useState(false)
  const createMut = useCreateProduct()

  async function submit(): Promise<void> {
    if (!name.trim()) {
      toast.error('Nombre requerido')
      return
    }
    if (!sku.trim()) {
      toast.error('SKU requerido')
      return
    }
    if (priceCents <= 0) {
      toast.error('Precio debe ser mayor a 0')
      return
    }
    try {
      const created = await createMut.mutateAsync({
        sku: sku.trim(),
        barcode: initialCode === sku.trim() ? initialCode : sku.trim(),
        name: name.trim(),
        description: null,
        categoryId: null,
        basePrice: priceCents,
        costPrice: costCents > 0 ? costCents : null,
        taxRateBp,
        tracksSerial,
        discountType: 'none',
        discountValue: 0,
        active: true
      })
      toast.success(`Producto "${created.name}" creado y agregado`)
      onCreated(created)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        DUPLICATE_SKU: 'SKU ya existe',
        DUPLICATE_BARCODE: 'Código de barras ya existe',
        FORBIDDEN: 'Sin permiso para crear productos'
      }
      toast.error(human[msg] ?? msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Producto no encontrado — crear rápido
          </DialogTitle>
          <DialogDescription>
            Código escaneado: <span className="font-mono">{initialCode}</span>. Completa nombre y
            precio para guardarlo y agregarlo a la venta.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="qpName">Nombre</Label>
            <Input
              id="qpName"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Coca-Cola 2L"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qpSku">SKU</Label>
            <Input
              id="qpSku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Código interno"
            />
            <p className="text-xs text-muted-foreground">
              Default igual al código escaneado. Cambialo si usás un SKU interno distinto.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Precio de venta</Label>
            <MoneyInput valueCents={priceCents} onChangeCents={setPriceCents} />
          </div>

          <div className="space-y-2">
            <Label>Precio de costo (opcional)</Label>
            <MoneyInput valueCents={costCents} onChangeCents={setCostCents} />
          </div>

          <div className="space-y-2">
            <Label>IVA</Label>
            <Select value={String(taxRateBp)} onValueChange={(v) => setTaxRateBp(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IVA_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tracksSerial}
              onChange={(e) => setTracksSerial(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Rastrea seriales / IMEI
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear y agregar a la venta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
