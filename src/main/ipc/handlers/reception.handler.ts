import { requirePermission } from '@main/auth/guard'
import {
  listDispatches,
  getDispatch,
  scanReception,
  ReceptionError
} from '@main/infrastructure/sync/agroone/reception.service'
import { AgroError } from '@main/infrastructure/sync/agroone/agro.client'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type { DispatchDTO, ScanReceptionDTO } from '@shared/ipc/contracts/reception'

/** Los errores del servicio ya traen `code`; los de red se normalizan acá. */
function rethrow(err: unknown): never {
  if (err instanceof ReceptionError) {
    throw Object.assign(new Error(err.message), { code: err.code })
  }
  if (err instanceof AgroError) {
    throw Object.assign(new Error(err.message), { code: 'AGRO_UNREACHABLE' })
  }
  throw err
}

export const receptionHandlers = {
  async listDispatches(): Promise<DispatchDTO[]> {
    try {
      return (await listDispatches()) as DispatchDTO[]
    } catch (err) {
      rethrow(err)
    }
  },

  async getDispatch(input: { agroDispatchId: number }): Promise<DispatchDTO> {
    try {
      return (await getDispatch(input.agroDispatchId)) as DispatchDTO
    } catch (err) {
      rethrow(err)
    }
  },

  /** Una lectura del escáner sobre un despacho en curso. */
  async scan(input: {
    sessionId: string
    agroDispatchId: number
    codigo: string
    cantidad: number
  }): Promise<ScanReceptionDTO> {
    const session = requirePermission(input.sessionId, PERMISSIONS.INVENTORY_RECEIVE)
    try {
      const result = await scanReception(input.agroDispatchId, input.codigo, input.cantidad)
      // Solo se audita el cierre de cada línea: una fila por unidad escaneada
      // llenaría el log sin aportar nada.
      if (result.pendiente === 0) {
        await audit({
          userId: session.userId,
          action: 'reception.lineComplete',
          after: {
            despachoId: input.agroDispatchId,
            productoAgroId: result.productoAgroId,
            recibido: result.recibido
          }
        })
      }
      return result
    } catch (err) {
      rethrow(err)
    }
  }
}
