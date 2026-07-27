import { describe, it, expect } from 'vitest'
import { HlcClock, compareHlc, formatHlc, parseHlc } from '@main/infrastructure/sync/p2p/hlc'

describe('hlc format/parse', () => {
  it('round-trips through format/parse', () => {
    const h = { ms: 1_700_000_000_000, counter: 42, nodeId: '01ABC' }
    expect(parseHlc(formatHlc(h))).toEqual(h)
  })

  it('string comparison matches compareHlc for same ms', () => {
    const a = formatHlc({ ms: 100, counter: 1, nodeId: 'nodeA' })
    const b = formatHlc({ ms: 100, counter: 2, nodeId: 'nodeA' })
    expect(a < b).toBe(true)
  })
})

describe('compareHlc', () => {
  it('orders by ms first', () => {
    const a = { ms: 100, counter: 5, nodeId: 'z' }
    const b = { ms: 200, counter: 0, nodeId: 'a' }
    expect(compareHlc(a, b)).toBe(-1)
    expect(compareHlc(b, a)).toBe(1)
  })

  it('orders by counter when ms equal', () => {
    const a = { ms: 100, counter: 1, nodeId: 'a' }
    const b = { ms: 100, counter: 2, nodeId: 'a' }
    expect(compareHlc(a, b)).toBe(-1)
  })

  it('tie-breaks by nodeId when ms and counter equal', () => {
    const a = { ms: 100, counter: 1, nodeId: 'nodeA' }
    const b = { ms: 100, counter: 1, nodeId: 'nodeB' }
    expect(compareHlc(a, b)).toBe(-1)
    expect(compareHlc(b, a)).toBe(1)
  })

  it('returns 0 for identical HLCs', () => {
    const a = { ms: 100, counter: 1, nodeId: 'a' }
    expect(compareHlc(a, { ...a })).toBe(0)
  })
})

describe('HlcClock.tick', () => {
  it('advances ms with physical time when clock is ahead of last', () => {
    let now = 1000
    const clock = new HlcClock('node1', () => now)
    const h1 = clock.tick()
    expect(h1).toEqual({ ms: 1000, counter: 0, nodeId: 'node1' })

    now = 2000
    const h2 = clock.tick()
    expect(h2).toEqual({ ms: 2000, counter: 0, nodeId: 'node1' })
  })

  it('bumps counter when physical time does not advance (same ms twice)', () => {
    const now = 1000
    const clock = new HlcClock('node1', () => now)
    clock.tick()
    const h2 = clock.tick()
    expect(h2).toEqual({ ms: 1000, counter: 1, nodeId: 'node1' })
  })

  it('never goes backwards even if physical clock regresses', () => {
    let now = 5000
    const clock = new HlcClock('node1', () => now)
    clock.tick() // {5000, 0}
    now = 3000 // reloj físico retrocede (skew)
    const h2 = clock.tick()
    expect(h2.ms).toBe(5000)
    expect(h2.counter).toBe(1)
  })
})

describe('HlcClock.receive', () => {
  it('adopts remote ms when remote is ahead of local and physical time', () => {
    const now = 1000
    const clock = new HlcClock('nodeB', () => now)
    clock.tick() // {1000, 0, nodeB}
    const remote = { ms: 5000, counter: 3, nodeId: 'nodeA' }
    const merged = clock.receive(remote)
    expect(merged).toEqual({ ms: 5000, counter: 4, nodeId: 'nodeB' })
  })

  it('bumps local counter when local ms is ahead of remote', () => {
    let now = 9000
    const clock = new HlcClock('nodeB', () => now)
    clock.tick() // {9000,0}
    now = 9000
    const remote = { ms: 1000, counter: 9, nodeId: 'nodeA' }
    const merged = clock.receive(remote)
    expect(merged).toEqual({ ms: 9000, counter: 1, nodeId: 'nodeB' })
  })

  it('takes max counter+1 when ms ties across local, remote, and physical clock', () => {
    const now = 1000
    const clock = new HlcClock('nodeB', () => now, { ms: 1000, counter: 2, nodeId: 'nodeB' })
    const remote = { ms: 1000, counter: 7, nodeId: 'nodeA' }
    const merged = clock.receive(remote)
    expect(merged).toEqual({ ms: 1000, counter: 8, nodeId: 'nodeB' })
  })

  it('resets counter to 0 when physical time exceeds both local and remote', () => {
    let now = 1000
    const clock = new HlcClock('nodeB', () => now, { ms: 1000, counter: 2, nodeId: 'nodeB' })
    now = 50_000
    const remote = { ms: 2000, counter: 7, nodeId: 'nodeA' }
    const merged = clock.receive(remote)
    expect(merged).toEqual({ ms: 50_000, counter: 0, nodeId: 'nodeB' })
  })
})
