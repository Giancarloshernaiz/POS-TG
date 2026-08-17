import { and, eq, like, or, desc, sql, isNull, type SQL } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { z } from 'zod'
import { getDb } from '@main/infrastructure/db/client'
import { categories, products, stockLevels } from '@main/infrastructure/db/schema'
import { catalogContract } from '@shared/ipc/contracts/catalog'
import type { CategoryDTO, ProductDTO } from '@shared/ipc/contracts/catalog'
import {
  resolveDiscount,
  effectivePriceCents,
  type Discount,
  type DiscountType
} from '@shared/pricing'
import { emitLocalEvent } from '@main/infrastructure/sync/p2p/p2p.service'
import type {
  ProductUpsertPayload,
  CategoryUpsertPayload
} from '@main/infrastructure/sync/p2p/reducers/catalog.reducer'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import {
  updateProductInAgro,
  createCategoryInAgro,
  updateCategoryInAgro,
  deleteProductInAgro
} from '@main/infrastructure/sync/agroone/agro.client'

type Input<K extends keyof typeof catalogContract> = z.infer<(typeof catalogContract)[K]['input']>

class CatalogError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

// ---- Catálogo: el dueño es AgroOne (Centro de Acopio), no el POS -----------
//
// Productos y categorías se crean/editan SIEMPRE en el máster y bajan por pull.
// El POS no puede crear filas locales de catálogo: una fila sin `agroId` deja
// trabada para siempre (sync_state.phase = ERROR) cualquier venta que la use,
// porque push.service no sabe a qué producto del máster corresponde.
// Corolario: estas operaciones exigen red. Es intencional — es la única forma
// de que no exista catálogo divergente entre cajas y máster.

/** Base URL del máster, o error accionable si la caja no está aprovisionada. */
async function requireAgroBaseUrl(): Promise<string> {
  const identity = await getIdentity()
  if (!isProvisioned(identity) || !identity.agroBaseUrl) {
    throw new CatalogError(
      'NOT_PROVISIONED',
      'Esta caja no está vinculada a AgroOne. Configúrala en Ajustes antes de dar de alta productos.'
    )
  }
  return identity.agroBaseUrl
}

/** Traduce un fallo del máster a un mensaje accionable para el cajero. */
function toCatalogSyncError(err: unknown, accion: string): CatalogError {
  if (err instanceof CatalogError) return err
  const msg = err instanceof Error ? err.message : String(err)
  return new CatalogError(
    'AGRO_UNREACHABLE',
    `No se pudo ${accion} en AgroOne (${msg}). El catálogo lo administra el Centro de Acopio: hace falta conexión.`
  )
}

/** agroId de una categoría local; falla si todavía no está sincronizada. */
async function requireCategoryAgroId(
  db: ReturnType<typeof getDb>,
  categoryId: string
): Promise<number> {
  const cat = await db.select().from(categories).where(eq(categories.id, categoryId)).get()
  if (!cat) throw new CatalogError('INVALID_CATEGORY', 'la categoría no existe')
  if (!cat.agroId) {
    throw new CatalogError(
      'CATEGORY_NOT_SYNCED',
      `La categoría "${cat.name}" todavía no existe en AgroOne. Sincroniza antes de usarla.`
    )
  }
  return cat.agroId
}

