import { useState } from 'react'
import { Plus, Pencil, Loader2 } from 'lucide-react'
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
import { useSuppliers } from './hooks'
import { SupplierForm } from './SupplierForm'
import type { SupplierDTO } from '@shared/ipc/contracts/purchasing'

export function SuppliersScreen(): React.JSX.Element {
  const { data, isLoading } = useSuppliers()
  const [editing, setEditing] = useState<SupplierDTO | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Proveedores</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.length} proveedor${data.length === 1 ? '' : 'es'}` : '—'}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>RIF</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Sin proveedores.
                </TableCell>
              </TableRow>
            )}
            {data?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="font-mono text-xs">{s.taxId ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {s.email && <div>{s.email}</div>}
                  {s.phone && <div className="text-muted-foreground">{s.phone}</div>}
                </TableCell>
                <TableCell>{!s.active && <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(s)
                      setFormOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SupplierForm open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
    </div>
  )
}
