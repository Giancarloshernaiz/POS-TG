import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
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
import { usePurchaseOrders } from './hooks'
import { CreatePODialog } from './CreatePODialog'
import { PODetailDialog } from './PODetailDialog'
import { formatMoney } from '@renderer/lib/money'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  partial: 'Parcial',
  received: 'Recibida',
  closed: 'Cerrada',
  cancelled: 'Cancelada'
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'info' | 'success' | 'warning' | 'destructive' | 'secondary'
> = {
  draft: 'secondary',
  submitted: 'info',
  partial: 'warning',
  received: 'success',
  closed: 'default',
  cancelled: 'destructive'
}

export function PurchaseOrdersScreen(): React.JSX.Element {
  const { data, isLoading } = usePurchaseOrders()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Órdenes de compra</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} PO${data.total === 1 ? '' : 's'}` : '—'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nueva PO
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Esperada</TableHead>
              <TableHead>Creada</TableHead>
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
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Sin órdenes de compra.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-mono text-xs">{po.number}</TableCell>
                <TableCell className="font-medium">{po.supplierName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[po.status]}>{STATUS_LABEL[po.status]}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(po.totalAmount)}
                </TableCell>
                <TableCell className="text-sm">
                  {po.expectedAt ? new Date(po.expectedAt).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(po.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDetailId(po.id)}>
                    Ver
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreatePODialog open={createOpen} onOpenChange={setCreateOpen} />
      <PODetailDialog poId={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}