function toCategoryDto(
  row: typeof categories.$inferSelect,
  parentName: string | null
): CategoryDTO {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId ?? null,
    parentName,
    lowStockThreshold: row.lowStockThreshold ?? null,
    discountType: row.discountType,
    discountValue: row.discountValue,
    icon: row.icon ?? null,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

type ProductRow = {
  id: string
  sku: string
  barcode: string | null
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  basePrice: number
  costPrice: number | null
  taxRateBp: number
  tracksSerial: boolean
  unitOfMeasure: string
  lowStockThreshold: number | null
  discountType: DiscountType
  discountValue: number
  categoryDiscountType: DiscountType | null
  categoryDiscountValue: number | null
  active: boolean
  stock: number | null
  createdAt: number
  updatedAt: number
}

async function nearestCategoryDiscount(categoryId: string | null): Promise<Discount | null> {
  const db = getDb()
  let id = categoryId
  const visited = new Set<string>()
  while (id && !visited.has(id)) {
    visited.add(id)
    const category = await db.select().from(categories).where(eq(categories.id, id)).get()
    if (!category) break
    if (category.discountType !== 'none' && category.discountValue > 0) {
      return { type: category.discountType, value: category.discountValue }
    }
    id = category.parentId ?? null
  }
  return null
}

async function toProductDto(row: ProductRow): Promise<ProductDTO> {
  const productDiscount: Discount = { type: row.discountType, value: row.discountValue }
  const categoryDiscount = await nearestCategoryDiscount(row.categoryId)
  const { discount, source } = resolveDiscount(productDiscount, categoryDiscount)
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    basePrice: row.basePrice,
    costPrice: row.costPrice,
    taxRateBp: row.taxRateBp,
    tracksSerial: row.tracksSerial,
    unitOfMeasure: row.unitOfMeasure,
    lowStockThreshold: row.lowStockThreshold,
    discountType: row.discountType,
    discountValue: row.discountValue,
    effectiveDiscountType: discount.type,
    effectiveDiscountValue: discount.value,
    effectiveDiscountSource: source,
    effectivePrice: effectivePriceCents(row.basePrice, discount),
    active: row.active,
    stock: row.stock ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

const productSelect = {
  id: products.id,
  sku: products.sku,
  barcode: products.barcode,
  name: products.name,
  description: products.description,
  categoryId: products.categoryId,
  categoryName: categories.name,
  basePrice: products.basePrice,
  costPrice: products.costPrice,
  taxRateBp: products.taxRateBp,
  tracksSerial: products.tracksSerial,
  unitOfMeasure: products.unitOfMeasure,
  lowStockThreshold: products.lowStockThreshold,
  discountType: products.discountType,
  discountValue: products.discountValue,
  categoryDiscountType: categories.discountType,
  categoryDiscountValue: categories.discountValue,
  active: products.active,
  stock: stockLevels.quantity,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt
}

// P2P (§8.4): comparte altas/ediciones de catálogo con las demás cajas de la
// tienda (LWW). El reducer receptor ignora esto si la fila ya tiene agroId
// (AgroOne converge ese caso vía pull, no P2P) — ver catalog.reducer.ts.
async function emitProductUpsertEvent(db: ReturnType<typeof getDb>, id: string): Promise<void> {
  const row = await db.select().from(products).where(eq(products.id, id)).get()
  if (!row) return
  let categoryAgroId: number | null = null
  let categoryName: string | null = null
  if (row.categoryId) {
    const cat = await db.select().from(categories).where(eq(categories.id, row.categoryId)).get()
    categoryAgroId = cat?.agroId ?? null
    categoryName = cat?.name ?? null
  }
  const payload: ProductUpsertPayload = {
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    categoryAgroId,
    categoryName,
    basePrice: row.basePrice,
    costPrice: row.costPrice,
    taxRateBp: row.taxRateBp,
    tracksSerial: row.tracksSerial,
    unitOfMeasure: row.unitOfMeasure,
    lowStockThreshold: row.lowStockThreshold,
    discountType: row.discountType,
    discountValue: row.discountValue,
    active: row.active,
    agroId: row.agroId
  }
  const env = emitLocalEvent('product', id, 'product.upserted', payload)
  if (env) await db.update(products).set({ lwwHlc: env.hlc }).where(eq(products.id, id)).run()
}

async function emitCategoryUpsertEvent(db: ReturnType<typeof getDb>, id: string): Promise<void> {
  const row = await db.select().from(categories).where(eq(categories.id, id)).get()
  if (!row) return
  let parentAgroId: number | null = null
  let parentName: string | null = null
  if (row.parentId) {
    const parent = await db.select().from(categories).where(eq(categories.id, row.parentId)).get()
    parentAgroId = parent?.agroId ?? null
    parentName = parent?.name ?? null
  }
  const payload: CategoryUpsertPayload = {
    name: row.name,
    parentAgroId,
    parentName,
    lowStockThreshold: row.lowStockThreshold,
    discountType: row.discountType,
    discountValue: row.discountValue,
    icon: row.icon,
    active: row.active,
    agroId: row.agroId
  }
  const env = emitLocalEvent('category', id, 'category.upserted', payload)
  if (env) await db.update(categories).set({ lwwHlc: env.hlc }).where(eq(categories.id, id)).run()
}

async function fetchProductById(id: string): Promise<ProductDTO> {
  const db = getDb()
  const row = await db
    .select(productSelect)
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(
      stockLevels,
      and(eq(stockLevels.productId, products.id), eq(stockLevels.locationId, 'main'))
    )
    .where(eq(products.id, id))
    .get()
  if (!row) throw new CatalogError('NOT_FOUND', 'producto no existe')
  return await toProductDto(row as ProductRow)
}

async function fetchCategoryById(id: string): Promise<CategoryDTO> {
  const db = getDb()
  const row = await db.select().from(categories).where(eq(categories.id, id)).get()
  if (!row) throw new CatalogError('NOT_FOUND', 'categoría no existe')
  let parentName: string | null = null
  if (row.parentId) {
    const parent = await db.select().from(categories).where(eq(categories.id, row.parentId)).get()
    parentName = parent?.name ?? null
  }
  return toCategoryDto(row, parentName)
}

export const catalogHandlers = {
  async listCategories(): Promise<CategoryDTO[]> {
    const db = getDb()
    const rows = await db.select().from(categories).all()
    const nameById = new Map(rows.map((r) => [r.id, r.name]))
    // Order: parents first (alpha), each followed by its children (alpha).
    const roots = rows.filter((r) => !r.parentId).sort((a, b) => a.name.localeCompare(b.name))
    const childrenOf = (pid: string): typeof rows =>
      rows.filter((r) => r.parentId === pid).sort((a, b) => a.name.localeCompare(b.name))
    const ordered: typeof rows = []
    for (const root of roots) {
      ordered.push(root)
      ordered.push(...childrenOf(root.id))
    }
    // Append any orphans (parent missing) so nothing is hidden.
    for (const r of rows) if (!ordered.includes(r)) ordered.push(r)
    return ordered.map((r) =>
      toCategoryDto(r, r.parentId ? (nameById.get(r.parentId) ?? null) : null)
    )
  },

  async createCategory(input: Input<'createCategory'>): Promise<CategoryDTO> {
    const db = getDb()
    const parentId = input.parentId ?? null
    if (parentId) {
      const parent = await db.select().from(categories).where(eq(categories.id, parentId)).get()
      if (!parent) throw new CatalogError('INVALID_PARENT', 'categoría padre no existe')
      if (parent.parentId)
        throw new CatalogError('INVALID_PARENT', 'solo se permite un nivel de subcategoría')
    }
    const dupe = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.name, input.name),
          parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId)
        )
      )
      .get()
    if (dupe) throw new CatalogError('DUPLICATE_NAME', 'categoría ya existe')

    // Alta en el máster primero: la fila local nace ya con su `agroId`.
    const baseUrl = await requireAgroBaseUrl()
    const parentAgroId = parentId ? await requireCategoryAgroId(db, parentId) : null
    let agroId: number
    try {
      agroId = await createCategoryInAgro(baseUrl, {
        nombre: input.name,
        parentAgroId,
        simbolo: input.icon ?? null
      })
    } catch (err) {
      throw toCatalogSyncError(err, 'crear la categoría')
    }

    const now = Date.now()
    const id = ulid()
    await db
      .insert(categories)
      .values({
        id,
        name: input.name,
        parentId,
        lowStockThreshold: input.lowStockThreshold ?? null,
        discountType: input.discountType ?? 'none',
        discountValue: input.discountValue ?? 0,
        icon: input.icon ?? null,
        agroId,
        active: true,
        createdAt: now,
        updatedAt: now
      })
      .run()
    await emitCategoryUpsertEvent(db, id)
    return fetchCategoryById(id)
  },

  async updateCategory(input: Input<'updateCategory'>): Promise<CategoryDTO> {
    const db = getDb()
    const current = await db.select().from(categories).where(eq(categories.id, input.id)).get()
    if (!current) throw new CatalogError('NOT_FOUND', 'categoría no existe')
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === input.id)
        throw new CatalogError('INVALID_PARENT', 'no puede ser su propio padre')
      const parent = await db
        .select()
        .from(categories)
        .where(eq(categories.id, input.parentId))
        .get()
      if (!parent) throw new CatalogError('INVALID_PARENT', 'categoría padre no existe')
      if (parent.parentId)
        throw new CatalogError('INVALID_PARENT', 'solo se permite un nivel de subcategoría')
    }
    // Nombre, padre e ícono viven en el máster: se propagan allá antes de
    // tocar la copia local, o el próximo pull revertiría el cambio.
    const tocaMaster =
      input.name !== undefined || input.parentId !== undefined || input.icon !== undefined
    if (tocaMaster) {
      if (!current.agroId) {
        throw new CatalogError(
          'CATEGORY_NOT_SYNCED',
          `La categoría "${current.name}" todavía no existe en AgroOne. Sincroniza antes de editarla.`
        )
      }
      const baseUrl = await requireAgroBaseUrl()
      const parentAgroId =
        input.parentId !== undefined && input.parentId !== null
          ? await requireCategoryAgroId(db, input.parentId)
          : undefined
      try {
        await updateCategoryInAgro(baseUrl, current.agroId, {
          ...(input.name !== undefined ? { nombre: input.name } : {}),
          ...(parentAgroId !== undefined ? { parentAgroId } : {}),
          ...(input.icon !== undefined ? { simbolo: input.icon } : {})
        })
      } catch (err) {
        throw toCatalogSyncError(err, 'actualizar la categoría')
      }
    }

    const updates: Partial<typeof categories.$inferInsert> = { updatedAt: Date.now() }
    if (input.name !== undefined) updates.name = input.name
    if (input.parentId !== undefined) updates.parentId = input.parentId
    if (input.lowStockThreshold !== undefined) updates.lowStockThreshold = input.lowStockThreshold
    if (input.discountType !== undefined) updates.discountType = input.discountType
    if (input.discountValue !== undefined) updates.discountValue = input.discountValue
    if (input.icon !== undefined) updates.icon = input.icon
    if (input.active !== undefined) updates.active = input.active
    await db.update(categories).set(updates).where(eq(categories.id, input.id)).run()
    await emitCategoryUpsertEvent(db, input.id)
    return fetchCategoryById(input.id)
  },

  async listProducts(
    input: Input<'listProducts'>
  ): Promise<{ items: ProductDTO[]; total: number }> {
    const db = getDb()
    const conds: SQL[] = []
    if (input.activeOnly) conds.push(eq(products.active, true))
    if (input.categoryId !== undefined && input.categoryId !== null) {
      conds.push(eq(products.categoryId, input.categoryId))
    }
    if (input.search) {
      const s = `%${input.search}%`
      conds.push(or(like(products.sku, s), like(products.name, s), like(products.barcode, s))!)
    }
    const where = conds.length > 0 ? and(...conds) : undefined

    const items = await db
      .select(productSelect)
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        stockLevels,
        and(eq(stockLevels.productId, products.id), eq(stockLevels.locationId, 'main'))
      )
      .where(where)
      .orderBy(products.name)
      .limit(input.limit)
      .offset(input.offset)
      .all()

    const totalRow = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(products)
      .where(where)
      .get()

    return {
      items: await Promise.all(items.map((r) => toProductDto(r as ProductRow))),
      total: totalRow?.c ?? 0
    }
  },

  async getProduct(input: Input<'getProduct'>): Promise<ProductDTO> {
    return fetchProductById(input.id)
  },

  async findByCode(input: Input<'findByCode'>): Promise<ProductDTO | null> {
    const db = getDb()
    const row = await db
      .select(productSelect)
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        stockLevels,
        and(eq(stockLevels.productId, products.id), eq(stockLevels.locationId, 'main'))
      )
      .where(or(eq(products.sku, input.code), eq(products.barcode, input.code)))
      .orderBy(desc(products.active))
      .get()
    return row ? await toProductDto(row as ProductRow) : null
  },

  async createProduct(input: Input<'createProduct'>): Promise<ProductDTO> {
    void input
    throw new CatalogError(
      'FORBIDDEN',
      'La creación de productos está deshabilitada en el POS. Crea el producto en Tiendas Gala y sincroniza la caja.'
    )
  },

  /**
   * Baja de producto. La pide la caja, la decide el máster: borra de verdad
   * solo si el producto nunca se movió; si tiene historial lo desactiva.
   * Localmente se refleja el resultado sin esperar al próximo pull.
   */
  async deleteProduct(
    input: Input<'deleteProduct'>
  ): Promise<{ modo: 'eliminado' | 'desactivado'; message: string }> {
    const db = getDb()
    const current = await db.select().from(products).where(eq(products.id, input.id)).get()
    if (!current) throw new CatalogError('NOT_FOUND', 'producto no existe')
    if (!current.agroId) {
      throw new CatalogError(
        'NOT_SYNCED',
        `"${current.name}" no está sincronizado con AgroOne. Usa la reconciliación de catálogo en Ajustes.`
      )
    }

    const baseUrl = await requireAgroBaseUrl()
    let resultado: Awaited<ReturnType<typeof deleteProductInAgro>>
    try {
      resultado = await deleteProductInAgro(baseUrl, current.agroId)
    } catch (err) {
      throw toCatalogSyncError(err, 'dar de baja el producto')
    }

    if (resultado.modo === 'eliminado') {
      // Ya no existe en el máster. No se borra la fila local porque hay FKs
      // (líneas de venta históricas); se desactiva y el pull no la reactivará.
      await db
        .update(products)
        .set({ active: false, agroId: null, updatedAt: Date.now() })
        .where(eq(products.id, input.id))
        .run()
    } else {
      await db
        .update(products)
        .set({ active: false, updatedAt: Date.now() })
        .where(eq(products.id, input.id))
        .run()
    }
    await emitProductUpsertEvent(db, input.id)
    return resultado
  },

  async updateProduct(input: Input<'updateProduct'>): Promise<ProductDTO> {
    const db = getDb()
    const current = await db.select().from(products).where(eq(products.id, input.id)).get()
    if (!current) throw new CatalogError('NOT_FOUND', 'producto no existe')

    if (input.sku !== undefined && input.sku !== current.sku) {
      const dup = await db.select().from(products).where(eq(products.sku, input.sku)).get()
      if (dup) throw new CatalogError('DUPLICATE_SKU', 'SKU ya existe')
    }
    if (input.barcode !== undefined && input.barcode !== current.barcode && input.barcode) {
      const dup = await db.select().from(products).where(eq(products.barcode, input.barcode)).get()
      if (dup) throw new CatalogError('DUPLICATE_BARCODE', 'código de barras ya existe')
    }

    // Campos que pertenecen al máster: se propagan allá ANTES de tocar la copia
    // local, porque el próximo `pullAll` sobrescribe estos mismos campos con lo
    // que diga AgroOne. Editarlos solo en local es un cambio que se pierde.
    const CAMPOS_DEL_MASTER = [
      'sku',
      'barcode',
      'name',
      'description',
      'categoryId',
      'basePrice',
      'costPrice',
      'unitOfMeasure',
      'lowStockThreshold'
    ] as const
    const tocaMaster = CAMPOS_DEL_MASTER.some((k) => input[k] !== undefined)
    if (tocaMaster) {
      if (!current.agroId) {
        throw new CatalogError(
          'PRODUCT_NOT_SYNCED',
          `"${current.name}" todavía no está sincronizado con AgroOne. Usa la reconciliación de catálogo en Ajustes antes de editarlo.`
        )
      }
      const baseUrl = await requireAgroBaseUrl()
      const categoriaAgroId =
        input.categoryId !== undefined && input.categoryId !== null
          ? await requireCategoryAgroId(db, input.categoryId)
          : undefined
      try {
        await updateProductInAgro(baseUrl, current.agroId, {
          ...(input.sku !== undefined ? { codigo: input.sku } : {}),
          ...(input.barcode !== undefined && input.barcode ? { codigoBarras: input.barcode } : {}),
          ...(input.name !== undefined ? { nombre: input.name } : {}),
          ...(input.description !== undefined ? { descripcion: input.description } : {}),
          ...(categoriaAgroId !== undefined ? { categoriaAgroId } : {}),
          ...(input.unitOfMeasure !== undefined ? { unidadMedida: input.unitOfMeasure } : {}),
          ...(input.basePrice !== undefined ? { precioVentaCents: input.basePrice } : {}),
          ...(input.costPrice !== undefined ? { costoPromedioCents: input.costPrice } : {}),
          ...(input.lowStockThreshold !== undefined ? { stockMinimo: input.lowStockThreshold } : {})
        })
      } catch (err) {
        throw toCatalogSyncError(err, 'actualizar el producto')
      }
    }

    const updates: Partial<typeof products.$inferInsert> = { updatedAt: Date.now() }
    for (const k of [
      'sku',
      'barcode',
      'name',
      'description',
      'categoryId',
      'basePrice',
      'costPrice',
      'taxRateBp',
      'unitOfMeasure',
      'lowStockThreshold',
      'discountType',
      'discountValue',
      'active'
    ] as const) {
      const v = input[k]
      if (v !== undefined) (updates as Record<string, unknown>)[k] = v
    }
    await db.update(products).set(updates).where(eq(products.id, input.id)).run()
    await emitProductUpsertEvent(db, input.id)
    return fetchProductById(input.id)
  }
}
