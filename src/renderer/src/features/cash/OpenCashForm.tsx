import { useState } from 'react'
import { Loader2, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { useOpenCash } from './hooks'
import { MoneyInput } from '@renderer/components/MoneyInput'

type Props = {
  /** Optional copy tweak when shown from the POS screen. */
  context?: 'cash' | 'pos'
}

export function OpenCashForm({ context = 'cash' }: Props): React.JSX.Element {
  const openMut = useOpenCash()
  const [amountCents, setAmountCents] = useState(0)
  const [notes, setNotes] = useState('')

  async function submit(): Promise<void> {
    if (amountCents < 0) {
      toast.error('Monto inválido')
      return
    }
    try {
      await openMut.mutateAsync({ openingAmount: amountCents, notes: notes || null })
      toast.success('Caja abierta — ya puedes vender')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(
        msg === 'SESSION_ALREADY_OPEN'
          ? 'Ya tienes una caja abierta'
          : msg === 'FORBIDDEN'
            ? 'Sin permiso para abrir caja'
            : msg
      )
    }
  }

  return (
    <div className="flex justify-center py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5" />
            Abrir caja
          </CardTitle>
          <CardDescription>
            {context === 'pos'
              ? 'Para empezar a vender, primero abre la caja con el efectivo inicial.'
              : 'Declara el efectivo inicial ($ USD) con el que arranca el turno.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="opening">Monto inicial en caja</Label>
            <MoneyInput
              id="opening"
              valueCents={amountCents}
              onChangeCents={setAmountCents}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Efectivo con el que abre la caja (fondo de cambio). Puedes ingresarlo en $ o en Bs.
              Puede ser 0.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            size="lg"
            onClick={() => void submit()}
            disabled={openMut.isPending}
          >
            {openMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Abrir caja y comenzar
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
