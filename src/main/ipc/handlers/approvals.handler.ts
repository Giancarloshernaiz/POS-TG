import { requirePermission } from '@main/auth/guard'
import { getSession } from '@main/auth/session'
import {
  requestReprint,
  requestReturn,
  getApprovalStatus,
  listApprovers,
  ApprovalError
} from '@main/infrastructure/sync/agroone/approvals.service'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type { AuthorizationDTO, ApproverDTO } from '@shared/ipc/contracts/approvals'

function rethrow(err: unknown): never {
  if (err instanceof ApprovalError) {
    throw Object.assign(new Error(err.message), { code: err.code })
  }
  throw err
}

/** Nombre del cajero, para que el administrador sepa quién pidió. */
function cajeroDe(sessionId: string): string {
  return getSession(sessionId)?.fullName ?? 'Cajero'
}

export const approvalsHandlers = {
  async listApprovers(): Promise<ApproverDTO[]> {
    try {
      return await listApprovers()
    } catch (err) {
      rethrow(err)
    }
  },

  async requestReprint(input: {
    sessionId: string
    saleId: string
    approverIds: number[]
  }): Promise<AuthorizationDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SALES_CREATE)
    try {
      const req = await requestReprint(input.saleId, cajeroDe(input.sessionId), input.approverIds)
      await audit({
        userId: session.userId,
        action: 'approvals.requestReprint',
        after: { saleId: input.saleId, requestId: req.id }
      })
      return req
    } catch (err) {
      rethrow(err)
    }
  },

  async requestReturn(input: {
    sessionId: string
    saleId: string
    approverIds: number[]
    items: Array<{ productId: string; qty: number }>
  }): Promise<AuthorizationDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SALES_CREATE)
    try {
      const req = await requestReturn(
        input.saleId,
        cajeroDe(input.sessionId),
        input.approverIds,
        input.items
      )
      await audit({
        userId: session.userId,
        action: 'approvals.requestReturn',
        after: { saleId: input.saleId, requestId: req.id, items: input.items.length }
      })
      return req
    } catch (err) {
      rethrow(err)
    }
  },

  async getStatus(input: { requestId: number }): Promise<AuthorizationDTO> {
    try {
      return await getApprovalStatus(input.requestId)
    } catch (err) {
      rethrow(err)
    }
  },

}
