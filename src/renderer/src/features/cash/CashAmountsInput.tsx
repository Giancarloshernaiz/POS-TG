import { Input } from '@renderer/components/ui/input'

type Props = {
  usdCents: number
  vesAmount: number
  onUsdCents: (value: number) => void
  onVesAmount: (value: number) => void
  autoFocus?: boolean
  disabled?: boolean
  idPrefix: string
}

function numberValue(text: string): number {
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export function CashAmountsInput({
  usdCents,
  vesAmount,
  onUsdCents,
  onVesAmount,
  autoFocus,
  disabled,
  idPrefix
}: Props): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          Ref.
        </span>
        <Input
          id={`${idPrefix}-usd`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          className="pl-10"
          value={usdCents > 0 ? usdCents / 100 : ''}
          onChange={(event) => onUsdCents(Math.round(numberValue(event.target.value) * 100))}
          placeholder="0,00"
          autoFocus={autoFocus}
          disabled={disabled}
        />
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          Bs
        </span>
        <Input
          id={`${idPrefix}-ves`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          className="pl-7"
          value={vesAmount > 0 ? vesAmount : ''}
          onChange={(event) => onVesAmount(numberValue(event.target.value))}
          placeholder="0,00"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
