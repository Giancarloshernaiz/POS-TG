import { z } from 'zod'

// Devolución y reimpresión de factura: la caja solicita, el administrador
// aprueba en AgroOne. La caja consulta el estado para saber si ya se resolvió.

const authorization = z.object({
  id: z.number(),
  type: z.enum(['RETURN_SALE', 'REPRINT_INVOICE']),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  ventaId: z.number().nullable(),
  createdAt: z.number().nullable(),
  approvedAt: z.number().nullable()
})

const approver = z.object({
  id: z.number(),
  nombre: z.string(),
  rol: z.string(),
  email: z.string()
})

const errores = [
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'NOT_PROVISIONED',
  'NO_APPROVERS',
  'SALE_NOT_FOUND',
  'SALE_NOT_SYNCED',
  'AGRO_UNREACHABLE',
  'INVALID_ITEMS',
  'RETURN_ALREADY_REQUESTED',
  'RETURN_ALREADY_COMPLETED'
] as const

export const approvalsContract = {
  /** Usuarios del máster que pueden resolver una solicitud. */
  listApprovers: {
    kind: 'request',
    channel: 'approvals.listApprovers',
    input: z.object({}).optional(),
    output: z.array(approver),
    errors: ['NOT_PROVISIONED', 'AGRO_UNREACHABLE'] as const
  },
  requestReprint: {
    kind: 'request',
    channel: 'approvals.requestReprint',
    input: z.object({
      sessionId: z.string(),
      saleId: z.string(),
      approverIds: z.array(z.number().int().positive()).min(1)
    }),
    output: authorization,
    errors: errores
  },
  requestReturn: {
    kind: 'request',
    channel: 'approvals.requestReturn',
    input: z.object({
      sessionId: z.string(),
      saleId: z.string(),
      approverIds: z.array(z.number().int().positive()).min(1),
      items: z
        .array(z.object({ productId: z.string(), qty: z.number().int().positive() }))
        .min(1)
    }),
    output: authorization,
    errors: errores
  },
  getStatus: {
    kind: 'request',
    channel: 'approvals.getStatus',
    input: z.object({ requestId: z.number().int().positive() }),
    output: authorization,
    errors: errores
  },
} as const

export type AuthorizationDTO = z.infer<typeof authorization>
export type ApproverDTO = z.infer<typeof approver>
