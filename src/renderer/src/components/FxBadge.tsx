import { useState, useEffect } from 'react'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import { useFx } from '@renderer/stores/fx'
import { formatRate } from '@renderer/lib/money'
import { cn } from '@renderer/lib/utils'

const SOURCE_LABEL: Record<string, string> = {
  api: 'BCV',
  bcv: 'BCV',
  manual: 'Manual'
}

/** Always-on USD→VES rate indicator for the app header. */
export function FxBadge(): React.JSX.Element {
  const rate = useFx((s) => s.rate)
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const stale = rate ? now - rate.fetchedAt >= 24 * 3_600_000 : false

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
        stale ? 'border-amber-500/40 bg-amber-500/10' : 'bg-muted/40'
      )}
      title={rate ? `Fuente: ${SOURCE_LABEL[rate.source]}` : 'Sin tasa cargada'}
    >
      {stale ? (
        <AlertTriangle className="h-4 w-4 text-amber-600" />
      ) : (
        <TrendingUp className="h-4 w-4 text-emerald-600" />
      )}
      <div className="leading-tight">
        <div className="font-mono font-medium">{formatRate(rate?.rate ?? null)}</div>
        {rate && (
          <div className="text-[10px] text-muted-foreground">
            {SOURCE_LABEL[rate.source]}
            {stale ? ' · desactualizada' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
