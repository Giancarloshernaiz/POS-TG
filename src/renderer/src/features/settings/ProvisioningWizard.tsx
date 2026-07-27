import { useState } from 'react'
import { Loader2, Plug, Store, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
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
import type { DeviceIdentityDTO, StoreOptionDTO } from '@shared/ipc/contracts/device'
import { useListStores, useProvisionDevice } from './hooks'

type Props = {
  open: boolean
  onClose: () => void
  identity: DeviceIdentityDTO
}

// Wizard de vinculación: conecta con AgroOne, elige la tienda de esta caja,
// nombra la caja y guarda la identidad (plan §31.3).
export function ProvisioningWizard({ open, onClose, identity }: Props): React.JSX.Element {
  const listStores = useListStores()
  const provision = useProvisionDevice()

  const [baseUrl, setBaseUrl] = useState(identity.agroBaseUrl ?? 'http://localhost:3001')
  const [stores, setStores] = useState<StoreOptionDTO[] | null>(null)
  const [storeId, setStoreId] = useState<string>(
    identity.storeId !== null ? String(identity.storeId) : ''
  )
  const [nodeLabel, setNodeLabel] = useState(
    identity.nodeLabel && identity.nodeLabel !== 'Caja sin nombre' ? identity.nodeLabel : ''
  )

  async function connect(): Promise<void> {
    try {
      const found = await listStores.mutateAsync({ agroBaseUrl: baseUrl })
      setStores(found)
      if (found.length === 0) toast.warning('AgroOne no devolvió tiendas')
      else if (found.length === 1) setStoreId(String(found[0]!.id))
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      toast.error(
        code === 'AGRO_UNREACHABLE'
          ? 'No se pudo conectar con AgroOne. Revisa la dirección y que esté encendido.'
          : `Error: ${code}`
      )
    }
  }

  async function save(): Promise<void> {
    const store = stores?.find((s) => String(s.id) === storeId)
    if (!store) {
      toast.error('Elige una tienda')
      return
    }
    if (!nodeLabel.trim()) {
      toast.error('Ponle un nombre a la caja')
      return
    }
    try {
      await provision.mutateAsync({
        agroBaseUrl: baseUrl,
        storeId: store.id,
        storeName: store.nombre,
        sedeId: store.sedeId,
        nodeLabel: nodeLabel.trim()
      })
      toast.success(`Caja vinculada a ${store.nombre}`)
      onClose()
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      toast.error(code === 'FORBIDDEN' ? 'Sin permiso' : `No se pudo vincular: ${code}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular caja con AgroOne</DialogTitle>
          <DialogDescription>
            Conecta esta caja al máster de inventario y elige a qué tienda pertenece.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Paso 1: conexión */}
          <div className="space-y-1.5">
            <Label htmlFor="agroUrl">Dirección de AgroOne</Label>
            <div className="flex gap-2">
              <Input
                id="agroUrl"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value)
                  setStores(null)
                }}
                placeholder="http://192.168.1.10:3001"
              />
              <Button
                variant="secondary"
                onClick={() => void connect()}
                disabled={listStores.isPending || !baseUrl.trim()}
              >
                {listStores.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                Conectar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              IP/host y puerto del servidor AgroOne en la red de la tienda.
            </p>
          </div>

          {/* Paso 2: tienda */}
          {stores && stores.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                <Store className="mr-1 inline h-3.5 w-3.5" /> Tienda de esta caja
              </Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige la tienda…" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                      {s.ubicacion ? ` — ${s.ubicacion}` : ''} (#{s.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Paso 3: nombre de caja */}
          {stores && stores.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cajaLabel">Nombre de esta caja</Label>
              <Input
                id="cajaLabel"
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                placeholder="Ej: Caja 1"
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">
                Se usa como prefijo de numeración fiscal y para identificar la caja en la red.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void save()}
            disabled={!stores || !storeId || !nodeLabel.trim() || provision.isPending}
          >
            {provision.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Guardar vinculación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
