import { useState } from 'react'
import { useAuth } from './stores/auth'
import { useFxInit } from './features/fx/useFxInit'
import { useAgroSyncInit } from './features/sync/useAgroSyncInit'
import { LoginScreen } from './features/auth/LoginScreen'
import { ChangePasswordScreen } from './features/auth/ChangePasswordScreen'
import { DashboardScreen } from './features/dashboard/DashboardScreen'
import { ProductsScreen } from './features/products/ProductsScreen'
import { InventoryScreen } from './features/inventory/InventoryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { CashScreen } from './features/cash/CashScreen'
import { CashHistoryScreen } from './features/cash/CashHistoryScreen'
import { CustomersScreen } from './features/customers/CustomersScreen'
import { POSScreen } from './features/pos/POSScreen'
import { ReportsScreen } from './features/reports/ReportsScreen'
import { ReceptionScreen } from './features/reception/ReceptionScreen'
import { AppShell } from './components/layout/AppShell'

function App(): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const [active, setActive] = useState('dashboard')
  useFxInit()
  useAgroSyncInit()

  if (!session) return <LoginScreen />
  if (session.mustChangePassword) return <ChangePasswordScreen />

  let content: React.JSX.Element
  switch (active) {
    case 'dashboard':
      content = <DashboardScreen />
      break
    case 'products':
      content = <ProductsScreen />
      break
    case 'inventory':
      content = <InventoryScreen />
      break
    case 'settings':
      content = <SettingsScreen />
      break
    case 'cash':
      content = <CashScreen />
      break
    case 'cash-history':
      content = <CashHistoryScreen />
      break
    case 'customers':
      content = <CustomersScreen />
      break
    case 'pos':
      content = <POSScreen />
      break
    case 'reception':
      content = <ReceptionScreen />
      break
    case 'reports':
      content = <ReportsScreen />
      break
    default:
      content = <DashboardScreen />
  }

  return (
    <AppShell active={active} onNavigate={setActive}>
      {content}
    </AppShell>
  )
}

export default App
