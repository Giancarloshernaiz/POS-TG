import { useState } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  X,
  Tag,
  Box,
  ShoppingBasket,
  ShoppingBag,
  Shirt,
  Smartphone,
  Tv,
  Utensils,
  CupSoda,
  Wrench,
  Home,
  Baby,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useCategories, useCreateCategory, useUpdateCategory } from './hooks'
import { formatDiscountLabel, type DiscountType } from '@shared/pricing'
import type { CategoryDTO } from '@shared/ipc/contracts/catalog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NO_PARENT = '__root__'
const CUSTOM_ICON = '__custom__'

// Íconos comunes para categorías de retail. Nombres de lucide-react — espejo
// visual del campo "simbolo" de Categoria en AgroOne (ellos usan otra versión
// de lucide, así que no todos los nombres calzan 1:1; ver CategoryIcon abajo).
// Import explícito (no `import *`) para no meter las ~5800 íconos al bundle.
const ICON_PRESETS = [
  'Box',
  'ShoppingBasket',
  'ShoppingBag',
  'Shirt',
  'Smartphone',
  'Tv',
  'Utensils',
  'CupSoda',
  'Wrench',
  'Home',
  'Baby',
  'Sparkles'
] as const
const ICON_MAP: Record<string, LucideIcon> = {
  Box,
  ShoppingBasket,
  ShoppingBag,
  Shirt,
  Smartphone,
  Tv,
  Utensils,
  CupSoda,
  Wrench,
  Home,
  Baby,
  Sparkles
}

/** Resuelve un nombre de ícono con fallback seguro (cubre nombres de AgroOne que no tengamos). */
function CategoryIcon({
  name,
  className
}: {
  name: string | null
  className?: string
}): React.JSX.Element {
  const Icon = (name && ICON_MAP[name]) || Tag
  return <Icon className={className} />
}

type Draft = {
  id: string | null
  name: string
  parentId: string
  threshold: string
  discountKind: DiscountType
  discountAmount: string
  icon: string
}

const EMPTY: Draft = {
  id: null,
  name: '',
  parentId: NO_PARENT,
  threshold: '',
  discountKind: 'none',
  discountAmount: '',
  icon: ''
}

