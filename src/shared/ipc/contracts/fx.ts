import { z } from 'zod'

const fxRate = z.object({
  rate: z.number(),
  source: z.enum(['api', 'bcv', 'manual']),
  fetchedAt: z.number(),
  publishedAt: z.number().nullable()
})

export const fxContract = {
  getRate: {
    kind: 'request',
    channel: 'fx.getRate',
    input: z.object({}).optional(),
    output: fxRate.nullable(),
    errors: [] as const
  },
  refresh: {
    kind: 'request',
    channel: 'fx.refresh',
    input: z.object({ sessionId: z.string() }),
    output: fxRate,
    errors: ['NOT_AUTHENTICATED', 'FX_FETCH_FAILED'] as const
  },
  setManual: {
    kind: 'request',
    channel: 'fx.setManual',
    input: z.object({ sessionId: z.string(), rate: z.number().positive() }),
    output: fxRate,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  updated: {
    kind: 'subscription',
    channel: 'fx.updated',
    output: fxRate
  }
} as const

export type FxRateDTO = z.infer<typeof fxRate>
