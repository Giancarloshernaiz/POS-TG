import { z } from 'zod'

const serialStatus = z.enum(['available', 'reserved', 'sold', 'returned', 'defective'])

const serial = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productSku: z.string(),
  imei: z.string(),
  status: serialStatus,
  currentSaleId: z.string().nullable(),
  locationId: z.string(),
  receivedAt: z.number(),
  receivedVia: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})

const stockRow = z.object({
  productId: z.string(),
  sku: z.string(),
  name: z.string(),
  tracksSerial: z.boolean(),
  quantity: z.number(),
  serialsAvailable: z.number(),
  effectiveThreshold: z.number(),
  isLow: z.boolean(),
  active: z.boolean()
})

export const inventoryContract = {
  listStock: {
    kind: 'request',
    channel: 'inventory.listStock',
    input: z.object({
      search: z.string().optional(),
      lowOnly: z.boolean().default(false),
      activeOnly: z.boolean().default(true)
    }),
    output: z.array(stockRow),
    errors: [] as const
  },
  adjustStock: {
    kind: 'request',
    channel: 'inventory.adjustStock',
    input: z.object({
      sessionId: z.string(),
      productId: z.string(),
      delta: z.number().int(),
      reason: z.string().min(1).max(200)
    }),
    output: z.object({ newQuantity: z.number() }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'PRODUCT_NOT_FOUND'] as const
  },
  findSerial: {
    kind: 'request',
    channel: 'inventory.findSerial',
    input: z.object({ imei: z.string().min(1) }),
    output: serial.nullable(),
    errors: [] as const
  },
  listSerials: {
    kind: 'request',
    channel: 'inventory.listSerials',
    input: z.object({
      productId: z.string().optional(),
      status: serialStatus.optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().nonnegative().default(0)
    }),
    output: z.object({ items: z.array(serial), total: z.number() }),
    errors: [] as const
  }
} as const

export type SerialDTO = z.infer<typeof serial>
export type StockRowDTO = z.infer<typeof stockRow>
