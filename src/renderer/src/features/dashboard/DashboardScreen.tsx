import { Receipt, Wallet, AlertTriangle, Users2, TrendingUp, type LucideIcon } from 'lucide-react'
import { useAuth } from '@renderer/stores/auth'
import { useFx } from '@renderer/stores/fx'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { useActiveSession, useCashReport } from '@renderer/features/cash/hooks'
import { useStock } from '@renderer/features/inventory/hooks'
import { useCustomers } from '@renderer/features/customers/hooks'
import { useSales } from '@renderer/features/reports/hooks'
import { formatMoney, formatRate } from '@renderer/lib/money'

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function DashboardScreen(): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const rate = useFx((s) => s.rate?.rate ?? null)
  const { data: active } = useActiveSession()
  const { data: report } = useCashReport(active?.id ?? null)
  const { data: stock } = useStock({ activeOnly: true })
  const { data: customers } = useCustomers({ withDebtOnly: true })
  const { data: salesData } = useSales({})

  const today = startOfToday()
  const todaySales = (salesData?.items ?? []).filter(
    (s) => s.status === 'completed' && s.createdAt >= today
  )
  const todayCount = todaySales.length
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0)

  const lowStock = (stock ?? []).filter((r) => r.isLow)
  const debtors = customers ?? []
  const totalDebt = debtors.reduce((sum, c) => sum + c.currentBalance, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Hola, {session?.fullName}</h2>
        <p className="text-sm text-muted-foreground">
          Resumen de hoy · Tasa BCV: <span className="font-mono">{formatRate(rate)}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Receipt}
          label="Ventas de hoy"
          value={String(todayCount)}
          sub={formatMoney(todayTotal)}
          tone="default"
        />
        <Kpi
          icon={Wallet}
          label="Estado de caja"
          value={active ? 'Abierta' : 'Cerrada'}
          sub={
            active && report
              ? `Esperado: ${formatMoney(report.expectedCashUsd)}`
              : 'Sin turno activo'
          }
          tone={active ? 'success' : 'muted'}
        />
        <Kpi
          icon={AlertTriangle}
          label="Productos con stock bajo"
          value={String(lowStock.length)}
          sub={lowStock.length > 0 ? 'Requieren reposición' : 'Todo en orden'}
          tone={lowStock.length > 0 ? 'warning' : 'success'}
        />
        <Kpi
          icon={Users2}
          label="Clientes con deuda"
          value={String(debtors.length)}
          sub={totalDebt > 0 ? `Total: ${formatMoney(totalDebt)}` : 'Sin deudas'}
          tone={totalDebt > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Stock bajo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ningún producto bajo el umbral.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lowStock.slice(0, 8).map((r) => (
                  <li
                    key={r.productId}
                    className="flex items-center justify-between border-b py-1 last:border-0"
                  >
                    <span>{r.name}</span>
                    <Badge variant="warning">
                      {r.quantity} / {r.effectiveThreshold}
                    </Badge>
                  </li>
                ))}
                {lowStock.length > 8 && (
                  <li className="pt-1 text-xs text-muted-foreground">
                    +{lowStock.length - 8} más…
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Últimas ventas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaySales.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas hoy todavía.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {todaySales.slice(0, 8).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between border-b py-1 last:border-0"
                  >
                    <span className="font-mono text-xs">{s.number}</span>
                    <span className="text-muted-foreground">
                      {new Date(s.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="font-mono">{formatMoney(s.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone
}: {
  icon: LucideIcon
  label: string
  value: string
  sub: string
  tone: 'default' | 'success' | 'warning' | 'muted'
}): React.JSX.Element {
  const toneClass = {
    default: 'text-primary',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    muted: 'text-muted-foreground'
  }[tone]
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 ${toneClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold leading-tight">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{sub}</div>
        </div>
      </CardContent>
    </Card>
  )
}
