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
import { useCreateProduct, useCategories } from '@renderer/features/products/hooks'
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
  const [categoryId, setCategoryId] = useState<string>('')
  const createMut = useCreateProduct()
  // El alta va contra AgroOne, que exige categoría. Solo se ofrecen las que ya
  // están sincronizadas: una categoría sin `agroId` no sirve para dar de alta.
  const { data: categories } = useCategories()

  async function submit(): Promise<void> {
    if (!name.trim()) {
      toast.error('Nombre requerido')
      return
    }
    if (!sku.trim()) {
      toast.error('SKU requerido')
      return
    }
    if (!categoryId) {
      toast.error('Categoría requerida: AgroOne la exige para dar de alta el producto')
      return
    }
    if (priceCents <= 0) {
      toast.error('Precio debe ser mayor a 0')
      return
    }
    try {
      const created = await createMut.mutateAsync({
        sku: sku.trim(),
        // El código escaneado es el código de barras real del producto.
        barcode: initialCode.trim() || sku.trim(),
        name: name.trim(),
        description: null,
        categoryId,
        basePrice: priceCents,
        costPrice: costCents > 0 ? costCents : null,
        taxRateBp,
        tracksSerial: false,
        unitOfMeasure: 'UNIDAD',
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
        FORBIDDEN: 'Sin permiso para crear productos',
        NOT_PROVISIONED: 'Esta caja no está vinculada a AgroOne. Configúrala en Ajustes.',
        CATEGORY_REQUIRED: 'AgroOne exige categoría para dar de alta un producto',
        CATEGORY_NOT_SYNCED: 'Esa categoría aún no existe en AgroOne. Sincroniza primero.',
        AGRO_UNREACHABLE:
          'Sin conexión con AgroOne. El catálogo lo administra el Centro de Acopio: no se puede dar de alta sin red.'
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
            Código escaneado: <span className="font-mono">{initialCode}</span>. El producto se da de
            alta en AgroOne (Centro de Acopio) y luego se agrega a la venta, así que hace falta
            conexión con el máster.
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
            <Label>Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.parentName ? `${c.parentName} / ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(categories ?? []).length === 0 && (
              <p className="text-xs text-destructive">
                No hay categorías sincronizadas. Sincroniza con AgroOne antes de dar de alta.
              </p>
            )}
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
