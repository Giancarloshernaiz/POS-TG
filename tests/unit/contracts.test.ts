import { describe, it, expect } from 'vitest'
import { contracts } from '@shared/ipc/contracts'
import { DEFAULT_ROLES, PERMISSIONS } from '@shared/auth/permissions'

describe('contracts registry', () => {
  it('every contract has kind + channel', () => {
    for (const [group, ops] of Object.entries(contracts)) {
      for (const [opName, def] of Object.entries(ops)) {
        expect(def.kind, `${group}.${opName} kind`).toMatch(/^(request|subscription)$/)
        expect(def.channel, `${group}.${opName} channel`).toMatch(/^[a-z][a-zA-Z0-9._]+$/)
      }
    }
  })

  it('channels are unique', () => {
    const seen = new Set<string>()
    for (const ops of Object.values(contracts)) {
      for (const def of Object.values(ops)) {
        expect(seen.has(def.channel), `duplicate channel ${def.channel}`).toBe(false)
        seen.add(def.channel)
      }
    }
  })

  it('health.ping output parses real payload', () => {
    const out = contracts.health.ping.output.safeParse({
      pong: true,
      ts: Date.now(),
      appVersion: '1.0.0',
      schemaVersion: 0
    })
    expect(out.success).toBe(true)
  })

  it('health.ping output rejects bad payload', () => {
    const out = contracts.health.ping.output.safeParse({
      pong: false,
      ts: 'not-a-number',
      appVersion: 1,
      schemaVersion: 'x'
    })
    expect(out.success).toBe(false)
  })

  it('sales.saveDraft preserves the complete POS workspace', () => {
    const out = contracts.sales.saveDraft.input.safeParse({
      sessionId: 'session-1',
      label: 'Cliente en caja 1',
      state: {
        customerId: 'customer-1',
        customerLabel: 'Cliente en caja 1',
        walkIn: false,
        sellerId: 'seller-1',
        currencyMode: 'MIXED',
        useStoreCredit: true,
        lines: [
          {
            key: 'product-1',
            productId: 'product-1',
            sku: 'SKU-1',
            name: 'Producto',
            qty: 2,
            unitPrice: 1500,
            effectivePrice: 1200,
            taxRateBp: 0,
            tracksSerial: false
          }
        ],
        payments: [{ id: 'pay-1', method: 'card', amountCents: 1000 }]
      }
    })

    expect(out.success).toBe(true)
  })

  it('sales.saveDraft rejects an empty cart', () => {
    const out = contracts.sales.saveDraft.input.safeParse({
      sessionId: 'session-1',
      label: 'Vacía',
      state: {
        customerId: null,
        customerLabel: 'Consumidor final',
        walkIn: true,
        sellerId: null,
        currencyMode: 'USD',
        useStoreCredit: false,
        lines: [],
        payments: []
      }
    })

    expect(out.success).toBe(false)
  })

  it('cash.close accepts a complete supervisor authorization', () => {
    const out = contracts.cash.close.input.safeParse({
      sessionId: 'session-1',
      cashSessionId: 'cash-1',
      declaredClosing: 1000,
      authorization: { username: 'manager', password: 'secret' }
    })
    expect(out.success).toBe(true)
  })

  it('cashier cannot close cash without supervisor authorization', () => {
    expect(DEFAULT_ROLES.cashier.permissions).not.toContain(PERMISSIONS.CASH_CLOSE)
    expect(DEFAULT_ROLES.manager.permissions).toContain(PERMISSIONS.CASH_CLOSE)
    expect(DEFAULT_ROLES.admin.permissions).toContain(PERMISSIONS.CASH_CLOSE)
  })
})
