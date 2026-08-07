import { z } from 'zod'

const discountType = z.enum(['none', 'percent', 'amount'])

const category = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  parentName: z.string().nullable(),
  lowStockThreshold: z.number().nullable(),
  discountType,
  discountValue: z.number(),
  icon: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number()
})

const product = z.object({
  id: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  basePrice: z.number(),
  costPrice: z.number().nullable(),
  taxRateBp: z.number(),
  tracksSerial: z.boolean(),
  unitOfMeasure: z.string(),
  lowStockThreshold: z.number().nullable(),
  discountType,
  discountValue: z.number(),
  // resolved (product overrides category)
  effectiveDiscountType: discountType,
  effectiveDiscountValue: z.number(),
  effectiveDiscountSource: z.enum(['product', 'category', 'none']),
  effectivePrice: z.number(),
  active: z.boolean(),
  stock: z.number(),
  createdAt: z.number(),
  updatedAt: z.number()
})

const productInput = z.object({
  sku: z.string().min(1).max(64),
  barcode: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  basePrice: z.number().int().nonnegative(),
  costPrice: z.number().int().nonnegative().nullable().optional(),
  taxRateBp: z.number().int().nonnegative().default(0),
  tracksSerial: z.boolean().default(false),
  unitOfMeasure: z.string().min(1).max(20).default('UNIDAD'),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
  discountType: discountType.default('none'),
  discountValue: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true)
})

export const catalogContract = {
  listCategories: {
    kind: 'request',
    channel: 'catalog.listCategories',
    input: z.object({}).optional(),
    output: z.array(category),
    errors: [] as const
  },
  createCategory: {
    kind: 'request',
    channel: 'catalog.createCategory',
    input: z.object({
      name: z.string().min(1).max(100),
      parentId: z.string().nullable().optional(),
      lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
      discountType: discountType.optional(),
      discountValue: z.number().int().nonnegative().optional(),
      icon: z.string().max(60).nullable().optional()
    }),
    output: category,
    errors: ['DUPLICATE_NAME', 'INVALID_PARENT'] as const
  },
  updateCategory: {
    kind: 'request',
    channel: 'catalog.updateCategory',
    input: z.object({
      id: z.string(),
      name: z.string().min(1).max(100).optional(),
      parentId: z.string().nullable().optional(),
      lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
      discountType: discountType.optional(),
      discountValue: z.number().int().nonnegative().optional(),
      icon: z.string().max(60).nullable().optional(),
      active: z.boolean().optional()
    }),
    output: category,
    errors: ['NOT_FOUND', 'DUPLICATE_NAME', 'INVALID_PARENT'] as const
  },
  listProducts: {
    kind: 'request',
    channel: 'catalog.listProducts',
    input: z.object({
      search: z.string().optional(),
      categoryId: z.string().nullable().optional(),
      activeOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().nonnegative().default(0)
    }),
    output: z.object({
      items: z.array(product),
      total: z.number()
    }),
    errors: [] as const
  },
  getProduct: {
    kind: 'request',
    channel: 'catalog.getProduct',
    input: z.object({ id: z.string() }),
    output: product,
    errors: ['NOT_FOUND'] as const
  },
  findByCode: {
    kind: 'request',
    channel: 'catalog.findByCode',
    input: z.object({ code: z.string().min(1) }),
    output: product.nullable(),
    errors: [] as const
  },
  createProduct: {
    kind: 'request',
    channel: 'catalog.createProduct',
    input: productInput,
    output: product,
    errors: ['DUPLICATE_SKU', 'DUPLICATE_BARCODE'] as const
  },
  deleteProduct: {
    kind: 'request',
    channel: 'catalog.deleteProduct',
    input: z.object({ sessionId: z.string(), id: z.string() }),
    // El máster decide el modo: `eliminado` si el producto nunca se movió,
    // `desactivado` si tiene historial que no se puede destruir.
    output: z.object({
      modo: z.enum(['eliminado', 'desactivado']),
      message: z.string()
    }),
    errors: [
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'NOT_SYNCED',
      'NOT_PROVISIONED',
      'AGRO_UNREACHABLE'
    ] as const
  },

  updateProduct: {
    kind: 'request',
    channel: 'catalog.updateProduct',
    input: productInput.partial().extend({ id: z.string() }),
    output: product,
    errors: ['NOT_FOUND', 'DUPLICATE_SKU', 'DUPLICATE_BARCODE'] as const
  }
} as const

export type ProductDTO = z.infer<typeof product>
export type CategoryDTO = z.infer<typeof category>
