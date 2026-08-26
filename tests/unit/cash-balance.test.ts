import { describe, expect, it } from 'vitest'
import { calculateExpectedCash } from '@main/domain/cash/cash.service'

describe('dual-currency cash balance', () => {
  it('adds cash sales to the opening balance in each original currency', () => {
    const result = calculateExpectedCash({
      openingUsd: 1000,
      openingVes: 2000,
      cashSalesUsd: 2500,
      cashSalesVes: 7500,
      movementsInUsd: 0,
      movementsInVes: 0,
      movementsOutUsd: 0,
      movementsOutVes: 0
    })

    expect(result).toEqual({ usd: 3500, ves: 9500 })
  })

  it('applies deposits and withdrawals only to their own currency', () => {
    const result = calculateExpectedCash({
      openingUsd: 1000,
      openingVes: 2000,
      cashSalesUsd: 500,
      cashSalesVes: 1000,
      movementsInUsd: 300,
      movementsInVes: 700,
      movementsOutUsd: 200,
      movementsOutVes: 400
    })

    expect(result).toEqual({ usd: 1600, ves: 3300 })
  })
})
