import { describe, it, expect } from 'vitest'
import { contracts } from '@shared/ipc/contracts'

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
})
