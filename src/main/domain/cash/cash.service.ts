import { ulid } from 'ulid'
import { and, desc, eq, gte, inArray, like, lte, sql, type SQL } from 'drizzle-orm'
import { cashSessions, cashMovements, sales, payments, users } from '@main/infrastructure/db/schema'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

type Db = BetterSQLite3Database<Record<string, unknown>>

export class CashError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export type PaymentMethodTotals = Record<string, { amountUsd: number; igtf: number; count: number }>

export type CashReport = {
  sessionId: string
  status: string
  userId: string
  userName: string
  openedAt: number
  closedAt: number | null
  openingAmount: number
  salesCount: number
  salesGross: number // sum of sale totals
  taxTotal: number
  igtfTotal: number
  byMethod: PaymentMethodTotals
  movementsIn: number // deposits
  movementsOut: number // withdrawals
  expectedCashUsd: number // opening + cash_usd payments + deposits - withdrawals
  closingAmount: number | null
  overShort: number | null
}

export async function getActiveSession(
  db: Db,
  userId: string
): Promise<typeof cashSessions.$inferSelect | null> {
  const row = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.userId, userId), eq(cashSessions.status, 'open')))
    .get()
  return row ?? null
}

export async function openSession(
  db: Db,
  userId: string,
  openingAmount: number,
  notes?: string | null
): Promise<typeof cashSessions.$inferSelect> {
  const existing = await getActiveSession(db, userId)
  if (existing) throw new CashError('SESSION_ALREADY_OPEN', 'ya tienes una caja abierta')
  const id = ulid()
  const now = Date.now()
  await db
    .insert(cashSessions)
    .values({
      id,
      userId,
      openedAt: now,
      openingAmount,
      status: 'open',
      notes: notes ?? null
    })
    .run()
  const row = await db.select().from(cashSessions).where(eq(cashSessions.id, id)).get()
  return row!
}

export async function addMovement(
  db: Db,
  input: {
    sessionId: string
    userId: string
    type: 'withdrawal' | 'deposit' | 'adjustment' | 'drop'
    amount: number
    reference?: string | null | undefined
    notes?: string | null | undefined
  }
): Promise<void> {
  const session = await db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.id, input.sessionId))
    .get()
  if (!session) throw new CashError('NOT_FOUND', 'sesión no existe')
  if (session.status !== 'open') throw new CashError('SESSION_CLOSED', 'la caja está cerrada')
  await db
    .insert(cashMovements)
    .values({
      id: ulid(),
      sessionId: input.sessionId,
      userId: input.userId,
      type: input.type,
      amount: input.amount,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      ts: Date.now()
    })
    .run()
}

export async function buildReport(db: Db, sessionId: string): Promise<CashReport> {
  const session = await db
    .select({ s: cashSessions, userName: users.fullName })
    .from(cashSessions)
    .innerJoin(users, eq(cashSessions.userId, users.id))
    .where(eq(cashSessions.id, sessionId))
    .get()
  if (!session) throw new CashError('NOT_FOUND', 'sesión no existe')

  // Sales totals for this session (completed only).
  const saleAgg = await db
    .select({
      count: sql<number>`COUNT(*)`,
      gross: sql<number>`COALESCE(SUM(${sales.total}), 0)`,
      tax: sql<number>`COALESCE(SUM(${sales.taxTotal}), 0)`,
      igtf: sql<number>`COALESCE(SUM(${sales.igtfTotal}), 0)`
    })
    .from(sales)
    .where(and(eq(sales.cashSessionId, sessionId), eq(sales.status, 'completed')))
    .get()

  // Payment breakdown by method.
  const payRows = await db
    .select({
      method: payments.method,
      amountUsd: sql<number>`COALESCE(SUM(${payments.amountUsd}), 0)`,
      igtf: sql<number>`COALESCE(SUM(${payments.igtf}), 0)`,
      count: sql<number>`COUNT(*)`
    })
    .from(payments)
    .innerJoin(sales, eq(payments.saleId, sales.id))
    .where(and(eq(sales.cashSessionId, sessionId), eq(sales.status, 'completed')))
    .groupBy(payments.method)
    .all()

  const byMethod: PaymentMethodTotals = {}
  for (const r of payRows) {
    byMethod[r.method] = { amountUsd: r.amountUsd, igtf: r.igtf, count: r.count }
  }

  // Manual movements.
  const movRows = await db
    .select({
      type: cashMovements.type,
      total: sql<number>`COALESCE(SUM(${cashMovements.amount}), 0)`
    })
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId))
    .groupBy(cashMovements.type)
    .all()
  let movementsIn = 0
  let movementsOut = 0
  for (const m of movRows) {
    if (m.type === 'deposit') movementsIn += m.total
    else if (m.type === 'withdrawal' || m.type === 'drop') movementsOut += m.total
  }

  const cashUsd = byMethod['cash_usd']?.amountUsd ?? 0
  const expectedCashUsd = session.s.openingAmount + cashUsd + movementsIn - movementsOut

  return {
    sessionId: session.s.id,
    status: session.s.status,
    userId: session.s.userId,
    userName: session.userName,
    openedAt: session.s.openedAt,
    closedAt: session.s.closedAt,
    openingAmount: session.s.openingAmount,
    salesCount: saleAgg?.count ?? 0,
    salesGross: saleAgg?.gross ?? 0,
    taxTotal: saleAgg?.tax ?? 0,
    igtfTotal: saleAgg?.igtf ?? 0,
    byMethod,
    movementsIn,
    movementsOut,
    expectedCashUsd,
    closingAmount: session.s.closingAmount,
    overShort: session.s.overShortAmount
  }
}

export async function listClosedReports(
  db: Db,
  input: {
    search?: string | undefined
    from?: number | undefined
    to?: number | undefined
    limit: number
    offset: number
  }
): Promise<{ items: CashReport[]; total: number }> {
  const conditions: SQL[] = [inArray(cashSessions.status, ['closed', 'reconciled'])]
  if (input.search?.trim()) conditions.push(like(users.fullName, `%${input.search.trim()}%`))
  if (input.from !== undefined) conditions.push(gte(cashSessions.closedAt, input.from))
  if (input.to !== undefined) conditions.push(lte(cashSessions.closedAt, input.to))
  const where = and(...conditions)

  const rows = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .innerJoin(users, eq(cashSessions.userId, users.id))
    .where(where)
    .orderBy(desc(cashSessions.closedAt))
    .limit(input.limit)
    .offset(input.offset)
    .all()
  const countRow = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(cashSessions)
    .innerJoin(users, eq(cashSessions.userId, users.id))
    .where(where)
    .get()

  const items: CashReport[] = []
  for (const row of rows) items.push(await buildReport(db, row.id))
  return { items, total: countRow?.count ?? 0 }
}

export async function closeSession(
  db: Db,
  sessionId: string,
  declaredClosing: number
): Promise<CashReport> {
  const session = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).get()
  if (!session) throw new CashError('NOT_FOUND', 'sesión no existe')
  if (session.status !== 'open') throw new CashError('SESSION_CLOSED', 'la caja ya está cerrada')

  const report = await buildReport(db, sessionId)
  const overShort = declaredClosing - report.expectedCashUsd
  const now = Date.now()
  await db
    .update(cashSessions)
    .set({
      status: 'closed',
      closedAt: now,
      closingAmount: declaredClosing,
      expectedAmount: report.expectedCashUsd,
      overShortAmount: overShort
    })
    .where(eq(cashSessions.id, sessionId))
    .run()

  return buildReport(db, sessionId)
}
