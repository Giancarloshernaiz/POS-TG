import { useState } from 'react'
import { Loader2, ArrowDownToLine, Lock, ShieldCheck } from 'lucide-react'
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
import { formatBsAmount, formatMoney } from '@renderer/lib/money'
import { CashAmountsInput } from './CashAmountsInput'
import { PAYMENT_METHOD_LABEL } from '@renderer/lib/paymentMethods'
import { useAuth } from '@renderer/stores/auth'
import { useFx } from '@renderer/stores/fx'
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
  const roleName = useAuth((s) => s.session?.roleName ?? '')
  const hasClosePermission = useAuth((s) => s.hasPermission('cash.close'))
  const canCloseWithoutApproval =
    (roleName === 'admin' || roleName === 'manager') && hasClosePermission
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
          <Button onClick={() => setCloseOpen(true)}>
            <Lock className="h-4 w-4" />
            {canCloseWithoutApproval ? 'Cerrar caja' : 'Solicitar cierre'}
          </Button>
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
          requiresApproval={!canCloseWithoutApproval}
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
          {report.refundCount > 0 && (
            <>
              <Row label={`Devoluciones (${report.refundCount})`} money={report.refundTotal} />
              <Row label="Venta neta" money={report.netSales} />
            </>
          )}
          <Row
            label="Monto inicial"
            value={`${formatMoney(report.openingAmount)} · ${formatBsAmount(report.openingVes)}`}
          />
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
                      {t.currency === 'VES'
                        ? `Bs ${(t.amountOriginal ?? 0).toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}`
                        : formatMoney(t.amountUsd)}
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
          <CardDescription>Inicial + ventas en efectivo + ingresos − retiros</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row
            label="Ingresos manuales"
            value={`${formatMoney(report.movementsIn)} · ${formatBsAmount(report.movementsInVes)}`}
          />
          <Row
            label="Retiros"
            value={`${formatMoney(report.movementsOut)} · ${formatBsAmount(report.movementsOutVes)}`}
          />
          <div className="border-t pt-2">
            <div className="text-xs text-muted-foreground">Efectivo físico esperado</div>
            <div className="text-lg font-bold">{formatMoney(report.expectedCashUsd)}</div>
            <div className="font-semibold text-muted-foreground">
              {formatBsAmount(report.expectedCashVes)}
            </div>
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
        <span className="font-mono">{formatMoney(money)}</span>
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
  const rate = useFx((state) => state.rate?.rate ?? null)
  const [amount, setAmount] = useState(0)
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD')
  const [reference, setReference] = useState('')

  async function submit(): Promise<void> {
    if (amount <= 0 || (currency === 'VES' && !rate)) {
      toast.error('Monto inválido')
      return
    }
    if (!type) return
    try {
      const amountCents =
        currency === 'USD' ? Math.round(amount * 100) : Math.round((amount / Number(rate)) * 100)
      await mut.mutateAsync({
        cashSessionId,
        type,
        amount: amountCents,
        amountOriginal: amount,
        currency,
        reference: reference || null
      })
      toast.success(type === 'deposit' ? 'Ingreso registrado' : 'Retiro registrado')
      setAmount(0)
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
          <DialogDescription>Selecciona la moneda real del efectivo que entra o sale.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="mvCurrency">Moneda</Label>
            <select
              id="mvCurrency"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value as 'USD' | 'VES')
                setAmount(0)
              }}
            >
              <option value="USD">Referencia</option>
              <option value="VES">Bolívares</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mvAmount">Monto</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {currency === 'USD' ? 'Ref.' : 'Bs'}
              </span>
              <Input
                id="mvAmount"
                type="number"
                min={0}
                step="0.01"
                className={currency === 'USD' ? 'pl-10' : 'pl-7'}
                value={amount || ''}
                onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
            {currency === 'VES' && !rate && (
              <p className="text-xs text-destructive">Carga la tasa antes de registrar bolívares.</p>
            )}
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
  report,
  requiresApproval
}: {
  open: boolean
  onClose: () => void
  cashSessionId: string
  report: CashReportDTO
  requiresApproval: boolean
}): React.JSX.Element {
  const mut = useCloseCash()
  const [declaredCents, setDeclaredCents] = useState(0)
  const [declaredVes, setDeclaredVes] = useState(0)
  const [touched, setTouched] = useState(false)
  const [approverUsername, setApproverUsername] = useState('')
  const [approverPassword, setApproverPassword] = useState('')

  const diff = declaredCents - report.expectedCashUsd
  const diffVes = declaredVes - report.expectedCashVes

  function closeDialog(): void {
    setDeclaredCents(0)
    setDeclaredVes(0)
    setTouched(false)
    setApproverUsername('')
    setApproverPassword('')
    onClose()
  }

  async function submit(): Promise<void> {
    if (declaredCents < 0) {
      toast.error('Monto inválido')
      return
    }
    if (requiresApproval && (!approverUsername.trim() || !approverPassword)) {
      toast.error('Ingresa las credenciales del gerente o administrador')
      return
    }
    try {
      const r = await mut.mutateAsync({
        cashSessionId,
        declaredClosing: declaredCents,
        declaredClosingVes: declaredVes,
        authorization: requiresApproval
          ? { username: approverUsername.trim(), password: approverPassword }
          : null
      })
      const os = r.overShort ?? 0
      const osVes = r.overShortVes ?? 0
      toast.success(
        os === 0 && osVes === 0
          ? 'Caja cerrada — cuadrada'
          : `Caja cerrada — diferencia ${formatMoney(os)} / ${formatBsAmount(osVes)}`
      )
      closeDialog()
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      const messages: Record<string, string> = {
        APPROVAL_REQUIRED: 'El cierre requiere autorización de gerente o administrador',
        INVALID_APPROVER:
          'Las credenciales no corresponden a un gerente o administrador autorizado',
        APPROVER_INACTIVE: 'El usuario autorizante está inactivo',
        RATE_LIMITED: 'Demasiados intentos. Espera un minuto antes de volver a intentar',
        SESSION_CLOSED: 'La caja ya fue cerrada'
      }
      toast.error(messages[code] ?? code)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar caja (arqueo)</DialogTitle>
          <DialogDescription>
            Cuenta el efectivo físico y decláralo. Se compara con lo esperado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-between rounded-md bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">Efectivo esperado</span>
            <span className="text-right font-mono font-semibold">
              <span className="block">{formatMoney(report.expectedCashUsd)}</span>
              <span className="block">{formatBsAmount(report.expectedCashVes)}</span>
            </span>
          </div>
          {report.refundCount > 0 && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <div className="flex justify-between">
                <span>Devoluciones aprobadas ({report.refundCount})</span>
                <span className="font-mono font-semibold">-{formatMoney(report.refundTotal)}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-orange-700">
                <span>Venta neta del período</span>
                <span className="font-mono">{formatMoney(report.netSales)}</span>
              </div>
              <p className="mt-2 text-xs text-orange-700">
                Se informa en el cierre, pero no reduce el efectivo esperado porque genera crédito
                al cliente.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="declared">Efectivo contado</Label>
            <CashAmountsInput
              idPrefix="declared"
              usdCents={declaredCents}
              vesAmount={declaredVes}
              onUsdCents={(c) => {
                setDeclaredCents(c)
                setTouched(true)
              }}
              onVesAmount={(value) => {
                setDeclaredVes(value)
                setTouched(true)
              }}
              autoFocus
            />
          </div>
          {touched && (
            <div
              className={
                'flex justify-between rounded-md p-3 text-sm ' +
                (diff === 0 && diffVes === 0
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : diff >= 0 && diffVes >= 0
                    ? 'bg-sky-500/10 text-sky-700'
                    : 'bg-rose-500/10 text-rose-700')
              }
            >
              <span>
                {diff === 0 && diffVes === 0
                  ? 'Cuadrada'
                  : diff >= 0 && diffVes >= 0
                    ? 'Sobrante'
                    : 'Diferencia'}
              </span>
              <span className="text-right font-mono font-semibold">
                <span className="block">{formatMoney(diff)}</span>
                <span className="block">{formatBsAmount(diffVes)}</span>
              </span>
            </div>
          )}
          {requiresApproval && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2 text-amber-900">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Autorización requerida</p>
                  <p className="text-xs text-amber-700">
                    Un gerente o administrador debe autorizar este cierre con sus credenciales.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="closeApprover">Usuario autorizante</Label>
                <Input
                  id="closeApprover"
                  value={approverUsername}
                  onChange={(event) => setApproverUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="Usuario de gerente o administrador"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closeApproverPassword">Contraseña</Label>
                <Input
                  id="closeApproverPassword"
                  type="password"
                  value={approverPassword}
                  onChange={(event) => setApproverPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeDialog}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              mut.isPending ||
              !touched ||
              (requiresApproval && (!approverUsername.trim() || !approverPassword))
            }
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {requiresApproval ? 'Autorizar y cerrar caja' : 'Cerrar caja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
