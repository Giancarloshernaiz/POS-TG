import { z } from 'zod'

const storeProfile = z.object({
  legalName: z.string(),
  rif: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  phone: z.string(),
  fiscalType: z.enum(['ordinario', 'especial', 'formal'])
})

const storeProfileInput = z.object({
  legalName: z.string().max(200).default(''),
  rif: z.string().max(20).default(''),
  address: z.string().max(300).default(''),
  city: z.string().max(100).default(''),
  state: z.string().max(100).default(''),
  phone: z.string().max(50).default(''),
  fiscalType: z.enum(['ordinario', 'especial', 'formal']).default('ordinario')
})

export const settingsContract = {
  getLowStockGlobal: {
    kind: 'request',
    channel: 'settings.getLowStockGlobal',
    input: z.object({}).optional(),
    output: z.object({ threshold: z.number() }),
    errors: [] as const
  },
  setLowStockGlobal: {
    kind: 'request',
    channel: 'settings.setLowStockGlobal',
    input: z.object({ sessionId: z.string(), threshold: z.number().int().nonnegative() }),
    output: z.object({ threshold: z.number() }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  getIgtf: {
    kind: 'request',
    channel: 'settings.getIgtf',
    input: z.object({}).optional(),
    output: z.object({ enabled: z.boolean(), rateBp: z.number() }),
    errors: [] as const
  },
  setIgtf: {
    kind: 'request',
    channel: 'settings.setIgtf',
    input: z.object({
      sessionId: z.string(),
      enabled: z.boolean(),
      rateBp: z.number().int().nonnegative().max(10000)
    }),
    output: z.object({ enabled: z.boolean(), rateBp: z.number() }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  getStoreProfile: {
    kind: 'request',
    channel: 'settings.getStoreProfile',
    input: z.object({}).optional(),
    output: storeProfile.nullable(),
    errors: [] as const
  },
  setStoreProfile: {
    kind: 'request',
    channel: 'settings.setStoreProfile',
    input: storeProfileInput.extend({ sessionId: z.string() }),
    output: storeProfile,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'INVALID_RIF'] as const
  }
} as const

export type StoreProfileDTO = z.infer<typeof storeProfile>
