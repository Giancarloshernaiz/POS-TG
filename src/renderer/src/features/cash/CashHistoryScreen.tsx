import { useMemo, useState } from 'react'
import { Eye, Loader2, Printer, Search, Scale, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { formatMoney } from '@renderer/lib/money'
import { PAYMENT_METHOD_LABEL } from '@renderer/lib/paymentMethods'
import { useAuth } from '@renderer/stores/auth'
import type { CashReportDTO } from '@shared/ipc/contracts/cash'
import { printCashReport, useCashHistory } from './hooks'

function startOfDay(value: string): number | undefined {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined
}

function endOfDay(value: string): number | undefined {
  return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined
}

function duration(openedAt: number, closedAt: number | null): string {
  if (!closedAt) return '—'
  const minutes = Math.max(0, Math.floor((closedAt - openedAt) / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}

function ResultBadge({ amount }: { amount: number | null }): React.JSX.Element {
  const value = amount ?? 0
  if (value === 0) return <Badge variant="success">Cuadrada</Badge>
  if (value > 0) return <Badge variant="info">Sobrante {formatMoney(value)}</Badge>
  return <Badge variant="destructive">Faltante {formatMoney(Math.abs(value))}</Badge>
}

export function CashHistoryScreen(): React.JSX.Element {
  const sessionId = useAuth((state) => state.session?.id ?? '')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<CashReportDTO | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const { data, isLoading, error } = useCashHistory({
    search: search.trim() || undefined,
    from: startOfDay(from),
    to: endOfDay(to)
  })

  const summary = useMemo(() => {
    const items = data?.items ?? []
    return {
      sales: items.reduce((sum, report) => sum + report.salesGross, 0),
      refunds: items.reduce((sum, report) => sum + report.refundTotal, 0),
      netSales: items.reduce((sum, report) => sum + report.netSales, 0),
      shortages: items.reduce((sum, report) => sum + Math.max(0, -(report.overShort ?? 0)), 0),
      surpluses: items.reduce((sum, report) => sum + Math.max(0, report.overShort ?? 0), 0)
    }
  }, [data])

  async function handlePrint(report: CashReportDTO): Promise<void> {
    setPrintingId(report.sessionId)
    try {
      await printCashReport(sessionId, report.sessionId)
      toast.success('Reporte Z enviado a la impresora')
    } catch (e) {
      const errorCode = (e as { code?: string }).code
      const message = e instanceof Error ? e.message : String(e)
      toast.error(
        errorCode === 'PRINTER_NOT_CONFIGURED'
          ? 'Configura la impresora antes de imprimir'
          : `No se pudo imprimir: ${message}`
      )
    } finally {
      setPrintingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Historial de cajas</h2>
        <p className="text-sm text-muted-foreground">
          Consulta arqueos, diferencias y métodos de pago de cada caja cerrada.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Cajas cerradas" value={String(data?.total ?? 0)} />
        <SummaryCard title="Ventas registradas" value={formatMoney(summary.sales)} />
        <SummaryCard title="Devoluciones" value={formatMoney(summary.refunds)} tone="danger" />
        <SummaryCard title="Venta neta" value={formatMoney(summary.netSales)} tone="success" />
        <SummaryCard title="Faltantes" value={formatMoney(summary.shortages)} tone="danger" />
        <SummaryCard title="Sobrantes" value={formatMoney(summary.surpluses)} tone="success" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="cashier-search">Cajero</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cashier-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre del cajero"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cash-from">Desde</Label>
            <Input
              id="cash-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cash-to">Hasta</Label>
            <Input id="cash-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(search || from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('')
                setFrom('')
                setTo('')
              }}
            >
              Limpiar
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cierre</TableHead>
              <TableHead>Cajero</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead className="text-right">Ventas / devoluciones</TableHead>
              <TableHead className="text-right">Esperado</TableHead>
              <TableHead className="text-right">Contado</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && error && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-destructive">
                  No se pudo cargar el historial: {error.message}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !error && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No hay cajas cerradas con estos filtros.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((report) => (
              <TableRow key={report.sessionId}>
                <TableCell>
                  <div className="font-medium">
                    {report.closedAt ? new Date(report.closedAt).toLocaleDateString('es-VE') : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {report.closedAt
                      ? new Date(report.closedAt).toLocaleTimeString('es-VE', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '—'}
                  </div>
                </TableCell>
                <TableCell>{report.userName}</TableCell>
                <TableCell>{duration(report.openedAt, report.closedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="font-mono font-medium">{formatMoney(report.salesGross)}</div>
                  <div className="text-xs text-muted-foreground">{report.salesCount} ventas</div>
                  {report.refundCount > 0 && (
                    <div className="text-xs text-orange-700">
                      -{formatMoney(report.refundTotal)} · {report.refundCount} dev.
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(report.expectedCashUsd)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(report.closingAmount ?? 0)}
                </TableCell>
                <TableCell>
                  <ResultBadge amount={report.overShort} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelected(report)}
                    title="Ver detalle"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handlePrint(report)}
                    disabled={printingId === report.sessionId}
                    title="Imprimir reporte Z"
                  >
                    {printingId === report.sessionId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CashReportDialog
        report={selected}
        printing={selected !== null && printingId === selected.sessionId}
        onClose={() => setSelected(null)}
        onPrint={(report) => void handlePrint(report)}
      />
    </div>
  )
}

function SummaryCard({
  title,
  value,
  tone = 'default'
}: {
  title: string
  value: string
  tone?: 'default' | 'success' | 'danger'
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent
        className={
          'text-2xl font-bold ' +
          (tone === 'success' ? 'text-emerald-700' : tone === 'danger' ? 'text-rose-700' : '')
        }
      >
        {value}
      </CardContent>
    </Card>
  )
}

function CashReportDialog({
  report,
  printing,
  onClose,
  onPrint
}: {
  report: CashReportDTO | null
  printing: boolean
  onClose: () => void
  onPrint: (report: CashReportDTO) => void
}): React.JSX.Element {
  if (!report) return <></>
  const methods = Object.entries(report.byMethod)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del cierre de caja</DialogTitle>
          <DialogDescription>
            {report.userName} · {new Date(report.openedAt).toLocaleString('es-VE')} —{' '}
            {report.closedAt ? new Date(report.closedAt).toLocaleString('es-VE') : 'Sin cierre'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <DetailCard
            label="Ventas"
            value={`${report.salesCount} · ${formatMoney(report.salesGross)}`}
          />
          {report.refundCount > 0 && (
            <DetailCard
              label="Devoluciones"
              value={`${report.refundCount} · -${formatMoney(report.refundTotal)}`}
            />
          )}
          <DetailCard label="Efectivo esperado" value={formatMoney(report.expectedCashUsd)} />
          <div className="rounded-lg border p-3">
            <div className="mb-2 text-xs text-muted-foreground">Resultado</div>
            <ResultBadge amount={report.overShort} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <WalletCards className="h-4 w-4" /> Métodos de pago
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {methods.length === 0 && (
                <p className="text-muted-foreground">Sin pagos registrados.</p>
              )}
              {methods.map(([method, totals]) => (
                <DetailRow
                  key={method}
                  label={`${PAYMENT_METHOD_LABEL[method] ?? method} (${totals.count})`}
                  value={formatMoney(totals.amountUsd)}
                />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="h-4 w-4" /> Arqueo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <DetailRow label="Monto inicial" value={formatMoney(report.openingAmount)} />
              <DetailRow label="Ingresos" value={formatMoney(report.movementsIn)} />
              <DetailRow label="Retiros" value={formatMoney(report.movementsOut)} />
              {report.refundCount > 0 && (
                <>
                  <DetailRow label="Devoluciones" value={`-${formatMoney(report.refundTotal)}`} />
                  <DetailRow label="Venta neta" value={formatMoney(report.netSales)} strong />
                </>
              )}
              <DetailRow label="Esperado" value={formatMoney(report.expectedCashUsd)} strong />
              <DetailRow label="Contado" value={formatMoney(report.closingAmount ?? 0)} strong />
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => onPrint(report)} disabled={printing}>
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Imprimir reporte Z
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailCard({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono font-semibold">{value}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  strong = false
}: {
  label: string
  value: string
  strong?: boolean
}): React.JSX.Element {
  return (
    <div
      className={
        'flex items-center justify-between gap-4 ' + (strong ? 'border-t pt-2 font-semibold' : '')
      }
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
