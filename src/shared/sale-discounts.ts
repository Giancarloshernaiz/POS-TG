export type DiscountPayment = {
  amountCents: number
  currency: 'USD' | 'VES'
}

/**
 * Regla de Tiendas Gala: una venta completamente USD descuenta el porcentaje
 * sobre todos los productos; en una venta mixta, solo sobre la fraccion USD.
 */
export function usdPaymentDiscountCents(
  goodsTotalCents: number,
  payments: DiscountPayment[],
  rateBp: number
): number {
  if (goodsTotalCents <= 0 || rateBp <= 0 || payments.length === 0) return 0
  const hasUsd = payments.some((p) => p.currency === 'USD')
  const hasVes = payments.some((p) => p.currency === 'VES')
  if (!hasUsd) return 0
  const base = hasVes
    ? payments.filter((p) => p.currency === 'USD').reduce((sum, p) => sum + p.amountCents, 0)
    : goodsTotalCents
  return Math.min(goodsTotalCents, Math.round((base * rateBp) / 10_000))
}

export function totalAfterUsdDiscountCents(
  goodsTotalCents: number,
  payments: DiscountPayment[],
  rateBp: number
): number {
  return Math.max(0, goodsTotalCents - usdPaymentDiscountCents(goodsTotalCents, payments, rateBp))
}

/** Amount needed in one payment row to exactly cover the dynamically discounted total. */
export function amountToCompleteSaleCents(
  goodsTotalCents: number,
  payments: DiscountPayment[],
  targetIndex: number,
  rateBp: number
): number {
  const others = payments.filter((_, index) => index !== targetIndex)
  const otherPaid = others.reduce((sum, p) => sum + p.amountCents, 0)
  const otherUsd = others
    .filter((p) => p.currency === 'USD')
    .reduce((sum, p) => sum + p.amountCents, 0)
  const target = payments[targetIndex]
  if (!target) return 0

  if (target.currency === 'USD' && others.some((p) => p.currency === 'VES')) {
    const numerator = goodsTotalCents - otherPaid - Math.round((otherUsd * rateBp) / 10_000)
    return Math.max(0, Math.round(numerator / (1 + rateBp / 10_000)))
  }
  if (target.currency === 'USD') {
    const fullyDiscountedTotal = goodsTotalCents - Math.round((goodsTotalCents * rateBp) / 10_000)
    return Math.max(0, fullyDiscountedTotal - otherPaid)
  }
  const discount = Math.round((otherUsd * rateBp) / 10_000)
  return Math.max(0, goodsTotalCents - discount - otherPaid)
}
