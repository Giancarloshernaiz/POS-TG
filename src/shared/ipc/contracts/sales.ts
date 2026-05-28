import { z } from 'zod'

const method = z.enum(['cash_ves', 'cash_usd', 'card', 'pago_movil', 'transfer', 'zelle', 'credit'])

const saleLineInput = z.object({
  productId: z.string(),
  serialId: z.string().nullable().optional(),
  qty: z.number().int().positive()
})

const paymentInput = z.object({
  method,
  amountUsd: z.number().int().nonnegative(),
  amountOriginal: z.number().nonnegative().nullable().optional(),
  reference: z.string().nullable().optional()
})

const saleLine = z.object({
  id: z.string(),
  productId: z.string(),
  serialId: z.string().nullable(),
  sku: z.string(),
  description: z.string(),
  qty: z.number(),
  unitPrice: z.number(),
  discountAmount: z.number(),
  taxRateBp: z.number(),
  lineSubtotal: z.number(),
  lineTax: z.number(),
  lineTotal: z.number()
})

const payment = z.object({
  id: z.string(),
  method,
  currency: z.enum(['USD', 'VES']),
  isDivisa: z.boolean(),
  amountUsd: z.number(),
  amountOriginal: z.number().nullable(),
  igtf: z.number(),
  reference: z.string().nullable()
})

const sale = z.object({
  id: z.string(),
  number: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  userId: z.string(),
  cashSessionId: z.string(),
  status: z.enum(['completed', 'voided']),
  subtotal: z.number(),
  discountTotal: z.number(),
  taxTotal: z.number(),
  igtfTotal: z.number(),
  total: z.number(),
  rateUsed: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  lines: z.array(saleLine),
  payments: z.array(payment)
})

export const salesContract = {
  create: {
    kind: 'request',
    channel: 'sales.create',
    input: z.object({
      sessionId: z.string(),
      customerId: z.string().nullable().optional(),
      lines: z.array(saleLineInput).min(1),
      payments: z.array(paymentInput).min(1),
      notes: z.string().nullable().optional()
    }),
    output: z.object({ sale, changeUsd: z.number() }),
    errors: [
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'NO_CASH_SESSION',
      'PRODUCT_NOT_FOUND',
      'INSUFFICIENT_STOCK',
      'SERIAL_REQUIRED',
      'SERIAL_NOT_AVAILABLE',
      'PAYMENT_SHORT',
      'CREDIT_NO_CUSTOMER',
      'CREDIT_LIMIT_EXCEEDED'
    ] as const
  },
  get: {
    kind: 'request',
    channel: 'sales.get',
    input: z.object({ id: z.string() }),
    output: sale,
    errors: ['NOT_FOUND'] as const
  },
  list: {
    kind: 'request',
    channel: 'sales.list',
    input: z
      .object({
        cashSessionId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().nonnegative().default(0)
      })
      .optional(),
    output: z.object({ items: z.array(sale), total: z.number() }),
    errors: [] as const
  },
  void: {
    kind: 'request',
    channel: 'sales.void',
    input: z.object({ sessionId: z.string(), id: z.string(), reason: z.string().min(1) }),
    output: sale,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'ALREADY_VOIDED'] as const
  }
} as const

export type SaleDTO = z.infer<typeof sale>
export type SaleLineDTO = z.infer<typeof saleLine>
export type SalePaymentDTO = z.infer<typeof payment>
