import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
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
import { useAuth } from '@renderer/stores/auth'
import { useIgtf, useSetIgtf } from './hooks'

export function IgtfCard(): React.JSX.Element {
  const canManage = useAuth((s) => s.hasPermission('settings.manage'))
  const { data: cfg } = useIgtf()
  const setIgtf = useSetIgtf()
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null)
  const [draftRate, setDraftRate] = useState<string | null>(null)

  const enabled = draftEnabled ?? cfg?.enabled ?? false
  const ratePct = draftRate ?? String((cfg?.rateBp ?? 300) / 100)
  const dirty = draftEnabled !== null || draftRate !== null

  async function save(): Promise<void> {
    const pct = parseFloat(ratePct)
    if (!Number.isFinite(pct) || pct < 0) {
      toast.error('Tasa inválida')
      return
    }
    try {
      await setIgtf.mutateAsync({ enabled, rateBp: Math.round(pct * 100) })
      setDraftEnabled(null)
      setDraftRate(null)
      toast.success('IGTF actualizado')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'FORBIDDEN' ? 'Sin permiso' : msg)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IGTF — impuesto a divisas</CardTitle>
        <CardDescription>
          Impuesto a las Grandes Transacciones Financieras. Solo se cobra en pagos en dólares
          (efectivo $ y Zelle).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setDraftEnabled(e.target.checked)}
            disabled={!canManage}
            className="h-4 w-4 rounded border-input"
          />
          Cobrar IGTF en pagos en dólares
        </label>

        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="igtfRate">Tasa (%)</Label>
            <Input
              id="igtfRate"
              type="number"
              step="0.01"
              min={0}
              className="w-28"
              value={ratePct}
              onChange={(e) => setDraftRate(e.target.value)}
              disabled={!canManage || !enabled}
            />
          </div>
          <Button onClick={() => void save()} disabled={!canManage || setIgtf.isPending || !dirty}>
            {setIgtf.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {enabled
            ? `Se aplica ${parseFloat(ratePct) || 0}% sobre pagos en efectivo $ y Zelle. El total se calcula en el Punto de venta.`
            : 'IGTF desactivado: no se cobra en ninguna venta.'}
        </p>
      </CardContent>
    </Card>
  )
}
