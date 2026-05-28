import { z } from 'zod'

export const healthContract = {
  ping: {
    kind: 'request',
    channel: 'health.ping',
    input: z.object({}).optional(),
    output: z.object({
      pong: z.literal(true),
      ts: z.number(),
      appVersion: z.string(),
      schemaVersion: z.number()
    }),
    errors: [] as const
  },
  status: {
    kind: 'subscription',
    channel: 'health.status',
    output: z.object({
      ok: z.boolean(),
      ts: z.number()
    })
  }
} as const
