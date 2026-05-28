export type DiscountType = 'none' | 'percent' | 'amount'

export type Discount = {
  type: DiscountType
  /** percent in basis points (1000 = 10%) OR fixed amount in cents */
  value: number
}

export type DiscountSource = 'product' | 'category' | 'none'

export const NO_DISCOUNT: Discount = { type: 'none', value: 0 }

function isActive(d: Discount): boolean {
  return d.type !== 'none' && d.value > 0
}

/**
 * Resolve which discount applies. Product overrides category (most specific wins).
 */
export function resolveDiscount(
  product: Discount,
  category: Discount | null
): { discount: Discount; source: DiscountSource } {
  if (isActive(product)) return { discount: product, source: 'product' }
  if (category && isActive(category)) return { discount: category, source: 'category' }
  return { discount: NO_DISCOUNT, source: 'none' }
}

/** Discount amount in cents for a given base price. */
export function discountAmountCents(basePriceCents: number, d: Discount): number {
  if (!isActive(d)) return 0
  if (d.type === 'percent') {
    return Math.round((basePriceCents * d.value) / 10_000)
  }
  // fixed amount in cents
  return Math.min(d.value, basePriceCents)
}

/** Final price in cents after applying a discount (never below 0). */
export function effectivePriceCents(basePriceCents: number, d: Discount): number {
  return Math.max(0, basePriceCents - discountAmountCents(basePriceCents, d))
}

export function formatDiscountLabel(d: Discount): string {
  if (!isActive(d)) return ''
  if (d.type === 'percent') return `-${(d.value / 100).toFixed(d.value % 100 === 0 ? 0 : 2)}%`
  return `-$${(d.value / 100).toFixed(2)}`
}
