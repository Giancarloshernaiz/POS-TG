import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { useFindSerial, useSerials } from './hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'

const STATUS_LABEL: Record<string, string> = {
  available: 'Disponible',
  reserved: 'Reservado',
  sold: 'Vendido',
  returned: 'Devuelto',
  defective: 'Defectuoso'
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'info' | 'success' | 'warning' | 'destructive' | 'secondary'
> = {
  available: 'success',
  reserved: 'warning',
  sold: 'secondary',
  returned: 'info',
  defective: 'destructive'
}

export function SerialLookup(): React.JSX.Element {
  const [imei, setImei] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const { data: found, isFetching } = useFindSerial(submitted)
  const { data: recent } = useSerials({ limit: 25 })

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault()
    setSubmitted(imei.trim() || null)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            placeholder="Ingresá o escaneá un IMEI / serial…"
            className="pl-8"
            autoFocus
          />
        </div>
      </form>

      {submitted && (
        <Card>
          <CardHeader>
            <CardTitle>
              {isFetching ? 'Buscando…' : found ? `Serial ${found.imei}` : 'No encontrado'}
            </CardTitle>
            {found && (
              <CardDescription>
                {found.productName} ({found.productSku})
              </CardDescription>
            )}
          </CardHeader>
          {found && (
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Estado">
                  <Badge variant={STATUS_VARIANT[found.status]}>{STATUS_LABEL[found.status]}</Badge>
                </Field>
                <Field label="Ubicación">{found.locationId}</Field>
                <Field label="Recibido">{new Date(found.receivedAt).toLocaleDateString()}</Field>
                <Field label="Recibido via">{found.receivedVia ?? '—'}</Field>
                {found.currentSaleId && <Field label="Venta">{found.currentSaleId}</Field>}
                {found.notes && <Field label="Notas">{found.notes}</Field>}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Recientes</h3>
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IMEI</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Recibido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Sin seriales registrados.
                  </TableCell>
                </TableRow>
              )}
              {recent?.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.imei}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.productName}</div>
                    <div className="text-xs text-muted-foreground">{s.productSku}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(s.receivedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  )
}
