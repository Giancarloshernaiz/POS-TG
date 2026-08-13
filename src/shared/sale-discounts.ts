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

/** Prorratea sobre una selección el importe neto que realmente se cobró. */
export function paidShareForReturnCents(
  selectedNetCents: number,
  saleProductsNetCents: number,
  salePaidCents: number
): number {
  if (selectedNetCents <= 0) return 0
  if (saleProductsNetCents <= 0) return selectedNetCents
  const ratio = Math.max(0, Math.min(1, salePaidCents / saleProductsNetCents))
  return Math.round(selectedNetCents * ratio)
}

export const FIDELITY_REWARD_CENTS = 3_000
export const FIDELITY_THRESHOLD_CENTS = 42_000

export type CustomerBenefits = {
  fidelityAppliedCents: number
  creditAppliedCents: number
  totalCents: number
}

/** Misma precedencia de Tiendas Gala: fidelidad automática y luego crédito opcional. */
export function customerBenefitsCents(
  saleTotalCents: number,
  fidelityBalanceCents: number,
  returnCreditBalanceCents: number,
  useStoreCredit: boolean
): CustomerBenefits {
  const fidelityAppliedCents =
    fidelityBalanceCents >= FIDELITY_REWARD_CENTS && saleTotalCents >= FIDELITY_REWARD_CENTS
      ? FIDELITY_REWARD_CENTS
      : 0
  const afterFidelity = Math.max(0, saleTotalCents - fidelityAppliedCents)
  const creditAppliedCents = useStoreCredit
    ? Math.min(Math.max(0, returnCreditBalanceCents), afterFidelity)
    : 0
  return {
    fidelityAppliedCents,
    creditAppliedCents,
    totalCents: Math.max(0, afterFidelity - creditAppliedCents)
  }
}
