import { requirePermission } from '@main/auth/guard'
import { getIdentity, provision, setNodeLabel } from '@main/infrastructure/device/identity.service'
import { fetchStores } from '@main/infrastructure/sync/agroone/agro.client'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type { DeviceIdentityDTO, StoreOptionDTO } from '@shared/ipc/contracts/device'

export const deviceHandlers = {
  async getIdentity(): Promise<DeviceIdentityDTO> {
    return getIdentity()
  },

  async listStores(input: { agroBaseUrl: string }): Promise<{ stores: StoreOptionDTO[] }> {
    const stores = await fetchStores(input.agroBaseUrl)
    return { stores }
  },

  async provision(input: {
    sessionId: string
    agroBaseUrl: string
    storeId: number
    storeName: string
    sedeId: number
    nodeLabel: string
  }): Promise<DeviceIdentityDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const identity = await provision(input)
    await audit({
      userId: session.userId,
      action: 'device.provision',
      after: { storeId: identity.storeId, nodeLabel: identity.nodeLabel, nodeId: identity.nodeId }
    })
    return identity
  },

  async setLabel(input: { sessionId: string; nodeLabel: string }): Promise<DeviceIdentityDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const identity = await setNodeLabel(input.nodeLabel)
    await audit({
      userId: session.userId,
      action: 'device.setLabel',
      after: { nodeLabel: identity.nodeLabel }
    })
    return identity
  }
}
