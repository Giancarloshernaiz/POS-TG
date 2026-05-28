import { describe, it, expect } from 'vitest'
import { ok, err, type Result } from '@shared/ipc/envelope'

describe('envelope', () => {
  it('ok wraps data', () => {
    const r = ok(42)
    expect(r).toEqual({ ok: true, data: 42 })
  })

  it('err wraps code+message', () => {
    const r = err('BAD_INPUT', 'oops')
    expect(r).toEqual({ ok: false, error: { code: 'BAD_INPUT', message: 'oops' } })
  })

  it('err includes cause when provided', () => {
    const cause = { detail: 'x' }
    const r = err('INTERNAL', 'boom', cause)
    expect(r).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'boom', cause } })
  })

  it('Result narrowing works', () => {
    const r: Result<number, 'X'> = ok(1)
    if (r.ok) {
      const n: number = r.data
      expect(n).toBe(1)
    } else {
      throw new Error('expected ok')
    }
  })
})
