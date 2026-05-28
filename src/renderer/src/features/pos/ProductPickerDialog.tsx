// ─────────────────────────────────────────────────────────────────────────────
// TEMP BYPASS — selector manual de productos para testear sin lector de código.
// ELIMINAR (o gatear con "modo entrenamiento") antes de producción.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Search, Loader2, FlaskConical } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { searchProducts } from './hooks'
import { formatMoney } from '@renderer/lib/money'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'

type Props = {
  open: boolean
  onClose: () => void
  onPick: (product: ProductDTO) => void
}

export function ProductPickerDialog({ open, onClose, onPick }: Props): React.JSX.Element {
  const [term, setTerm] = useState('')
  const [items, setItems] = useState<ProductDTO[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = setTimeout(() => {
      if (!cancelled) setLoading(true)
      searchProducts(term)
        .then((rows) => {
          if (!cancelled) setItems(rows)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, term])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-500" />
            Buscar producto (modo prueba)
          </DialogTitle>
          <DialogDescription>
            Bypass temporal del lector de código. Elegí un producto para agregarlo.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Nombre o SKU…"
            className="pl-8"
          />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>
          )}
          {!loading &&
            items.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.sku} · stock {p.stock}
                    {p.tracksSerial && ' · serial'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.tracksSerial && <Badge variant="info">Serial</Badge>}
                  <span className="font-mono">{formatMoney(p.effectivePrice)}</span>
                </div>
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
