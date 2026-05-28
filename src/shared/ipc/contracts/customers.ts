import { z } from 'zod'

const docType = z.enum(['V', 'E', 'J', 'P', 'G'])

const customer = z.object({
  id: z.string(),
  name: z.string(),
  docType: docType.nullable(),
  docId: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  creditLimit: z.number(),
  currentBalance: z.number(),
  active: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number()
})

const customerInput = z.object({
  name: z.string().min(1).max(200),
  docType: docType.nullable().optional(),
  docId: z.string().max(20).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  creditLimit: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true)
})

const arMovement = z.object({
  id: z.string(),
  customerId: z.string(),
  saleId: z.string().nullable(),
  type: z.enum(['charge', 'payment', 'adjustment']),
  amount: z.number(),
  notes: z.string().nullable(),
  ts: z.number()
})

export const customersContract = {
  list: {
    kind: 'request',
    channel: 'customers.list',
    input: z
      .object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(false),
        withDebtOnly: z.boolean().default(false)
      })
      .optional(),
    output: z.array(customer),
    errors: [] as const
  },
  get: {
    kind: 'request',
    channel: 'customers.get',
    input: z.object({ id: z.string() }),
    output: customer,
    errors: ['NOT_FOUND'] as const
  },
  findByDoc: {
    kind: 'request',
    channel: 'customers.findByDoc',
    input: z.object({ docType, docId: z.string().min(1) }),
    output: customer.nullable(),
    errors: [] as const
  },
  create: {
    kind: 'request',
    channel: 'customers.create',
    input: customerInput.extend({ sessionId: z.string() }),
    output: customer,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'INVALID_DOC'] as const
  },
  update: {
    kind: 'request',
    channel: 'customers.update',
    input: customerInput.partial().extend({ sessionId: z.string(), id: z.string() }),
    output: customer,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_DOC'] as const
  },
  ledger: {
    kind: 'request',
    channel: 'customers.ledger',
    input: z.object({
      customerId: z.string(),
      limit: z.number().int().min(1).max(500).default(100)
    }),
    output: z.array(arMovement),
    errors: [] as const
  },
  registerPayment: {
    kind: 'request',
    channel: 'customers.registerPayment',
    input: z.object({
      sessionId: z.string(),
      customerId: z.string(),
      amount: z.number().int().positive(),
      notes: z.string().nullable().optional()
    }),
    output: customer,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND'] as const
  }
} as const

export type CustomerDTO = z.infer<typeof customer>
export type ArMovementDTO = z.infer<typeof arMovement>
