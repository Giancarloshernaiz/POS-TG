import type { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { cashSessions, roles, users } from '@main/infrastructure/db/schema'
import { requireSession, requirePermission } from '@main/auth/guard'
import {
  openSession,
  closeSession,
  addMovement,
  buildReport,
  listClosedReports,
  getActiveSession
} from '@main/domain/cash/cash.service'
import { audit } from '@main/audit/logger'
import { PERMISSIONS, type Permission } from '@shared/auth/permissions'
import { verifyPassword } from '@main/auth/password'
import { cashContract } from '@shared/ipc/contracts/cash'
import type { CashReportDTO, CashSessionRowDTO } from '@shared/ipc/contracts/cash'

type Input<K extends keyof typeof cashContract> = z.infer<(typeof cashContract)[K]['input']>

class CashAuthorizationError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

const authorizationAttempts = new Map<string, { count: number; firstAt: number }>()
const AUTHORIZATION_WINDOW_MS = 60_000
const MAX_AUTHORIZATION_ATTEMPTS = 5

function registerAuthorizationAttempt(username: string): void {
  const key = username.trim().toLowerCase()
  const now = Date.now()
  const current = authorizationAttempts.get(key)
  if (!current || now - current.firstAt > AUTHORIZATION_WINDOW_MS) {
    authorizationAttempts.set(key, { count: 1, firstAt: now })
    return
  }
  current.count++
  if (current.count > MAX_AUTHORIZATION_ATTEMPTS) {
    throw new CashAuthorizationError('RATE_LIMITED', 'demasiados intentos de autorización')
  }
}

function toSessionRow(row: typeof cashSessions.$inferSelect): CashSessionRowDTO {
  return {
    id: row.id,
    userId: row.userId,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openingAmount: row.openingAmount,
    openingVes: row.openingVes,
    closingAmount: row.closingAmount,
    closingVes: row.closingVes,
    expectedAmount: row.expectedAmount,
    expectedVes: row.expectedVes,
    overShortAmount: row.overShortAmount,
    overShortVes: row.overShortVes,
    status: row.status,
    notes: row.notes
  }
}

export const cashHandlers = {
  async getActiveSession(input: Input<'getActiveSession'>): Promise<CashSessionRowDTO | null> {
    const session = requireSession(input.sessionId)
    const db = getDb()
    const active = await getActiveSession(db, session.userId)
    return active ? toSessionRow(active) : null
  },

  async open(input: Input<'open'>): Promise<CashSessionRowDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.CASH_OPEN)
    const db = getDb()
    const row = await openSession(
      db,
      session.userId,
      input.openingAmount,
      input.openingVes,
      input.notes
    )
    await audit({
      userId: session.userId,
      action: 'cash.open',
      targetType: 'cash_session',
      targetId: row.id,
      after: { openingAmount: input.openingAmount, openingVes: input.openingVes }
    })
    return toSessionRow(row)
  },

  async addMovement(input: Input<'addMovement'>): Promise<{ ok: true }> {
    const session = requireSession(input.sessionId)
    const needed =
      input.type === 'withdrawal' || input.type === 'drop'
        ? PERMISSIONS.CASH_WITHDRAW
        : PERMISSIONS.CASH_DEPOSIT
    requirePermission(input.sessionId, needed)
    const db = getDb()
    await addMovement(db, {
      sessionId: input.cashSessionId,
      userId: session.userId,
      type: input.type,
      amount: input.amount,
      amountOriginal: input.amountOriginal,
      currency: input.currency,
      reference: input.reference,
      notes: input.notes
    })
    await audit({
      userId: session.userId,
      action: `cash.${input.type}`,
      targetType: 'cash_session',
      targetId: input.cashSessionId,
      after: {
        amount: input.amount,
        amountOriginal: input.amountOriginal,
        currency: input.currency,
        reference: input.reference
      }
    })
    return { ok: true }
  },

  async report(input: Input<'report'>): Promise<CashReportDTO> {
    requireSession(input.sessionId)
    const db = getDb()
    return buildReport(db, input.cashSessionId)
  },

  async history(input: Input<'history'>): Promise<{ items: CashReportDTO[]; total: number }> {
    requirePermission(input.sessionId, PERMISSIONS.REPORTS_Z)
    const db = getDb()
    return listClosedReports(db, input)
  },

  async close(input: Input<'close'>): Promise<CashReportDTO> {
    const session = requireSession(input.sessionId)
    const db = getDb()
    const cashSession = await db
      .select()
      .from(cashSessions)
      .where(eq(cashSessions.id, input.cashSessionId))
      .get()
    if (!cashSession) throw new CashAuthorizationError('NOT_FOUND', 'sesión de caja no existe')
    if (cashSession.userId !== session.userId) {
      throw new CashAuthorizationError('FORBIDDEN', 'solo puedes cerrar tu propia caja')
    }

    const canAuthorizeSelf =
      (session.roleName === 'admin' || session.roleName === 'manager') &&
      session.permissions.includes(PERMISSIONS.CASH_CLOSE)
    let authorizedBy = session

    if (!canAuthorizeSelf) {
      const credentials = input.authorization
      if (!credentials) {
        throw new CashAuthorizationError(
          'APPROVAL_REQUIRED',
          'el cierre requiere autorización de gerente o administrador'
        )
      }
      registerAuthorizationAttempt(credentials.username)
      const approver = await db
        .select({ user: users, role: roles })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.username, credentials.username))
        .get()
      if (!approver || !(await verifyPassword(credentials.password, approver.user.passwordHash))) {
        throw new CashAuthorizationError(
          'INVALID_APPROVER',
          'credenciales de autorizante inválidas'
        )
      }
      if (!approver.user.active) {
        throw new CashAuthorizationError(
          'APPROVER_INACTIVE',
          'el usuario autorizante está inactivo'
        )
      }
      const approverPermissions = approver.role.permissions as Permission[]
      if (
        !['admin', 'manager'].includes(approver.role.name) ||
        !approverPermissions.includes(PERMISSIONS.CASH_CLOSE) ||
        approver.user.mustChangePassword
      ) {
        throw new CashAuthorizationError(
          'INVALID_APPROVER',
          'el usuario no puede autorizar cierres de caja'
        )
      }
      authorizationAttempts.delete(credentials.username.trim().toLowerCase())
      authorizedBy = {
        ...session,
        userId: approver.user.id,
        username: approver.user.username,
        fullName: approver.user.fullName,
        roleId: approver.role.id,
        roleName: approver.role.name,
        permissions: approverPermissions
      }
    }

    const report = await closeSession(
      db,
      input.cashSessionId,
      input.declaredClosing,
      input.declaredClosingVes
    )
    await audit({
      userId: session.userId,
      action: 'cash.close',
      targetType: 'cash_session',
      targetId: input.cashSessionId,
      after: {
        declaredClosing: input.declaredClosing,
        declaredClosingVes: input.declaredClosingVes,
        expected: report.expectedCashUsd,
        expectedVes: report.expectedCashVes,
        overShort: report.overShort,
        overShortVes: report.overShortVes,
        authorizedByUserId: authorizedBy.userId,
        authorizedByName: authorizedBy.fullName,
        authorizedByRole: authorizedBy.roleName
      }
    })
    return report
  }
}
