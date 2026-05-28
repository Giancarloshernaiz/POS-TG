import { z } from 'zod'

const fiscalType = z.enum(['ordinario', 'especial', 'formal'])

const supplier = z.object({
  id: z.string(),
  name: z.string(),
  taxId: z.string().nullable(),
  fiscalType: fiscalType.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number()
})

const supplierInput = z.object({
  name: z.string().min(1).max(200),
  taxId: z.string().nullable().optional(),
  fiscalType: fiscalType.nullable().optional(),
  email: z
    .string()
    .email()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().default(true)
})

const poStatus = z.enum(['draft', 'submitted', 'partial', 'received', 'closed', 'cancelled'])

const poLine = z.object({
  id: z.string(),
  poId: z.string(),
  productId: z.string(),
  productSku: z.string(),
  productName: z.string(),
  tracksSerial: z.boolean(),
  qtyOrdered: z.number(),
  qtyReceived: z.number(),
  unitCost: z.number(),
  lineTotal: z.number()
})

const purchaseOrder = z.object({
  id: z.string(),
  number: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  status: poStatus,
  expectedAt: z.number().nullable(),
  notes: z.string().nullable(),
  totalAmount: z.number(),
  createdBy: z.string(),
  createdByName: z.string(),
  submittedAt: z.number().nullable(),
  receivedAt: z.number().nullable(),
  closedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lines: z.array(poLine)
})

const poLineInput = z.object({
  productId: z.string(),
  qtyOrdered: z.number().int().positive(),
  unitCost: z.number().int().nonnegative()
})

const receiveLineInput = z.object({
  poLineId: z.string(),
  qty: z.number().int().positive(),
  serials: z.array(z.string()).optional()
})

export const purchasingContract = {
  listSuppliers: {
    kind: 'request',
    channel: 'purchasing.listSuppliers',
    input: z.object({ activeOnly: z.boolean().default(false) }).optional(),
    output: z.array(supplier),
    errors: [] as const
  },
  createSupplier: {
    kind: 'request',
    channel: 'purchasing.createSupplier',
    input: supplierInput,
    output: supplier,
    errors: ['DUPLICATE_NAME'] as const
  },
  updateSupplier: {
    kind: 'request',
    channel: 'purchasing.updateSupplier',
    input: supplierInput.partial().extend({ id: z.string() }),
    output: supplier,
    errors: ['NOT_FOUND', 'DUPLICATE_NAME'] as const
  },
  listPOs: {
    kind: 'request',
    channel: 'purchasing.listPOs',
    input: z
      .object({
        status: poStatus.optional(),
        supplierId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().nonnegative().default(0)
      })
      .optional(),
    output: z.object({
      items: z.array(purchaseOrder),
      total: z.number()
    }),
    errors: [] as const
  },
  getPO: {
    kind: 'request',
    channel: 'purchasing.getPO',
    input: z.object({ id: z.string() }),
    output: purchaseOrder,
    errors: ['NOT_FOUND'] as const
  },
  createPO: {
    kind: 'request',
    channel: 'purchasing.createPO',
    input: z.object({
      sessionId: z.string(),
      supplierId: z.string(),
      expectedAt: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      lines: z.array(poLineInput).min(1)
    }),
    output: purchaseOrder,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'SUPPLIER_NOT_FOUND', 'PRODUCT_NOT_FOUND'] as const
  },
  updatePO: {
    kind: 'request',
    channel: 'purchasing.updatePO',
    input: z.object({
      sessionId: z.string(),
      id: z.string(),
      expectedAt: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      lines: z.array(poLineInput).min(1).optional()
    }),
    output: purchaseOrder,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_STATUS'] as const
  },
  submitPO: {
    kind: 'request',
    channel: 'purchasing.submitPO',
    input: z.object({ sessionId: z.string(), id: z.string() }),
    output: purchaseOrder,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_STATUS'] as const
  },
  cancelPO: {
    kind: 'request',
    channel: 'purchasing.cancelPO',
    input: z.object({ sessionId: z.string(), id: z.string() }),
    output: purchaseOrder,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_STATUS'] as const
  },
  receivePO: {
    kind: 'request',
    channel: 'purchasing.receivePO',
    input: z.object({
      sessionId: z.string(),
      poId: z.string(),
      lines: z.array(receiveLineInput).min(1),
      notes: z.string().nullable().optional()
    }),
    output: z.object({
      receiptId: z.string(),
      receiptNumber: z.string(),
      po: purchaseOrder
    }),
    errors: [
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'BAD_STATUS',
      'OVER_RECEIPT',
      'SERIAL_REQUIRED',
      'SERIAL_DUPLICATE',
      'SERIAL_QTY_MISMATCH'
    ] as const
  }
} as const

export type SupplierDTO = z.infer<typeof supplier>
export type PurchaseOrderDTO = z.infer<typeof purchaseOrder>
export type PurchaseOrderLineDTO = z.infer<typeof poLine>
