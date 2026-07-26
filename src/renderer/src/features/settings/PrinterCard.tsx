import { useState } from 'react'
import { Loader2, Save, Printer, FlaskConical } from 'lucide-react'
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
import { usePrinterConfig, useSetPrinterConfig, useTestPrinter } from './hooks'

type Draft = { type: 'epson' | 'star'; interface: string; widthChars: number; enabled: boolean }

export function PrinterCard(): React.JSX.Element {
  const canManage = useAuth((s) => s.hasPermission('settings.manage'))
  const { data: cfg } = usePrinterConfig()
  const setCfg = useSetPrinterConfig()
  const testMut = useTestPrinter()
  const [draft, setDraft] = useState<Partial<Draft> | null>(null)

  const value: Draft = {
    type: draft?.type ?? cfg?.type ?? 'epson',
    interface: draft?.interface ?? cfg?.interface ?? '',
    widthChars: draft?.widthChars ?? cfg?.widthChars ?? 48,
    enabled: draft?.enabled ?? cfg?.enabled ?? false
  }

  function set<K extends keyof Draft>(k: K, v: Draft[K]): void {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  async function save(): Promise<void> {
    try {
      await setCfg.mutateAsync(value)
      setDraft(null)
      toast.success('Impresora guardada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function test(): Promise<void> {
    try {
      await testMut.mutateAsync()
      toast.success('Prueba enviada a la impresora')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        PRINTER_NOT_CONFIGURED: 'Configura y activa la impresora primero',
        PRINTER_OFFLINE: 'La impresora no responde',
        PRINT_FAILED: 'No se pudo imprimir'
      }
      toast.error(human[msg] ?? msg)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Impresora térmica (ESC/POS)
        </CardTitle>
        <CardDescription>
          Impresora de tickets. Conexión por red (tcp://IP:9100) o nombre del sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
            disabled={!canManage}
            className="h-4 w-4 rounded border-input"
          />
          Impresora activa
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Marca</Label>
            <Select value={value.type} onValueChange={(v) => set('type', v as 'epson' | 'star')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="epson">Epson (común)</SelectItem>
                <SelectItem value="star">Star</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="width">Ancho (caracteres)</Label>
            <Input
              id="width"
              type="number"
              value={value.widthChars}
              onChange={(e) => set('widthChars', parseInt(e.target.value || '48', 10))}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="iface">Conexión</Label>
          <Input
            id="iface"
            value={value.interface}
            onChange={(e) => set('interface', e.target.value)}
            disabled={!canManage}
            placeholder="tcp://192.168.1.50:9100"
          />
          <p className="text-xs text-muted-foreground">
            Red: <code>tcp://IP:9100</code> · Sistema (Windows):{' '}
            <code>printer:NombreImpresora</code>
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={!canManage || setCfg.isPending || !draft}>
            {setCfg.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
          <Button variant="outline" onClick={() => void test()} disabled={testMut.isPending}>
            {testMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Imprimir prueba
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
