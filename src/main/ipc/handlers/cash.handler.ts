import type { z } from 'zod'
import { getDb } from '@main/infrastructure/db/client'
import { cashSessions } from '@main/infrastructure/db/schema'
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
import { PERMISSIONS } from '@shared/auth/permissions'
import { cashContract } from '@shared/ipc/contracts/cash'
import type { CashReportDTO, CashSessionRowDTO } from '@shared/ipc/contracts/cash'

type Input<K extends keyof typeof cashContract> = z.infer<(typeof cashContract)[K]['input']>

function toSessionRow(row: typeof cashSessions.$inferSelect): CashSessionRowDTO {
  return {
    id: row.id,
    userId: row.userId,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openingAmount: row.openingAmount,
    closingAmount: row.closingAmount,
    expectedAmount: row.expectedAmount,
    overShortAmount: row.overShortAmount,
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
    const row = await openSession(db, session.userId, input.openingAmount, input.notes)
    await audit({
      userId: session.userId,
      action: 'cash.open',
      targetType: 'cash_session',
      targetId: row.id,
      after: { openingAmount: input.openingAmount }
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
      reference: input.reference,
      notes: input.notes
    })
    await audit({
      userId: session.userId,
      action: `cash.${input.type}`,
      targetType: 'cash_session',
      targetId: input.cashSessionId,
      after: { amount: input.amount, reference: input.reference }
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
    const session = requirePermission(input.sessionId, PERMISSIONS.CASH_CLOSE)
    const db = getDb()
    const report = await closeSession(db, input.cashSessionId, input.declaredClosing)
    await audit({
      userId: session.userId,
      action: 'cash.close',
      targetType: 'cash_session',
      targetId: input.cashSessionId,
      after: {
        declaredClosing: input.declaredClosing,
        expected: report.expectedCashUsd,
        overShort: report.overShort
      }
    })
    return report
  }
}
