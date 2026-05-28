import { useState } from 'react'
import { Loader2, Save, Building2 } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useAuth } from '@renderer/stores/auth'
import { CONTRIBUYENTE_TYPES, isValidRif, type ContribuyenteType } from '@shared/fiscal'
import { useStoreProfile, useSetStoreProfile } from './hooks'

type Draft = {
  legalName: string
  rif: string
  address: string
  city: string
  state: string
  phone: string
  fiscalType: ContribuyenteType
}

export function StoreProfileCard(): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const canManage = useAuth((s) => s.hasPermission('settings.manage'))
  const { data: profile } = useStoreProfile()
  const setProfile = useSetStoreProfile()
  const [draft, setDraft] = useState<Partial<Draft> | null>(null)

  // Server value is the source of truth; local draft overrides only edited fields.
  const value: Draft = {
    legalName: draft?.legalName ?? profile?.legalName ?? '',
    rif: draft?.rif ?? profile?.rif ?? '',
    address: draft?.address ?? profile?.address ?? '',
    city: draft?.city ?? profile?.city ?? '',
    state: draft?.state ?? profile?.state ?? '',
    phone: draft?.phone ?? profile?.phone ?? '',
    fiscalType: draft?.fiscalType ?? profile?.fiscalType ?? 'ordinario'
  }

  function set<K extends keyof Draft>(key: K, v: Draft[K]): void {
    setDraft((d) => ({ ...d, [key]: v }))
  }

  async function save(): Promise<void> {
    if (!session) return
    if (value.rif && !isValidRif(value.rif)) {
      toast.error('RIF inválido (ej: J-12345678-9)')
      return
    }
    try {
      await setProfile.mutateAsync({ sessionId: session.id, ...value })
      setDraft(null)
      toast.success('Datos de la tienda guardados')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(
        msg === 'INVALID_RIF' ? 'RIF inválido' : msg === 'FORBIDDEN' ? 'Sin permiso' : msg
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Datos fiscales de la tienda
        </CardTitle>
        <CardDescription>
          Razón social, RIF y dirección. Aparecen en tickets y facturas (Venezuela / SENIAT).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="legalName">Razón social</Label>
          <Input
            id="legalName"
            value={value.legalName}
            onChange={(e) => set('legalName', e.target.value)}
            disabled={!canManage}
            placeholder="Inversiones Ejemplo, C.A."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rif">RIF</Label>
            <Input
              id="rif"
              value={value.rif}
              onChange={(e) => set('rif', e.target.value)}
              disabled={!canManage}
              placeholder="J-12345678-9"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo de contribuyente</Label>
            <Select
              value={value.fiscalType}
              onValueChange={(v) => set('fiscalType', v as ContribuyenteType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRIBUYENTE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Dirección fiscal</Label>
          <Input
            id="address"
            value={value.address}
            onChange={(e) => set('address', e.target.value)}
            disabled={!canManage}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="city">Ciudad</Label>
            <Input
              id="city"
              value={value.city}
              onChange={(e) => set('city', e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">Estado</Label>
            <Input
              id="state"
              value={value.state}
              onChange={(e) => set('state', e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              value={value.phone}
              onChange={(e) => set('phone', e.target.value)}
              disabled={!canManage}
            />
          </div>
        </div>
        <Button onClick={() => void save()} disabled={!canManage || setProfile.isPending || !draft}>
          {setProfile.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Guardar datos
        </Button>
      </CardContent>
    </Card>
  )
}
