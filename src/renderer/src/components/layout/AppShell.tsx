import { type ReactNode, useState } from 'react'
import {
  LogOut,
  Menu,
  Receipt,
  Boxes,
  Users2,
  BarChart3,
  Settings,
  Wallet,
  LayoutDashboard,
  PackageOpen,
  PackageCheck
} from 'lucide-react'
import { useAuth } from '@renderer/stores/auth'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { FxBadge } from '@renderer/components/FxBadge'
import { cn } from '@renderer/lib/utils'
import logoUrl from '@renderer/assets/logo.png'

type NavItem = {
  key: string
  label: string
  icon: typeof Receipt
  permission?: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { key: 'pos', label: 'Punto de venta', icon: Receipt, permission: 'sales.create' },
  { key: 'cash', label: 'Caja', icon: Wallet, permission: 'cash.open' },
  { key: 'products', label: 'Productos', icon: PackageOpen, permission: 'products.view' },
  { key: 'inventory', label: 'Inventario', icon: Boxes, permission: 'inventory.view' },
  {
    key: 'reception',
    label: 'Recepciones',
    icon: PackageCheck,
    permission: 'inventory.receive'
  },
  { key: 'customers', label: 'Clientes', icon: Users2, permission: 'customers.view' },
  // Es un historial de ventas, no un tablero de reportes: se llama por lo que
  // hace, si no nadie encuentra la reimpresión ni la devolución.
  { key: 'reports', label: 'Historial de ventas', icon: BarChart3, permission: 'reports.sales' },
  { key: 'settings', label: 'Configuración', icon: Settings, permission: 'settings.manage' }
]

type Props = {
  active: string
  onNavigate: (key: string) => void
  children: ReactNode
}

export function AppShell({ active, onNavigate, children }: Props): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const clear = useAuth((s) => s.clear)
  const [collapsed, setCollapsed] = useState(false)

  async function handleLogout(): Promise<void> {
    if (!session) return
    await api.auth.logout({ sessionId: session.id })
    clear()
  }

  const visibleItems = NAV_ITEMS.filter(
    (i) => !i.permission || session?.permissions.includes(i.permission)
  )

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'flex h-full flex-col border-r bg-card transition-[width]',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b px-3',
            collapsed ? 'justify-center' : 'justify-between gap-2'
          )}
        >
          {!collapsed && (
            <img
              src={logoUrl}
              alt="Tiendas Galas"
              className="h-10 w-auto max-w-40 object-contain"
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((v) => !v)}
            aria-label="toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {visibleItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active === item.key
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>
        <div className="border-t p-2">
          <button
            onClick={() => {
              void handleLogout()
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-6">
          <h1 className="text-base font-semibold capitalize">{active}</h1>
          <div className="flex items-center gap-4 text-sm">
            <FxBadge />
            <div className="text-right">
              <div className="font-medium">{session?.fullName}</div>
              <div className="text-xs text-muted-foreground">{session?.roleName}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {session?.fullName.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
