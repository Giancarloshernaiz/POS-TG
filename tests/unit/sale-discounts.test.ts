import { describe, expect, it } from 'vitest'
import {
  amountToCompleteSaleCents,
  paidShareForReturnCents,
  totalAfterUsdDiscountCents,
  usdPaymentDiscountCents
} from '../../src/shared/sale-discounts'

describe('descuentos por pago USD', () => {
  it('descuenta todo el subtotal en una venta USD', () => {
    expect(usdPaymentDiscountCents(10_000, [{ amountCents: 9_000, currency: 'USD' }], 1_000)).toBe(1_000)
    expect(totalAfterUsdDiscountCents(10_000, [{ amountCents: 9_000, currency: 'USD' }], 1_000)).toBe(9_000)
  })

  it('no descuenta ventas pagadas solo en bolivares', () => {
    expect(usdPaymentDiscountCents(10_000, [{ amountCents: 10_000, currency: 'VES' }], 1_000)).toBe(0)
  })

  it('en mixto descuenta solo la fraccion USD', () => {
    const payments = [
      { amountCents: 5_000, currency: 'VES' as const },
      { amountCents: 4_545, currency: 'USD' as const }
    ]
    expect(usdPaymentDiscountCents(10_000, payments, 1_000)).toBe(455)
    expect(totalAfterUsdDiscountCents(10_000, payments, 1_000)).toBe(9_545)
  })

  it('completa exactamente una fila USD de un pago mixto', () => {
    const payments = [
      { amountCents: 5_000, currency: 'VES' as const },
      { amountCents: 0, currency: 'USD' as const }
    ]
    const amount = amountToCompleteSaleCents(10_000, payments, 1, 1_000)
    payments[1]!.amountCents = amount
    expect(amount).toBe(4_545)
    expect(payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(
      totalAfterUsdDiscountCents(10_000, payments, 1_000)
    )
  })

  it('completa dos metodos USD usando el descuento sobre toda la venta', () => {
    const payments = [
      { amountCents: 2_000, currency: 'USD' as const },
      { amountCents: 0, currency: 'USD' as const }
    ]
    expect(amountToCompleteSaleCents(10_000, payments, 1, 1_000)).toBe(7_000)
  })

  it('devuelve el total exacto pagado, no el valor previo al descuento global', () => {
    expect(paidShareForReturnCents(10_000, 10_000, 9_000)).toBe(9_000)
    expect(paidShareForReturnCents(2_500, 10_000, 9_000)).toBe(2_250)
  })
})
