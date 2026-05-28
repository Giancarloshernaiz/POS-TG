import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { listAvailableSerials } from './hooks'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'
import type { SerialDTO } from '@shared/ipc/contracts/inventory'

type Props = {
  product: ProductDTO | null
  onPick: (serial: SerialDTO) => void
  onClose: () => void
}

export function SerialPickDialog({ product, onPick, onClose }: Props): React.JSX.Element {
  const [serials, setSerials] = useState<SerialDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!product) return
    let cancelled = false
    listAvailableSerials(product.id)
      .then((rows) => {
        if (!cancelled) setSerials(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [product])

  const filtered = search
    ? serials.filter((s) => s.imei.toLowerCase().includes(search.toLowerCase()))
    : serials

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seleccionar serial / IMEI</DialogTitle>
          <DialogDescription>{product?.name} — escaneá o elegí una unidad.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Escaneá o buscá IMEI…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length === 1 && filtered[0]) {
              onPick(filtered[0])
            }
          }}
        />
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Sin seriales disponibles.</p>
          )}
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
            >
              <span className="font-mono">{s.imei}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
