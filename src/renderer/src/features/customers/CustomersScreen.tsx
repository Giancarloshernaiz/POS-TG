import { useState } from 'react'
import { Plus, Search, Pencil, Wallet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Label } from '@renderer/components/ui/label'
import { useCustomers, useCustomerLedger, useRegisterArPayment } from './hooks'
import { CustomerForm } from './CustomerForm'
import { DualPrice } from '@renderer/components/DualPrice'
import { formatMoney } from '@renderer/lib/money'
import { MoneyInput } from '@renderer/components/MoneyInput'
import { useAuth } from '@renderer/stores/auth'
import type { CustomerDTO } from '@shared/ipc/contracts/customers'

export function CustomersScreen(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [debtOnly, setDebtOnly] = useState(false)
  const { data, isLoading } = useCustomers({ search: search || undefined, withDebtOnly: debtOnly })
  const [editing, setEditing] = useState<CustomerDTO | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [ledgerOf, setLedgerOf] = useState<CustomerDTO | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.length} cliente${data.length === 1 ? '' : 's'}` : '—'}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, documento o teléfono…"
            className="pl-8"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={debtOnly}
            onChange={(e) => setDebtOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Solo con deuda
        </label>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Límite</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Sin clientes.
                </TableCell>
              </TableRow>
            )}
            {data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {c.docType && c.docId ? `${c.docType}-${c.docId}` : '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {c.phone && <div>{c.phone}</div>}
                  {c.email && <div className="text-muted-foreground">{c.email}</div>}
                </TableCell>
                <TableCell className="text-right">
                  {c.currentBalance > 0 ? (
                    <DualPrice cents={c.currentBalance} className="text-rose-600" />
                  ) : (
                    <span className="font-mono text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {c.creditLimit > 0 ? (
                    <DualPrice cents={c.creditLimit} className="text-muted-foreground" />
                  ) : (
                    <span className="font-mono text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {c.currentBalance > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setLedgerOf(c)}>
                      <Wallet className="h-3 w-3" />
                      Cuenta
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(c)
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

      <CustomerForm open={formOpen} onOpenChange={setFormOpen} customer={editing} />
      <LedgerDialog customer={ledgerOf} onClose={() => setLedgerOf(null)} />
    </div>
  )
}

function LedgerDialog({
  customer,
  onClose
}: {
  customer: CustomerDTO | null
  onClose: () => void
}): React.JSX.Element {
  const { data: ledger } = useCustomerLedger(customer?.id ?? null)
  const payMut = useRegisterArPayment()
  const canManage = useAuth((s) => s.hasPermission('customers.manage'))
  const [amountCents, setAmountCents] = useState(0)

  async function pay(): Promise<void> {
    if (!customer) return
    if (amountCents <= 0) {
      toast.error('Monto inválido')
      return
    }
    try {
      await payMut.mutateAsync({ customerId: customer.id, amount: amountCents })
      toast.success('Abono registrado')
      setAmountCents(0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cuenta corriente — {customer?.name}</DialogTitle>
          <DialogDescription>Saldo y movimientos de crédito.</DialogDescription>
        </DialogHeader>

        {customer && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <span className="text-sm text-muted-foreground">Saldo actual (debe)</span>
              <DualPrice cents={customer.currentBalance} className="text-lg font-bold" />
            </div>

            {canManage && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="abono">Registrar abono</Label>
                  <MoneyInput id="abono" valueCents={amountCents} onChangeCents={setAmountCents} />
                </div>
                <Button onClick={() => void pay()} disabled={payMut.isPending || amountCents <= 0}>
                  {payMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Abonar
                </Button>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                        Sin movimientos.
                      </TableCell>
                    </TableRow>
                  )}
                  {ledger?.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{new Date(m.ts).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={m.type === 'payment' ? 'success' : 'secondary'}>
                          {m.type === 'charge'
                            ? 'Cargo'
                            : m.type === 'payment'
                              ? 'Abono'
                              : 'Ajuste'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoney(Math.abs(m.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
