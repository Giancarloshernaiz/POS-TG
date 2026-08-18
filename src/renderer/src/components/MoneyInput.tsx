import { useState } from 'react'
import { Input } from '@renderer/components/ui/input'
import { useFx } from '@renderer/stores/fx'
import { fromCents, toCents } from '@renderer/lib/money'

type Props = {
  /** Canonical value in USD cents. */
  valueCents: number
  onChangeCents: (cents: number) => void
  disabled?: boolean
  id?: string
  autoFocus?: boolean
  className?: string
  referenceLabel?: string
}

function num(t: string): number {
  const n = parseFloat(t.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function usdStr(cents: number): string {
  return cents ? String(fromCents(cents)) : ''
}

function bsStr(cents: number, rate: number | null): string {
  return rate && cents ? (fromCents(cents) * rate).toFixed(2) : ''
}

/**
 * Dual-currency money input: USD and Bs side by side, linked by the BCV rate.
 *
 * Anti-rollback: the field being typed is never reformatted mid-edit. We keep
 * local text per field and only recompute the OTHER field. External value/rate
 * changes (e.g. a form reset) are reconciled during render using the documented
 * "adjust state when a prop changes" pattern with previous-value STATE (no refs,
 * no effect) — so the cursor never jumps.
 */
export function MoneyInput({
  valueCents,
  onChangeCents,
  disabled,
  id,
  autoFocus,
  className,
  referenceLabel = '$'
}: Props): React.JSX.Element {
  const rate = useFx((s) => s.rate?.rate ?? null)
  const [usd, setUsd] = useState<string>(() => usdStr(valueCents))
  const [bs, setBs] = useState<string>(() => bsStr(valueCents, rate))
  // Previous external value/rate, kept in STATE so we can reconcile during render.
  const [prevCents, setPrevCents] = useState(valueCents)
  const [prevRate, setPrevRate] = useState(rate)

  if (valueCents !== prevCents || rate !== prevRate) {
    // External change (e.g. form reset, rate loaded) — resync both fields.
    // Our own edits call setPrevCents() first, so this branch is skipped for them.
    setPrevCents(valueCents)
    setPrevRate(rate)
    setUsd(usdStr(valueCents))
    setBs(bsStr(valueCents, rate))
  }

  function handleUsd(text: string): void {
    setUsd(text)
    const n = num(text)
    const cents = toCents(n)
    setPrevCents(cents) // mark as our own edit → no reconcile when prop echoes back
    onChangeCents(cents)
    if (rate) setBs(n ? (n * rate).toFixed(2) : '')
  }

  function handleBs(text: string): void {
    setBs(text)
    const n = num(text)
    const usdVal = rate && rate > 0 ? n / rate : 0
    const cents = toCents(usdVal)
    setPrevCents(cents)
    onChangeCents(cents)
    setUsd(usdVal ? usdVal.toFixed(2) : '')
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {referenceLabel}
          </span>
          <Input
            id={id}
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            className={referenceLabel.length > 1 ? 'pl-10' : 'pl-6'}
            value={usd}
            onChange={(e) => handleUsd(e.target.value)}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder="0.00"
          />
        </div>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Bs
          </span>
          <Input
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            className="pl-7"
            value={bs}
            onChange={(e) => handleBs(e.target.value)}
            disabled={disabled || !rate}
            placeholder={rate ? '0,00' : 'sin tasa'}
          />
        </div>
      </div>
      {!rate && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Sin tasa BCV — solo {referenceLabel}. Carga la tasa en Configuración.
        </p>
      )}
    </div>
  )
}
