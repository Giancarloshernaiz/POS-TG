import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, Check, X } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'
import { useCategories, useCreateProduct, useUpdateProduct, useCreateCategory } from './hooks'
import { fromCents, toCents } from '@renderer/lib/money'
import { MoneyInput } from '@renderer/components/MoneyInput'
import { IVA_PRESETS } from '@shared/fiscal'

const NONE = '__none__'

const schema = z.object({
  sku: z.string().min(1, 'requerido').max(64),
  barcode: z.string().max(64).optional().or(z.literal('')),
  name: z.string().min(1, 'requerido').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  categoryId: z.string().optional(),
  basePrice: z.number({ message: 'requerido' }).nonnegative(),
  costPrice: z.number().nonnegative().optional(),
  taxRatePct: z.number().nonnegative().max(100),
  lowStockThreshold: z.union([z.number().int().nonnegative(), z.nan()]).optional(),
  discountKind: z.enum(['none', 'percent', 'amount']),
  discountAmount: z.union([z.number().nonnegative(), z.nan()]).optional(),
  tracksSerial: z.boolean(),
  active: z.boolean()
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: ProductDTO | null
}

export function ProductForm({ open, onOpenChange, product }: Props): React.JSX.Element {
  const { data: categories = [] } = useCategories()
  const createMut = useCreateProduct()
  const updateMut = useUpdateProduct()
  const createCategoryMut = useCreateCategory()
  const [submitting, setSubmitting] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCustomTax, setIsCustomTax] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: '',
      barcode: '',
      name: '',
      description: '',
      categoryId: NONE,
      basePrice: 0,
      costPrice: 0,
      taxRatePct: 16,
      lowStockThreshold: undefined,
      discountKind: 'none',
      discountAmount: undefined,
      tracksSerial: false,
      active: true
    }
  })

  useEffect(() => {
    if (open) {
      reset(
        product
          ? {
              sku: product.sku,
              barcode: product.barcode ?? '',
              name: product.name,
              description: product.description ?? '',
              categoryId: product.categoryId ?? NONE,
              basePrice: fromCents(product.basePrice),
              costPrice: fromCents(product.costPrice ?? 0),
              taxRatePct: product.taxRateBp / 100,
              lowStockThreshold: product.lowStockThreshold ?? undefined,
              discountKind: product.discountType,
              discountAmount:
                product.discountType === 'percent'
                  ? product.discountValue / 100
                  : product.discountType === 'amount'
                    ? product.discountValue / 100
                    : undefined,
              tracksSerial: product.tracksSerial,
              active: product.active
            }
          : undefined
      )
    }
  }, [open, product, reset])

  async function handleCreateCategory(): Promise<void> {
    const name = newCategoryName.trim()
    if (!name) return
    try {
      const cat = await createCategoryMut.mutateAsync({ name })
      setValue('categoryId', cat.id, { shouldDirty: true })
      setNewCategoryName('')
      setCreatingCategory(false)
      toast.success(`Categoría "${cat.name}" creada`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'DUPLICATE_NAME' ? 'Ya existe una categoría con ese nombre' : msg)
    }
  }

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitting(true)
    try {
      const payload = {
        sku: values.sku,
        barcode: values.barcode ? values.barcode : null,
        name: values.name,
        description: values.description ? values.description : null,
        categoryId: values.categoryId && values.categoryId !== NONE ? values.categoryId : null,
        basePrice: toCents(values.basePrice),
        costPrice: values.costPrice ? toCents(values.costPrice) : null,
        taxRateBp: Math.round(values.taxRatePct * 100),
        lowStockThreshold:
          values.lowStockThreshold != null && !Number.isNaN(values.lowStockThreshold)
            ? values.lowStockThreshold
            : null,
        discountType: values.discountKind,
        discountValue:
          values.discountKind === 'none' ||
          values.discountAmount == null ||
          Number.isNaN(values.discountAmount)
            ? 0
            : values.discountKind === 'percent'
              ? Math.round(values.discountAmount * 100) // % → basis points
              : toCents(values.discountAmount), // amount → cents
        tracksSerial: values.tracksSerial,
        active: values.active
      }
      if (product) {
        await updateMut.mutateAsync({ id: product.id, ...payload })
        toast.success('Producto actualizado')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Producto creado')
      }
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        DUPLICATE_SKU: 'SKU ya existe',
        DUPLICATE_BARCODE: 'Código de barras ya existe',
        NOT_FOUND: 'Producto no existe'
      }
      toast.error(human[msg] ?? msg)
    } finally {
      setSubmitting(false)
    }
  }

  const tracksSerial = watch('tracksSerial')
  const active = watch('active')
  const categoryId = watch('categoryId')
  const discountKind = watch('discountKind')
  const taxRatePct = watch('taxRatePct')
  const basePrice = watch('basePrice')
  const costPrice = watch('costPrice')
  const presetTaxValues = IVA_PRESETS.map((p) => p.value / 100)
  const showCustomTax = isCustomTax || (taxRatePct != null && !presetTaxValues.includes(taxRatePct))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            {product
              ? `SKU original: ${product.sku}`
              : 'Completa los datos básicos. Stock se gestiona desde inventario o recepción.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e)
          }}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...register('sku')} />
              {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode">Código de barras</Label>
              <Input id="barcode" {...register('barcode')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" rows={2} {...register('description')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Categoría</Label>
              {creatingCategory ? (
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nombre de la categoría"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleCreateCategory()
                      } else if (e.key === 'Escape') {
                        setCreatingCategory(false)
                        setNewCategoryName('')
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => void handleCreateCategory()}
                    disabled={!newCategoryName.trim() || createCategoryMut.isPending}
                    title="Guardar"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setCreatingCategory(false)
                      setNewCategoryName('')
                    }}
                    title="Cancelar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <Select
                    value={categoryId ?? NONE}
                    onValueChange={(v) => setValue('categoryId', v, { shouldDirty: true })}
                  >
                    <SelectTrigger id="categoryId" className="flex-1">
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>(sin categoría)</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.parentId ? `- ${c.name}` : c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setCreatingCategory(true)}
                    title="Crear categoría nueva"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxRatePct">IVA</Label>
              <div className="flex gap-1">
                <Select
                  value={showCustomTax ? 'custom' : String(taxRatePct)}
                  onValueChange={(v) => {
                    if (v === 'custom') {
                      setIsCustomTax(true)
                    } else {
                      setIsCustomTax(false)
                      setValue('taxRatePct', Number(v), { shouldDirty: true })
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IVA_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={String(p.value / 100)}>
                        {p.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Otro…</SelectItem>
                  </SelectContent>
                </Select>
                {showCustomTax && (
                  <Input
                    id="taxRatePct"
                    type="number"
                    step="0.01"
                    className="w-24"
                    {...register('taxRatePct', { valueAsNumber: true })}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Precio de venta</Label>
              <MoneyInput
                valueCents={toCents(basePrice || 0)}
                onChangeCents={(c) => setValue('basePrice', fromCents(c), { shouldDirty: true })}
              />
              {errors.basePrice && (
                <p className="text-xs text-destructive">{errors.basePrice.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Precio de costo</Label>
              <MoneyInput
                valueCents={toCents(costPrice || 0)}
                onChangeCents={(c) => setValue('costPrice', fromCents(c), { shouldDirty: true })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lowStockThreshold">Avisarme cuando queden pocas unidades</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Avisar al bajar de</span>
              <Input
                id="lowStockThreshold"
                type="number"
                min={0}
                className="w-24"
                placeholder="—"
                {...register('lowStockThreshold', { valueAsNumber: true })}
              />
              <span className="text-sm text-muted-foreground">unidades</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Si lo dejas en blanco, se usa el aviso de la categoría y, si tampoco tiene, el aviso
              general de la tienda (Configuración).
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <Label>Descuento del producto</Label>
            <div className="flex items-center gap-2">
              <Select
                value={discountKind}
                onValueChange={(v) =>
                  setValue('discountKind', v as 'none' | 'percent' | 'amount', {
                    shouldDirty: true
                  })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin descuento</SelectItem>
                  <SelectItem value="percent">Porcentaje (%)</SelectItem>
                  <SelectItem value="amount">Monto fijo (USD)</SelectItem>
                </SelectContent>
              </Select>
              {discountKind !== 'none' && (
                <>
                  <Input
                    type="number"
                    step={discountKind === 'percent' ? '0.01' : '0.01'}
                    min={0}
                    className="w-32"
                    placeholder={discountKind === 'percent' ? '10' : '5.00'}
                    {...register('discountAmount', { valueAsNumber: true })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {discountKind === 'percent' ? '% de descuento' : 'USD menos'}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Si el producto tiene descuento propio, este manda sobre el de la categoría.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tracksSerial}
                onChange={(e) => setValue('tracksSerial', e.target.checked, { shouldDirty: true })}
                className="h-4 w-4 rounded border-input"
              />
              <span>Rastrea seriales / IMEI</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setValue('active', e.target.checked, { shouldDirty: true })}
                className="h-4 w-4 rounded border-input"
              />
              <span>Activo</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {product ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
