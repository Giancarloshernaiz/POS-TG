const LOCALE = 'es-VE'

const usdFmt = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const vesFmt = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'VES',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatMoney(cents: number | null | undefined): string {
  return usdFmt.format((cents ?? 0) / 100)
}

export function formatVes(cents: number | null | undefined, rate: number | null): string | null {
  if (rate == null || rate <= 0) return null
  return vesFmt.format(((cents ?? 0) / 100) * rate)
}
