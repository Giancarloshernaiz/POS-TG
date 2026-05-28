const LOCALE = 'es-VE'

const usdFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const vesFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'VES',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function fromCents(cents: number | null | undefined): number {
  return (cents ?? 0) / 100
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Format USD from canonical cents. */
export function formatMoney(cents: number | null | undefined): string {
  return usdFormatter.format(fromCents(cents))
}

/** Convert USD cents → VES using rate (VES per USD); returns formatted string or null if no rate. */
export function formatVes(cents: number | null | undefined, rate: number | null): string | null {
  if (rate == null || rate <= 0) return null
  return vesFormatter.format(fromCents(cents) * rate)
}

export function formatTaxBp(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`
}

export function formatRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${vesFormatter.format(rate)} / USD`
}
