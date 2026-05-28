import { useFx } from '@renderer/stores/fx'
import { formatMoney, formatVes } from '@renderer/lib/money'
import { cn } from '@renderer/lib/utils'

type Props = {
  cents: number | null | undefined
  className?: string
  align?: 'left' | 'right'
}

/** Shows USD (canonical) with VES conversion underneath when a rate is available. */
export function DualPrice({ cents, className, align = 'right' }: Props): React.JSX.Element {
  const rate = useFx((s) => s.rate?.rate ?? null)
  const ves = formatVes(cents, rate)
  return (
    <div className={cn('font-mono leading-tight', align === 'right' && 'text-right', className)}>
      <div>{formatMoney(cents)}</div>
      {ves && <div className="text-xs text-muted-foreground">{ves}</div>}
    </div>
  )
}
