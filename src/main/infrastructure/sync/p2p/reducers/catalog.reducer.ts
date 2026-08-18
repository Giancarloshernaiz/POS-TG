import { eq } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { products, categories, customers } from '@main/infrastructure/db/schema'
import { compareHlc, parseHlc } from '../hlc'
import { logger } from '@main/logger'

// Reducer LWW por campo (§8.4) para catálogo de autoría POS. Solo relevante
// mientras la fila no tenga agroId: una vez sincronizada con Galas Cloud, el pull
// periódico (Capa B) es quien converge sus campos entre cajas, no P2P.

type DiscountType = 'none' | 'percent' | 'amount'

/** true si debe ignorarse el evento remoto (local es igual o más nuevo, o ya gestiona Galas Cloud). */
function shouldSkip(
  localAgroId: number | null,
  localLwwHlc: string | null,
  remoteHlc: string
): boolean {
  if (localAgroId !== null) return true // Galas Cloud converge esta fila, no P2P
  if (!localLwwHlc) return false
  return compareHlc(parseHlc(remoteHlc), parseHlc(localLwwHlc)) <= 0
}

export type ProductUpsertPayload = {
  sku: string
  barcode: string | null
  name: string
  description: string | null
  categoryAgroId: number | null
  categoryName: string | null
  basePrice: number
  costPrice: number | null
  taxRateBp: number
  tracksSerial: boolean
  unitOfMeasure: string
  lowStockThreshold: number | null
  discountType: DiscountType
  discountValue: number
  active: boolean
  agroId: number | null
}

export function applyProductUpsert(
  productId: string,
  payload: ProductUpsertPayload,
  hlc: string,
  ts: number
): void {
  const db = getDb()
  const local = db.select().from(products).where(eq(products.id, productId)).get()
  if (local && shouldSkip(local.agroId, local.lwwHlc, hlc)) return

  let categoryId: string | null = null
  if (payload.categoryAgroId !== null) {
    categoryId =
      db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.agroId, payload.categoryAgroId))
        .get()?.id ?? null
  }
  if (!categoryId && payload.categoryName) {
    categoryId =
      db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.name, payload.categoryName))
        .get()?.id ?? null
  }

  const common = {
    sku: payload.sku,
    barcode: payload.barcode,
    name: payload.name,
    description: payload.description,
    categoryId,
    basePrice: payload.basePrice,
    costPrice: payload.costPrice,
    taxRateBp: payload.taxRateBp,
    tracksSerial: payload.tracksSerial,
    unitOfMeasure: payload.unitOfMeasure,
    lowStockThreshold: payload.lowStockThreshold,
    discountType: payload.discountType,
    discountValue: payload.discountValue,
    active: payload.active,
    agroId: payload.agroId,
    syncPending: true,
    lwwHlc: hlc,
    updatedAt: ts
  }
  try {
    if (local) {
      db.update(products).set(common).where(eq(products.id, productId)).run()
    } else {
      db.insert(products)
        .values({ id: productId, ...common, createdAt: ts })
        .run()
    }
  } catch (e) {
    logger.warn(
      { err: e, productId },
      'p2p: no se pudo aplicar product.upserted (¿SKU/barcode duplicado?)'
    )
  }
}

export type CustomerUpsertPayload = {
  name: string
  docType: 'V' | 'E' | 'J' | 'P' | 'G' | null
  docId: string | null
  phone: string | null
  email: string | null
  address: string | null
  creditLimit: number
  specialDiscountBp: number
  active: boolean
  agroId: number | null
}

export function applyCustomerUpsert(
  customerId: string,
  payload: CustomerUpsertPayload,
  hlc: string,
  ts: number
): void {
  const db = getDb()
  const local = db.select().from(customers).where(eq(customers.id, customerId)).get()
  if (local && shouldSkip(local.agroId, local.lwwHlc, hlc)) return

  const common = {
    name: payload.name,
    docType: payload.docType,
    docId: payload.docId,
    phone: payload.phone,
    email: payload.email,
    address: payload.address,
    creditLimit: payload.creditLimit,
    specialDiscountBp: payload.specialDiscountBp,
    active: payload.active,
    agroId: payload.agroId,
    lwwHlc: hlc,
    updatedAt: ts
  }
  try {
    if (local) {
      // currentBalance es un ledger local (cargos/abonos), nunca se pisa por LWW remoto.
      db.update(customers).set(common).where(eq(customers.id, customerId)).run()
    } else {
      db.insert(customers)
        .values({ id: customerId, ...common, currentBalance: 0, createdAt: ts })
        .run()
    }
  } catch (e) {
    logger.warn(
      { err: e, customerId },
      'p2p: no se pudo aplicar customer.upserted (¿docId duplicado?)'
    )
  }
}

export type CategoryUpsertPayload = {
  name: string
  parentAgroId: number | null
  parentName: string | null
  lowStockThreshold: number | null
  discountType: DiscountType
  discountValue: number
  icon: string | null
  active: boolean
  agroId: number | null
}

export function applyCategoryUpsert(
  categoryId: string,
  payload: CategoryUpsertPayload,
  hlc: string,
  ts: number
): void {
  const db = getDb()
  const local = db.select().from(categories).where(eq(categories.id, categoryId)).get()
  if (local && shouldSkip(local.agroId, local.lwwHlc, hlc)) return

  let parentId: string | null = null
  if (payload.parentAgroId !== null) {
    parentId =
      db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.agroId, payload.parentAgroId))
        .get()?.id ?? null
  }
  if (!parentId && payload.parentName) {
    parentId =
      db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.name, payload.parentName))
        .get()?.id ?? null
  }

  const common = {
    name: payload.name,
    parentId,
    lowStockThreshold: payload.lowStockThreshold,
    discountType: payload.discountType,
    discountValue: payload.discountValue,
    icon: payload.icon,
    active: payload.active,
    agroId: payload.agroId,
    lwwHlc: hlc,
    updatedAt: ts
  }
  try {
    if (local) {
      db.update(categories).set(common).where(eq(categories.id, categoryId)).run()
    } else {
      db.insert(categories)
        .values({ id: categoryId, ...common, createdAt: ts })
        .run()
    }
  } catch (e) {
    logger.warn(
      { err: e, categoryId },
      'p2p: no se pudo aplicar category.upserted (¿nombre duplicado?)'
    )
  }
}
