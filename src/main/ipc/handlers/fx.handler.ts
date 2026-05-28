import { requireSession, requirePermission } from '@main/auth/guard'
import { getCurrentRate, refreshRate, setManualRate } from '@main/infrastructure/fx/fx.service'
import { publish } from '@main/ipc/router'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type { FxRateDTO } from '@shared/ipc/contracts/fx'

export const fxHandlers = {
  async getRate(): Promise<FxRateDTO | null> {
    return getCurrentRate()
  },

  async refresh(input: { sessionId: string }): Promise<FxRateDTO> {
    requireSession(input.sessionId)
    const rate = await refreshRate()
    publish('fx.updated', rate)
    return rate
  },

  async setManual(input: { sessionId: string; rate: number }): Promise<FxRateDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const rate = await setManualRate(input.rate)
    publish('fx.updated', rate)
    await audit({
      userId: session.userId,
      action: 'fx.setManual',
      after: { rate: input.rate }
    })
    return rate
  }
}