export function CategoryDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const { data: categories = [] } = useCategories()
  const createMut = useCreateCategory()
  const updateMut = useUpdateCategory()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [isCustomIcon, setIsCustomIcon] = useState(false)

  const editing = draft.id !== null
  const showCustomIcon =
    isCustomIcon || (!!draft.icon && !(ICON_PRESETS as readonly string[]).includes(draft.icon))
  // Only root categories can be parents (single level of nesting).
  const parentOptions = categories.filter((c) => !c.parentId && c.id !== draft.id)

  function loadForEdit(c: CategoryDTO): void {
    setIsCustomIcon(false)
    setDraft({
      id: c.id,
      name: c.name,
      parentId: c.parentId ?? NO_PARENT,
      threshold: c.lowStockThreshold != null ? String(c.lowStockThreshold) : '',
      discountKind: c.discountType,
      discountAmount:
        c.discountType === 'none'
          ? ''
          : String(c.discountType === 'percent' ? c.discountValue / 100 : c.discountValue / 100),
      icon: c.icon ?? ''
    })
  }

  function discountValueRaw(): number {
    if (draft.discountKind === 'none' || !draft.discountAmount.trim()) return 0
    const n = parseFloat(draft.discountAmount)
    if (!Number.isFinite(n) || n < 0) return 0
    return draft.discountKind === 'percent' ? Math.round(n * 100) : Math.round(n * 100)
  }

  async function handleSave(): Promise<void> {
    if (!draft.name.trim()) return
    const threshold = draft.threshold.trim() ? parseInt(draft.threshold, 10) : null
    const payload = {
      name: draft.name.trim(),
      parentId: draft.parentId === NO_PARENT ? null : draft.parentId,
      lowStockThreshold: threshold,
      discountType: draft.discountKind,
      discountValue: discountValueRaw(),
      icon: draft.icon.trim() ? draft.icon.trim() : null
    }
    try {
      if (editing && draft.id) {
        await updateMut.mutateAsync({ id: draft.id, ...payload })
        toast.success('Categoría actualizada')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Categoría creada')
      }
      setDraft(EMPTY)
      setIsCustomIcon(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        DUPLICATE_NAME: 'Ya existe una categoría con ese nombre',
        INVALID_PARENT: 'Categoría padre inválida (solo 1 nivel de subcategoría)'
      }
      toast.error(human[msg] ?? msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Categorías y subcategorías</DialogTitle>
          <DialogDescription>
            Agrupa productos. Una categoría puede tener subcategorías (1 nivel). Opcional: aviso de
            stock bajo y descuento por categoría.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {editing ? 'Editar categoría' : 'Nueva categoría'}
            </span>
            {editing && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(EMPTY)}>
                <X className="h-3 w-3" />
                Cancelar edición
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Ej: Electrodomésticos"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subcategoría de</Label>
              <Select
                value={draft.parentId}
                onValueChange={(v) => setDraft((d) => ({ ...d, parentId: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>(categoría principal)</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ícono (espejo del &quot;símbolo&quot; en AgroOne)</Label>
            <div className="flex items-center gap-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border">
                <CategoryIcon name={draft.icon || null} className="h-4 w-4" />
              </div>
              <Select
                value={showCustomIcon ? CUSTOM_ICON : draft.icon || ICON_PRESETS[0]}
                onValueChange={(v) => {
                  if (v === CUSTOM_ICON) {
                    setIsCustomIcon(true)
                  } else {
                    setIsCustomIcon(false)
                    setDraft((d) => ({ ...d, icon: v }))
                  }
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_PRESETS.map((name) => (
                    <SelectItem key={name} value={name}>
                      <span className="flex items-center gap-2">
                        <CategoryIcon name={name} className="h-4 w-4" />
                        {name}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_ICON}>Otro (nombre de lucide-react)…</SelectItem>
                </SelectContent>
              </Select>
              {showCustomIcon && (
                <Input
                  className="w-32"
                  value={draft.icon}
                  onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                  placeholder="Ej: CupSoda"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Avisar al bajar de (unidades)</Label>
              <Input
                type="number"
                min={0}
                value={draft.threshold}
                onChange={(e) => setDraft((d) => ({ ...d, threshold: e.target.value }))}
                placeholder="opcional"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descuento de la categoría</Label>
              <div className="flex gap-1">
                <Select
                  value={draft.discountKind}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, discountKind: v as DiscountType }))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin descuento</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                    <SelectItem value="amount">USD</SelectItem>
                  </SelectContent>
                </Select>
                {draft.discountKind !== 'none' && (
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-20"
                    value={draft.discountAmount}
                    onChange={(e) => setDraft((d) => ({ ...d, discountAmount: e.target.value }))}
                    placeholder={draft.discountKind === 'percent' ? '10' : '5'}
                  />
                )}
              </div>
            </div>
          </div>

          <Button onClick={() => void handleSave()} disabled={!draft.name.trim()}>
            <Plus className="h-4 w-4" />
            {editing ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          {categories.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Sin categorías.</p>
          )}
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-0"
            >
              <span
                className={
                  c.parentId
                    ? 'flex items-center gap-1.5 pl-4 text-sm'
                    : 'flex items-center gap-1.5 text-sm font-medium'
                }
              >
                <CategoryIcon name={c.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                {c.parentId ? `└ ${c.name}` : c.name}
              </span>
              <div className="flex items-center gap-2">
                {c.lowStockThreshold != null && (
                  <Badge variant="secondary">aviso ≤ {c.lowStockThreshold}</Badge>
                )}
                {c.discountType !== 'none' && (
                  <Badge variant="success">
                    {formatDiscountLabel({ type: c.discountType, value: c.discountValue })}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" onClick={() => loadForEdit(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
