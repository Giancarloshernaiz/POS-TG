import { useState } from 'react'
import { Loader2, ArrowDownToLine, ArrowUpFromLine, Lock } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { useActiveSession, useCashReport, useAddMovement, useCloseCash } from './hooks'
import { OpenCashForm } from './OpenCashForm'
import { formatMoney } from '@renderer/lib/money'
import { DualPrice } from '@renderer/components/DualPrice'
import { MoneyInput } from '@renderer/components/MoneyInput'
import { PAYMENT_METHOD_LABEL } from '@renderer/lib/paymentMethods'
import { useAuth } from '@renderer/stores/auth'
import type { CashReportDTO } from '@shared/ipc/contracts/cash'

export function CashScreen(): React.JSX.Element {
  const { data: active, isLoading } = useActiveSession()

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return active ? <OpenSessionView cashSessionId={active.id} /> : <OpenCashForm />
}

function OpenSessionView({ cashSessionId }: { cashSessionId: string }): React.JSX.Element {
  const { data: report } = useCashReport(cashSessionId)
  const canClose = useAuth((s) => s.hasPermission('cash.close'))
  const [movementOpen, setMovementOpen] = useState<'deposit' | 'withdrawal' | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Caja abierta</h2>
          <p className="text-sm text-muted-foreground">
            {report
              ? `Cajero: ${report.userName} · abierta ${new Date(report.openedAt).toLocaleString()}`
              : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMovementOpen('deposit')}>
            <ArrowDownToLine className="h-4 w-4" />
            Ingreso
          </Button>
          <Button variant="outline" onClick={() => setMovementOpen('withdrawal')}>
            <ArrowUpFromLine className="h-4 w-4" />
            Retiro
          </Button>
          {canClose && (
            <Button onClick={() => setCloseOpen(true)}>
              <Lock className="h-4 w-4" />
              Cerrar caja
            </Button>
          )}
        </div>
      </div>

      {report && <ReportView report={report} />}

      <MovementDialog
        cashSessionId={cashSessionId}
        type={movementOpen}
        onClose={() => setMovementOpen(null)}
      />
      {report && (
        <CloseDialog
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          cashSessionId={cashSessionId}
          report={report}
        />
      )}
    </div>
  )
}

function ReportView({ report }: { report: CashReportDTO }): React.JSX.Element {
  const methods = Object.entries(report.byMethod)
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen (X)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Ventas" value={String(report.salesCount)} />
          <Row label="Bruto" money={report.salesGross} />
          <Row label="IVA" money={report.taxTotal} />
          <Row label="IGTF" money={report.igtfTotal} />
          <Row label="Monto inicial" money={report.openingAmount} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por método de pago</CardTitle>
        </CardHeader>
        <CardContent>
          {methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methods.map(([m, t]) => (
                  <TableRow key={m}>
                    <TableCell>{PAYMENT_METHOD_LABEL[m] ?? m}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMoney(t.amountUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Efectivo esperado en caja</CardTitle>
          <CardDescription>Inicial + efectivo $ + ingresos − retiros</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Ingresos manuales" money={report.movementsIn} />
          <Row label="Retiros" money={report.movementsOut} />
          <div className="border-t pt-2">
            <div className="text-xs text-muted-foreground">Esperado (USD)</div>
            <DualPrice cents={report.expectedCashUsd} align="left" className="text-lg font-bold" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({
  label,
  value,
  money
}: {
  label: string
  value?: string
  money?: number
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between border-b py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      {money !== undefined ? (
        <DualPrice cents={money} />
      ) : (
        <span className="font-mono">{value}</span>
      )}
    </div>
  )
}

function MovementDialog({
  cashSessionId,
  type,
  onClose
}: {
  cashSessionId: string
  type: 'deposit' | 'withdrawal' | null
  onClose: () => void
}): React.JSX.Element {
  const mut = useAddMovement()
  const [amountCents, setAmountCents] = useState(0)
  const [reference, setReference] = useState('')

  async function submit(): Promise<void> {
    if (amountCents <= 0) {
      toast.error('Monto inválido')
      return
    }
    if (!type) return
    try {
      await mut.mutateAsync({
        cashSessionId,
        type,
        amount: amountCents,
        reference: reference || null
      })
      toast.success(type === 'deposit' ? 'Ingreso registrado' : 'Retiro registrado')
      setAmountCents(0)
      setReference('')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === 'deposit' ? 'Ingreso de efectivo' : 'Retiro de efectivo'}
          </DialogTitle>
          <DialogDescription>Ingresá el monto en $ o en Bs.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="mvAmount">Monto</Label>
            <MoneyInput id="mvAmount" valueCents={amountCents} onChangeCents={setAmountCents} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mvRef">Referencia / motivo</Label>
            <Input id="mvRef" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CloseDialog({
  open,
  onClose,
  cashSessionId,
  report
}: {
  open: boolean
  onClose: () => void
  cashSessionId: string
  report: CashReportDTO
}): React.JSX.Element {
  const mut = useCloseCash()
  const [declaredCents, setDeclaredCents] = useState(0)
  const [touched, setTouched] = useState(false)

  const diff = declaredCents - report.expectedCashUsd

  async function submit(): Promise<void> {
    if (declaredCents < 0) {
      toast.error('Monto inválido')
      return
    }
    try {
      const r = await mut.mutateAsync({ cashSessionId, declaredClosing: declaredCents })
      const os = r.overShort ?? 0
      toast.success(
        os === 0
          ? 'Caja cerrada — cuadrada'
          : `Caja cerrada — ${os > 0 ? 'sobrante' : 'faltante'} ${formatMoney(Math.abs(os))}`
      )
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar caja (arqueo)</DialogTitle>
          <DialogDescription>
            Contá el efectivo físico y declaralo. Se compara con lo esperado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-between rounded-md bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">Efectivo esperado</span>
            <span className="font-mono font-semibold">{formatMoney(report.expectedCashUsd)}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="declared">Efectivo contado</Label>
            <MoneyInput
              id="declared"
              valueCents={declaredCents}
              onChangeCents={(c) => {
                setDeclaredCents(c)
                setTouched(true)
              }}
              autoFocus
            />
          </div>
          {touched && (
            <div
              className={
                'flex justify-between rounded-md p-3 text-sm ' +
                (diff === 0
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : diff > 0
                    ? 'bg-sky-500/10 text-sky-700'
                    : 'bg-rose-500/10 text-rose-700')
              }
            >
              <span>{diff === 0 ? 'Cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
              <span className="font-mono font-semibold">{formatMoney(Math.abs(diff))}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={mut.isPending || !touched}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cerrar caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
