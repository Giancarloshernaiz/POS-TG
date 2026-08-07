import { requirePermission } from '@main/auth/guard'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import { runPull, getLastPull } from '@main/infrastructure/sync/agroone/pull.service'
import { pushPendingSales, getPushStatus } from '@main/infrastructure/sync/agroone/push.service'
import { getUplinkLeaderInfo } from '@main/infrastructure/sync/agroone/leader.service'
import {
  getCatalogHealth,
  reconcileCatalog,
  type ReconcileResult
} from '@main/infrastructure/sync/agroone/reconcile.service'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type {
  PullSummaryDTO,
  PushStatusDTO,
  UplinkLeaderStatusDTO,
  CatalogHealthDTO
} from '@shared/ipc/contracts/sync'

export const syncHandlers = {
  async pullFromAgro(input: { sessionId: string }): Promise<PullSummaryDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const identity = await getIdentity()
    if (!isProvisioned(identity) || identity.storeId === null || !identity.agroBaseUrl) {
      throw Object.assign(new Error('caja no vinculada con AgroOne'), { code: 'NOT_PROVISIONED' })
    }
    const summary = await runPull(identity.agroBaseUrl, identity.storeId)
    await audit({
      userId: session.userId,
      action: 'sync.pullFromAgro',
      after: {
        products: summary.products,
        stock: summary.stock,
        customers: summary.customers
      }
    })
    return summary
  },

  async getStatus(): Promise<{
    lastPull: PullSummaryDTO | null
    push: PushStatusDTO
    uplinkLeader: UplinkLeaderStatusDTO
  }> {
    return {
      lastPull: await getLastPull(),
      push: await getPushStatus(),
      uplinkLeader: await getUplinkLeaderInfo()
    }
  },

  async retryPush(input: { sessionId: string }): Promise<{ retried: number }> {
    requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const retried = await pushPendingSales()
    return { retried }
  },

  /** Diagnóstico: productos locales sin `agroId` y ventas trabadas por eso. */
  async getCatalogHealth(): Promise<CatalogHealthDTO> {
    return getCatalogHealth()
  },

  /**
   * Mapea contra el máster los productos locales que quedaron sin `agroId`
   * (creados por la caja antes de que AgroOne fuera el único dueño del
   * catálogo) y reintenta las ventas que estaban trabadas por ese motivo.
   */
  async reconcileCatalog(input: { sessionId: string }): Promise<ReconcileResult> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const identity = await getIdentity()
    if (!isProvisioned(identity) || !identity.agroBaseUrl) {
      throw Object.assign(new Error('caja no vinculada con AgroOne'), { code: 'NOT_PROVISIONED' })
    }
    const result = await reconcileCatalog(identity.agroBaseUrl)
    await audit({
      userId: session.userId,
      action: 'sync.reconcileCatalog',
      after: {
        revisados: result.revisados,
        mapeados: result.mapeados.length,
        sinCorrespondencia: result.sinCorrespondencia.length,
        ventasReintentadas: result.ventasReintentadas
      }
    })
    return result
  }
}
