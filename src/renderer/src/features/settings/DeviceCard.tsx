import { useState } from 'react'
import { Loader2, MonitorSmartphone, Link2, Link2Off } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { useDeviceIdentity } from './hooks'
import { ProvisioningWizard } from './ProvisioningWizard'

// Identidad de la caja + vinculación con AgroOne (plan §31.3).
export function DeviceCard(): React.JSX.Element {
  const { data: identity, isLoading } = useDeviceIdentity()
  const [wizardOpen, setWizardOpen] = useState(false)

  const provisioned = !!identity && identity.storeId !== null && identity.provisionedAt !== null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4" /> Identidad de la caja
            </CardTitle>
            <CardDescription>
              Vincula esta caja a una tienda del máster AgroOne para sincronizar inventario y
              ventas.
            </CardDescription>
          </div>
          {identity && (
            <Button
              variant={provisioned ? 'outline' : 'default'}
              onClick={() => setWizardOpen(true)}
            >
              {provisioned ? (
                <>
                  <Link2 className="h-4 w-4" /> Re-vincular
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" /> Vincular con AgroOne
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !identity ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando identidad…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estado">
              {provisioned ? (
                <Badge variant="default">
                  <Link2 className="mr-1 h-3 w-3" /> Vinculada
                </Badge>
              ) : (
                <Badge variant="warning">
                  <Link2Off className="mr-1 h-3 w-3" /> Sin vincular
                </Badge>
              )}
            </Field>
            <Field label="Caja">{identity.nodeLabel}</Field>
            <Field label="Tienda">
              {identity.storeName ? `${identity.storeName} (#${identity.storeId})` : '—'}
            </Field>
            <Field label="Sede">{identity.sedeId !== null ? `#${identity.sedeId}` : '—'}</Field>
            <Field label="AgroOne">{identity.agroBaseUrl ?? '—'}</Field>
            <Field label="ID de nodo">
              <span className="font-mono text-xs" title={identity.nodeId}>
                …{identity.nodeId.slice(-8)}
              </span>
            </Field>
          </div>
        )}
      </CardContent>

      {identity && wizardOpen && (
        <ProvisioningWizard open identity={identity} onClose={() => setWizardOpen(false)} />
      )}
    </Card>
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
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}
