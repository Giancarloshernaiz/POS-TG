// Hybrid Logical Clock (§8.2): orden total monotónico entre eventos de
// distintas cajas, tolerante a clock skew. Formato de texto '<ms>-<counter>-<nodeId>'
// (comparable lexicográficamente una vez el padding es fijo).

export type Hlc = { ms: number; counter: number; nodeId: string }

const MS_PAD = 15 // suficiente hasta el año ~5138 en epoch ms
const COUNTER_PAD = 5 // 100k eventos en el mismo ms antes de overflow

export function formatHlc(h: Hlc): string {
  return `${String(h.ms).padStart(MS_PAD, '0')}-${String(h.counter).padStart(COUNTER_PAD, '0')}-${h.nodeId}`
}

export function parseHlc(s: string): Hlc {
  const parts = s.split('-')
  if (parts.length < 3) throw new Error(`HLC inválido: ${s}`)
  const ms = Number(parts[0])
  const counter = Number(parts[1])
  const nodeId = parts.slice(2).join('-')
  if (!Number.isFinite(ms) || !Number.isFinite(counter)) throw new Error(`HLC inválido: ${s}`)
  return { ms, counter, nodeId }
}

/** -1 si a<b, 0 si iguales, 1 si a>b. El nodeId desempata en caso de (ms,counter) iguales. */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.ms !== b.ms) return a.ms < b.ms ? -1 : 1
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1
  if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1
  return 0
}

/**
 * Reloj HLC con estado mutable para un nodo. `tick()` para eventos locales,
 * `receive()` al aplicar un evento remoto (mezcla y avanza el reloj local).
 * Algoritmo estándar (Kulkarni et al.) — physical time nunca retrocede.
 */
export class HlcClock {
  private last: Hlc

  constructor(
    private readonly nodeId: string,
    now: () => number = Date.now,
    initial?: Hlc
  ) {
    this.physicalNow = now
    // Sentinel ms:0 (no evento previo) para que el primer tick() real tome la
    // rama ms>last.ms y arranque en counter=0, en vez de empatar con el propio
    // now() de construcción y consumir de más.
    this.last = initial ?? { ms: 0, counter: 0, nodeId }
  }

  private physicalNow: () => number

  current(): Hlc {
    return this.last
  }

  /** Evento local: avanza el reloj y devuelve el nuevo HLC. */
  tick(): Hlc {
    const pt = this.physicalNow()
    const ms = Math.max(pt, this.last.ms)
    const counter = ms === this.last.ms ? this.last.counter + 1 : 0
    this.last = { ms, counter, nodeId: this.nodeId }
    return this.last
  }

  /** Al recibir/aplicar un evento remoto: mezcla y avanza el reloj local. */
  receive(remote: Hlc): Hlc {
    const pt = this.physicalNow()
    const ms = Math.max(pt, this.last.ms, remote.ms)
    let counter: number
    if (ms === this.last.ms && ms === remote.ms) {
      counter = Math.max(this.last.counter, remote.counter) + 1
    } else if (ms === this.last.ms) {
      counter = this.last.counter + 1
    } else if (ms === remote.ms) {
      counter = remote.counter + 1
    } else {
      counter = 0
    }
    this.last = { ms, counter, nodeId: this.nodeId }
    return this.last
  }
}
