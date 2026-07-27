import { requirePermission } from '@main/auth/guard'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import { runPull, getLastPull } from '@main/infrastructure/sync/agroone/pull.service'
import { pushPendingSales, getPushStatus } from '@main/infrastructure/sync/agroone/push.service'
import { getUplinkLeaderInfo } from '@main/infrastructure/sync/agroone/leader.service'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type {
  PullSummaryDTO,
  PushStatusDTO,
  UplinkLeaderStatusDTO
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
  }
}
