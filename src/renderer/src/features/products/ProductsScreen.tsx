import { useState } from 'react'
import { Plus, Search, Pencil, Tag, Loader2 } from 'lucide-react'
import { useProducts, useCategories } from './hooks'
import { ProductForm } from './ProductForm'
import { CategoryDialog } from './CategoryDialog'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { DualPrice } from '@renderer/components/DualPrice'
import { formatDiscountLabel } from '@shared/pricing'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'

const ALL = '__all__'

export function ProductsScreen(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>(ALL)
  const [activeOnly, setActiveOnly] = useState(false)
  const [editing, setEditing] = useState<ProductDTO | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)

  const { data, isLoading } = useProducts({
    search: search || undefined,
    categoryId: categoryId === ALL ? undefined : categoryId,
    activeOnly
  })
  const { data: categories = [] } = useCategories()

  function openCreate(): void {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(p: ProductDTO): void {
    setEditing(p)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Productos</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} producto${data.total === 1 ? '' : 's'}` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCategoryOpen(true)}>
            <Tag className="h-4 w-4" />
            Categorías
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por SKU, nombre o código de barras…"
            className="pl-8"
          />
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Solo activos
        </label>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Atributos</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Sin productos.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  {p.categoryName ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {p.effectiveDiscountSource === 'none' ? (
                    <DualPrice cents={p.basePrice} />
                  ) : (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs text-muted-foreground line-through">
                        {`$${(p.basePrice / 100).toFixed(2)}`}
                      </span>
                      <DualPrice cents={p.effectivePrice} />
                      <Badge variant="success" className="mt-0.5">
                        {formatDiscountLabel({
                          type: p.effectiveDiscountType,
                          value: p.effectiveDiscountValue
                        })}
                        {p.effectiveDiscountSource === 'category' ? ' (cat.)' : ''}
                      </Badge>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">{p.stock}</TableCell>
                <TableCell className="space-x-1">
                  {p.tracksSerial && <Badge variant="info">Serial</Badge>}
                  {!p.active && <Badge variant="secondary">Inactivo</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ProductForm open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} />
    </div>
  )
}
