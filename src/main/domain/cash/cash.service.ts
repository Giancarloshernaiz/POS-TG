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

export type PaymentMethodTotals = Record<
  string,
  {
    amountUsd: number
    amountOriginal: number | null
    currency: 'USD' | 'VES'
    igtf: number
    count: number
  }
>

export type CashReport = {
  sessionId: string
  status: string
  userId: string
  userName: string
  openedAt: number
  closedAt: number | null
  openingAmount: number
  openingVes: number
  salesCount: number
  salesGross: number // sum of sale totals
  refundCount: number
  refundTotal: number
  netSales: number
  taxTotal: number
  igtfTotal: number
  byMethod: PaymentMethodTotals
  movementsIn: number // deposits
  movementsInVes: number
  movementsOut: number // withdrawals
  movementsOutVes: number
  expectedCashUsd: number // opening + cash_usd payments + deposits - withdrawals
  expectedCashVes: number // opening Bs + cash_ves payments + deposits - withdrawals
  closingAmount: number | null
  closingVes: number | null
  overShort: number | null
  overShortVes: number | null
}

export function calculateExpectedCash(input: {
  openingUsd: number
  openingVes: number
  cashSalesUsd: number
  cashSalesVes: number
  movementsInUsd: number
  movementsInVes: number
  movementsOutUsd: number
  movementsOutVes: number
}): { usd: number; ves: number } {
  return {
    usd:
      input.openingUsd + input.cashSalesUsd + input.movementsInUsd - input.movementsOutUsd,
    ves:
      input.openingVes + input.cashSalesVes + input.movementsInVes - input.movementsOutVes
  }
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
  openingVes: number,
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
      openingVes,
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
    amountOriginal: number
    currency: 'USD' | 'VES'
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
      amountOriginal: input.amountOriginal,
      currency: input.currency,
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

  // Las devoluciones pertenecen al cierre en el que fueron aprobadas, aunque
  // la venta original sea de una caja anterior. Son crédito al cliente, por lo
  // que informan venta neta pero no alteran el efectivo físico esperado.
  const reportEnd = session.s.closedAt ?? Date.now()
  const refundAgg = await db
    .select({
      count: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(${sales.returnAmount}), 0)`
    })
    .from(sales)
    .where(
      and(
        eq(sales.returnStatus, 'approved'),
        gte(sales.returnedAt, session.s.openedAt),
        lte(sales.returnedAt, reportEnd)
      )
    )
    .get()

  // Payment breakdown by method.
  const payRows = await db
    .select({
      method: payments.method,
      currency: payments.currency,
      amountUsd: sql<number>`COALESCE(SUM(${payments.amountUsd}), 0)`,
      amountOriginal: sql<number>`COALESCE(SUM(
        CASE
          WHEN ${payments.currency} = 'VES'
          THEN COALESCE(
            ${payments.amountOriginal},
            (${payments.amountUsd} / 100.0) * ${sales.rateUsed},
            0
          )
          ELSE 0
        END
      ), 0)`,
      igtf: sql<number>`COALESCE(SUM(${payments.igtf}), 0)`,
      count: sql<number>`COUNT(*)`
    })
    .from(payments)
    .innerJoin(sales, eq(payments.saleId, sales.id))
    .where(and(eq(sales.cashSessionId, sessionId), eq(sales.status, 'completed')))
    .groupBy(payments.method, payments.currency)
    .all()

  const byMethod: PaymentMethodTotals = {}
  for (const r of payRows) {
    byMethod[r.method] = {
      amountUsd: r.amountUsd,
      amountOriginal: r.currency === 'VES' ? r.amountOriginal : null,
      currency: r.currency,
      igtf: r.igtf,
      count: r.count
    }
  }

  // Manual movements.
  const movRows = await db
    .select({
      type: cashMovements.type,
      currency: cashMovements.currency,
      total: sql<number>`COALESCE(SUM(${cashMovements.amount}), 0)`,
      totalOriginal: sql<number>`COALESCE(SUM(${cashMovements.amountOriginal}), 0)`
    })
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId))
    .groupBy(cashMovements.type, cashMovements.currency)
    .all()
  let movementsIn = 0
  let movementsInVes = 0
  let movementsOut = 0
  let movementsOutVes = 0
  for (const m of movRows) {
    const incoming = m.type === 'deposit'
    const outgoing = m.type === 'withdrawal' || m.type === 'drop'
    if (m.currency === 'VES') {
      if (incoming) movementsInVes += m.totalOriginal
      else if (outgoing) movementsOutVes += m.totalOriginal
    } else {
      if (incoming) movementsIn += m.total
      else if (outgoing) movementsOut += m.total
    }
  }

  const cashUsd = byMethod['cash_usd']?.amountUsd ?? 0
  const cashVes = byMethod['cash_ves']?.amountOriginal ?? 0
  const expected = calculateExpectedCash({
    openingUsd: session.s.openingAmount,
    openingVes: session.s.openingVes,
    cashSalesUsd: cashUsd,
    cashSalesVes: cashVes,
    movementsInUsd: movementsIn,
    movementsInVes,
    movementsOutUsd: movementsOut,
    movementsOutVes
  })
  const expectedCashUsd = expected.usd
  const expectedCashVes = expected.ves
  const refundTotal = refundAgg?.total ?? 0

  return {
    sessionId: session.s.id,
    status: session.s.status,
    userId: session.s.userId,
    userName: session.userName,
    openedAt: session.s.openedAt,
    closedAt: session.s.closedAt,
    openingAmount: session.s.openingAmount,
    openingVes: session.s.openingVes,
    salesCount: saleAgg?.count ?? 0,
    salesGross: saleAgg?.gross ?? 0,
    refundCount: refundAgg?.count ?? 0,
    refundTotal,
    netSales: (saleAgg?.gross ?? 0) - refundTotal,
    taxTotal: saleAgg?.tax ?? 0,
    igtfTotal: saleAgg?.igtf ?? 0,
    byMethod,
    movementsIn,
    movementsInVes,
    movementsOut,
    movementsOutVes,
    expectedCashUsd,
    expectedCashVes,
    closingAmount: session.s.closingAmount,
    closingVes: session.s.closingVes,
    overShort: session.s.overShortAmount,
    overShortVes: session.s.overShortVes
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
  declaredClosing: number,
  declaredClosingVes: number
): Promise<CashReport> {
  const session = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).get()
  if (!session) throw new CashError('NOT_FOUND', 'sesión no existe')
  if (session.status !== 'open') throw new CashError('SESSION_CLOSED', 'la caja ya está cerrada')

  const report = await buildReport(db, sessionId)
  const overShort = declaredClosing - report.expectedCashUsd
  const overShortVes = declaredClosingVes - report.expectedCashVes
  const now = Date.now()
  await db
    .update(cashSessions)
    .set({
      status: 'closed',
      closedAt: now,
      closingAmount: declaredClosing,
      closingVes: declaredClosingVes,
      expectedAmount: report.expectedCashUsd,
      expectedVes: report.expectedCashVes,
      overShortAmount: overShort,
      overShortVes
    })
    .where(eq(cashSessions.id, sessionId))
    .run()

  return buildReport(db, sessionId)
}
