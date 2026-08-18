import { z } from 'zod'

const methodTotals = z.record(
  z.string(),
  z.object({ amountUsd: z.number(), igtf: z.number(), count: z.number() })
)

const cashReport = z.object({
  sessionId: z.string(),
  status: z.string(),
  userId: z.string(),
  userName: z.string(),
  openedAt: z.number(),
  closedAt: z.number().nullable(),
  openingAmount: z.number(),
  salesCount: z.number(),
  salesGross: z.number(),
  refundCount: z.number(),
  refundTotal: z.number(),
  netSales: z.number(),
  taxTotal: z.number(),
  igtfTotal: z.number(),
  byMethod: methodTotals,
  movementsIn: z.number(),
  movementsOut: z.number(),
  expectedCashUsd: z.number(),
  closingAmount: z.number().nullable(),
  overShort: z.number().nullable()
})

const sessionRow = z.object({
  id: z.string(),
  userId: z.string(),
  openedAt: z.number(),
  closedAt: z.number().nullable(),
  openingAmount: z.number(),
  closingAmount: z.number().nullable(),
  expectedAmount: z.number().nullable(),
  overShortAmount: z.number().nullable(),
  status: z.string(),
  notes: z.string().nullable()
})

export const cashContract = {
  getActiveSession: {
    kind: 'request',
    channel: 'cash.getActiveSession',
    input: z.object({ sessionId: z.string() }),
    output: sessionRow.nullable(),
    errors: ['NOT_AUTHENTICATED'] as const
  },
  open: {
    kind: 'request',
    channel: 'cash.open',
    input: z.object({
      sessionId: z.string(),
      openingAmount: z.number().int().nonnegative(),
      notes: z.string().nullable().optional()
    }),
    output: sessionRow,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'SESSION_ALREADY_OPEN'] as const
  },
  addMovement: {
    kind: 'request',
    channel: 'cash.addMovement',
    input: z.object({
      sessionId: z.string(),
      cashSessionId: z.string(),
      type: z.enum(['withdrawal', 'deposit', 'adjustment', 'drop']),
      amount: z.number().int(),
      reference: z.string().nullable().optional(),
      notes: z.string().nullable().optional()
    }),
    output: z.object({ ok: z.literal(true) }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'SESSION_CLOSED'] as const
  },
  report: {
    kind: 'request',
    channel: 'cash.report',
    input: z.object({ sessionId: z.string(), cashSessionId: z.string() }),
    output: cashReport,
    errors: ['NOT_AUTHENTICATED', 'NOT_FOUND'] as const
  },
  history: {
    kind: 'request',
    channel: 'cash.history',
    input: z.object({
      search: z.string().optional(),
      from: z.number().int().optional(),
      to: z.number().int().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().nonnegative().default(0),
      sessionId: z.string()
    }),
    output: z.object({ items: z.array(cashReport), total: z.number() }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  close: {
    kind: 'request',
    channel: 'cash.close',
    input: z.object({
      sessionId: z.string(),
      cashSessionId: z.string(),
      declaredClosing: z.number().int().nonnegative(),
      authorization: z
        .object({
          username: z.string().trim().min(1),
          password: z.string().min(1)
        })
        .nullable()
        .optional()
    }),
    output: cashReport,
    errors: [
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'APPROVAL_REQUIRED',
      'INVALID_APPROVER',
      'APPROVER_INACTIVE',
      'RATE_LIMITED',
      'NOT_FOUND',
      'SESSION_CLOSED'
    ] as const
  }
} as const

export type CashReportDTO = z.infer<typeof cashReport>
export type CashSessionRowDTO = z.infer<typeof sessionRow>
