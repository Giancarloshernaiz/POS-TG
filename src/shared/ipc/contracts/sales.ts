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
  /** Unidad de venta (UNIDAD, KG, ...). La factura separa kilos de unidades. */
  unitOfMeasure: z.string().default('UNIDAD'),
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
  // La factura de Galas Cloud imprime RIF y dirección del cliente.
  customerDocType: z.string().nullable().default(null),
  customerDocId: z.string().nullable().default(null),
  customerAddress: z.string().nullable().default(null),
  userId: z.string(),
  cashSessionId: z.string(),
  status: z.enum(['completed', 'voided']),
  subtotal: z.number(),
  discountTotal: z.number(),
  usdDiscountTotal: z.number().default(0),
  usdDiscountRateBp: z.number().default(0),
  creditApplied: z.number().default(0),
  fidelityApplied: z.number().default(0),
  taxTotal: z.number(),
  igtfTotal: z.number(),
  total: z.number(),
  rateUsed: z.number().nullable(),
  notes: z.string().nullable(),
  returnStatus: z.enum(['pending', 'approved', 'rejected']).nullable().default(null),
  returnRequestId: z.number().int().nullable().default(null),
  createdAt: z.number(),
  sellerId: z.string().nullable().default(null),
  sellerName: z.string().nullable().default(null),
  // Estado de subida a Galas Cloud. La reimpresión y la devolución exigen que la
  // venta ya exista allá, así que el historial lo muestra por adelantado en vez
  // de dejar que el cajero se entere al recibir el error.
  syncStatus: z.enum(['synced', 'pending', 'error']).default('pending'),
  agroSaleId: z.number().nullable().default(null),
  lines: z.array(saleLine),
  payments: z.array(payment)
})

const seller = z.object({
  id: z.string(),
  agroId: z.number(),
  nombre: z.string(),
  apellido: z.string(),
  cedula: z.string(),
  active: z.boolean()
})

export const salesContract = {
  /** Vendedores activos de la tienda, bajados del máster por pull. */
  listSellers: {
    kind: 'request',
    channel: 'sales.listSellers',
    input: z.object({}).optional(),
    output: z.array(seller),
    errors: [] as const
  },
  create: {
    kind: 'request',
    channel: 'sales.create',
    input: z.object({
      sessionId: z.string(),
      customerId: z.string().nullable().optional(),
      // Comisionista atribuido a la venta (opcional).
      sellerId: z.string().nullable().optional(),
      lines: z.array(saleLineInput).min(1),
      payments: z.array(paymentInput),
      useStoreCredit: z.boolean().default(false),
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
        /** Busca por número de factura o nombre de cliente. */
        search: z.string().trim().optional(),
        /** Rango por fecha de la venta, en epoch ms. */
        from: z.number().int().optional(),
        to: z.number().int().optional(),
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

export type SellerDTO = z.infer<typeof seller>
export type SaleDTO = z.infer<typeof sale>
export type SaleLineDTO = z.infer<typeof saleLine>
export type SalePaymentDTO = z.infer<typeof payment>
