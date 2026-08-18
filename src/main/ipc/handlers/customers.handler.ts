import { and, eq, like, or, gt, desc, sql, type SQL } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { z } from 'zod'
import { getDb } from '@main/infrastructure/db/client'
import { customers, arMovements } from '@main/infrastructure/db/schema'
import { requirePermission } from '@main/auth/guard'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import { customersContract } from '@shared/ipc/contracts/customers'
import type { CustomerDTO, ArMovementDTO } from '@shared/ipc/contracts/customers'
import { emitLocalEvent } from '@main/infrastructure/sync/p2p/p2p.service'
import type { CustomerUpsertPayload } from '@main/infrastructure/sync/p2p/reducers/catalog.reducer'
import { pushCustomer } from '@main/infrastructure/sync/agroone/push.service'

type Input<K extends keyof typeof customersContract> = z.infer<
  (typeof customersContract)[K]['input']
>

class CustomerError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

function toDto(row: typeof customers.$inferSelect): CustomerDTO {
  return {
    id: row.id,
    name: row.name,
    docType: row.docType ?? null,
    docId: row.docId,
    phone: row.phone,
    email: row.email,
    address: row.address,
    creditLimit: row.creditLimit,
    currentBalance: row.currentBalance,
    specialDiscountBp: row.specialDiscountBp,
    favorBalance: row.favorBalance,
    returnCreditBalance: row.returnCreditBalance,
    fidelityBalance: row.fidelityBalance,
    fidelityAccumulated: row.fidelityAccumulated,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

async function fetchById(id: string): Promise<CustomerDTO> {
  const db = getDb()
  const row = await db.select().from(customers).where(eq(customers.id, id)).get()
  if (!row) throw new CustomerError('NOT_FOUND', 'cliente no existe')
  return toDto(row)
}

// P2P (§8.4): comparte altas/ediciones de cliente con las demás cajas de la
// tienda (LWW). Ver nota de emitProductUpsertEvent en catalog.handler.ts.
async function emitCustomerUpsertEvent(db: ReturnType<typeof getDb>, id: string): Promise<void> {
  const row = await db.select().from(customers).where(eq(customers.id, id)).get()
  if (!row) return
  const payload: CustomerUpsertPayload = {
    name: row.name,
    docType: row.docType,
    docId: row.docId,
    phone: row.phone,
    email: row.email,
    address: row.address,
    creditLimit: row.creditLimit,
    specialDiscountBp: row.specialDiscountBp,
    active: row.active,
    agroId: row.agroId
  }
  const env = emitLocalEvent('customer', id, 'customer.upserted', payload)
  if (env) await db.update(customers).set({ lwwHlc: env.hlc }).where(eq(customers.id, id)).run()
}

export const customersHandlers = {
  async list(input?: Input<'list'>): Promise<CustomerDTO[]> {
    const db = getDb()
    const conds: SQL[] = []
    if (input?.activeOnly) conds.push(eq(customers.active, true))
    if (input?.withDebtOnly) conds.push(gt(customers.currentBalance, 0))
    if (input?.search) {
      const s = `%${input.search}%`
      conds.push(or(like(customers.name, s), like(customers.docId, s), like(customers.phone, s))!)
    }
    const where = conds.length > 0 ? and(...conds) : undefined
    const rows = await db.select().from(customers).where(where).orderBy(customers.name).all()
    return rows.map(toDto)
  },

  async get(input: Input<'get'>): Promise<CustomerDTO> {
    return fetchById(input.id)
  },

  async findByDoc(input: Input<'findByDoc'>): Promise<CustomerDTO | null> {
    const db = getDb()
    const row = await db
      .select()
      .from(customers)
      .where(and(eq(customers.docType, input.docType), eq(customers.docId, input.docId)))
      .get()
    return row ? toDto(row) : null
  },

  async create(input: Input<'create'>): Promise<CustomerDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.CUSTOMERS_MANAGE)
    const db = getDb()
    const id = ulid()
    const now = Date.now()
    await db
      .insert(customers)
      .values({
        id,
        name: input.name,
        docType: input.docType ?? null,
        docId: input.docId ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        creditLimit: input.creditLimit,
        currentBalance: 0,
        specialDiscountBp: input.specialDiscountBp,
        active: input.active,
        syncPending: true,
        createdAt: now,
        updatedAt: now
      })
      .run()
    await audit({
      userId: session.userId,
      action: 'customer.create',
      targetType: 'customer',
      targetId: id
    })
    await emitCustomerUpsertEvent(db, id)
    void pushCustomer(id)
    return fetchById(id)
  },

  async update(input: Input<'update'>): Promise<CustomerDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.CUSTOMERS_MANAGE)
    const db = getDb()
    const current = await db.select().from(customers).where(eq(customers.id, input.id)).get()
    if (!current) throw new CustomerError('NOT_FOUND', 'cliente no existe')
    const updates: Partial<typeof customers.$inferInsert> = {
      updatedAt: Date.now(),
      syncPending: true
    }
    for (const k of [
      'name',
      'docType',
      'docId',
      'phone',
      'email',
      'address',
      'creditLimit',
      'specialDiscountBp',
      'active'
    ] as const) {
      if (input[k] !== undefined) (updates as Record<string, unknown>)[k] = input[k]
    }
    await db.update(customers).set(updates).where(eq(customers.id, input.id)).run()
    await audit({
      userId: session.userId,
      action: 'customer.update',
      targetType: 'customer',
      targetId: input.id
    })
    await emitCustomerUpsertEvent(db, input.id)
    // La edición ya quedó persistida localmente. Se intenta subir de inmediato;
    // si no hay red, syncPending hace que el scheduler la reintente sin perderla.
    void pushCustomer(input.id)
    return fetchById(input.id)
  },

  async ledger(input: Input<'ledger'>): Promise<ArMovementDTO[]> {
    const db = getDb()
    const rows = await db
      .select()
      .from(arMovements)
      .where(eq(arMovements.customerId, input.customerId))
      .orderBy(desc(arMovements.ts))
      .limit(input.limit)
      .all()
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      saleId: r.saleId ?? null,
      type: r.type,
      amount: r.amount,
      notes: r.notes,
      ts: r.ts
    }))
  },

  async registerPayment(input: Input<'registerPayment'>): Promise<CustomerDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.CUSTOMERS_MANAGE)
    const db = getDb()
    const current = await db
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .get()
    if (!current) throw new CustomerError('NOT_FOUND', 'cliente no existe')
    const now = Date.now()
    await db
      .insert(arMovements)
      .values({
        id: ulid(),
        customerId: input.customerId,
        saleId: null,
        type: 'payment',
        amount: -input.amount, // payment reduces balance
        notes: input.notes ?? null,
        ts: now,
        userId: session.userId
      })
      .run()
    await db
      .update(customers)
      .set({
        currentBalance: sql`${customers.currentBalance} - ${input.amount}`,
        updatedAt: now
      })
      .where(eq(customers.id, input.customerId))
      .run()
    await audit({
      userId: session.userId,
      action: 'customer.payment',
      targetType: 'customer',
      targetId: input.customerId,
      after: { amount: input.amount }
    })
    return fetchById(input.customerId)
  }
}
