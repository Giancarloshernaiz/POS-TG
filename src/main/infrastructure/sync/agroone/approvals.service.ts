import { eq } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { sales, saleLines } from '@main/infrastructure/db/schema/sales'
import { products } from '@main/infrastructure/db/schema/catalog'
import { customers } from '@main/infrastructure/db/schema/customers'
import { syncState } from '@main/infrastructure/db/schema/sync'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import { logger } from '@main/logger'
import {
  createAuthorizationRequest,
  fetchAuthorizationRequest,
  fetchApprovers,
  type AgroApprover,
  type AuthorizationRequestDTO,
  type AuthorizationType
} from './agro.client'
import { paidShareForReturnCents } from '@shared/sale-discounts'

// Devolución y reimpresión de factura: la caja SOLICITA, el administrador
// aprueba en Galas Cloud.
//
// Ambas se piden sobre una venta ya sincronizada, porque la solicitud viaja
// referenciando el id de venta del máster (`AuthorizationRequest.ventaId`) y es
// lo que el administrador ve en su bandeja. Una venta que todavía no subió no
// se puede referenciar, así que se bloquea con un mensaje que dice qué hacer.

export class ApprovalError extends Error {
  constructor(
    public code:
      | 'NOT_PROVISIONED'
      | 'NO_APPROVERS'
      | 'SALE_NOT_FOUND'
      | 'SALE_NOT_SYNCED'
      | 'AGRO_UNREACHABLE'
      | 'INVALID_ITEMS'
      | 'RETURN_ALREADY_REQUESTED'
      | 'RETURN_ALREADY_COMPLETED',
    message: string
  ) {
    super(message)
  }
}

async function requireBaseUrl(): Promise<string> {
  const identity = await getIdentity()
  if (!isProvisioned(identity) || !identity.agroBaseUrl) {
    throw new ApprovalError(
      'NOT_PROVISIONED',
      'Esta caja no está vinculada a Galas Cloud. Configúrala en Ajustes.'
    )
  }
  return identity.agroBaseUrl
}

/** Usuarios del máster a los que se le puede dirigir una solicitud. */
export async function listApprovers(): Promise<AgroApprover[]> {
  const baseUrl = await requireBaseUrl()
  try {
    return await fetchApprovers(baseUrl)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new ApprovalError('AGRO_UNREACHABLE', `No se pudo consultar los aprobadores: ${msg}`)
  }
}

/** La venta debe existir y tener su id del máster: sin eso no hay qué referenciar. */
async function requireSyncedSale(saleId: string): Promise<{ agroSaleId: number; number: string }> {
  const db = getDb()
  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get()
  if (!sale) throw new ApprovalError('SALE_NOT_FOUND', 'La venta no existe')

  const st = await db.select().from(syncState).where(eq(syncState.saleId, saleId)).get()
  if (!st?.agroSaleId) {
    throw new ApprovalError(
      'SALE_NOT_SYNCED',
      `La venta ${sale.number} todavía no llegó a Galas Cloud. Sincroniza desde Ajustes y volvé a intentar.`
    )
  }
  return { agroSaleId: st.agroSaleId, number: sale.number }
}

async function crear(
  tipo: AuthorizationType,
  saleId: string,
  cajero: string,
  approverIds: number[],
  extra: Record<string, unknown>
): Promise<AuthorizationRequestDTO> {
  const baseUrl = await requireBaseUrl()
  if (approverIds.length === 0) {
    throw new ApprovalError(
      'NO_APPROVERS',
      'Elegí a quién le pedís la autorización'
    )
  }
  const { agroSaleId, number } = await requireSyncedSale(saleId)
  const identity = await getIdentity()

  try {
    const req = await createAuthorizationRequest(baseUrl, {
      approverIds,
      // La caja no tiene usuario propio en el máster: quien pide se identifica
      // por texto (cajero + caja), que es lo que el aprobador necesita ver.
      requesterLabel: `${cajero} · ${identity.nodeLabel}`,
      ventaId: agroSaleId,
      type: tipo,
      metadata: {
        cajero,
        caja: identity.nodeLabel,
        ventaLocal: number,
        ...extra
      }
    })
    logger.info({ tipo, saleId, requestId: req.id }, 'approvals: solicitud creada')
    return req
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new ApprovalError('AGRO_UNREACHABLE', `No se pudo enviar la solicitud a Galas Cloud: ${msg}`)
  }
}

/** Solicita reimpresión. No tiene efecto en el máster: solo levanta el permiso. */
export async function requestReprint(
  saleId: string,
  cajero: string,
  approverIds: number[]
): Promise<AuthorizationRequestDTO> {
  return crear('REPRINT_INVOICE', saleId, cajero, approverIds, {})
}

/**
 * Solicita devolución. Los ítems se traducen a los ids del máster: Galas Cloud no
 * conoce los ULID locales. Al aprobarse, Galas Cloud repone el stock y emite el
 * crédito; la caja lo verá en su próximo pull.
 */
export async function requestReturn(
  saleId: string,
  cajero: string,
  approverIds: number[],
  items: Array<{ productId: string; qty: number }>
): Promise<AuthorizationRequestDTO> {
  if (items.length === 0) throw new ApprovalError('INVALID_ITEMS', 'No se indicó qué devolver')

  const db = getDb()
  const localSale = await db.select().from(sales).where(eq(sales.id, saleId)).get()
  if (localSale?.returnStatus === 'pending') {
    throw new ApprovalError('RETURN_ALREADY_REQUESTED', 'Esta venta ya tiene una devolución pendiente')
  }
  if (localSale?.returnStatus === 'approved') {
    throw new ApprovalError('RETURN_ALREADY_COMPLETED', 'Esta venta ya fue devuelta')
  }
  const lineas = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId)).all()
  const porProducto = new Map(lineas.map((l) => [l.productId, l]))

  const mapeados: Array<{ product_id: number; quantity: number }> = []
  for (const item of items) {
    const linea = porProducto.get(item.productId)
    if (!linea) throw new ApprovalError('INVALID_ITEMS', 'Un producto no pertenece a esta venta')
    if (item.qty <= 0 || item.qty > linea.qty) {
      throw new ApprovalError(
        'INVALID_ITEMS',
        `Cantidad inválida para ${linea.description}: se vendieron ${linea.qty}`
      )
    }
    const prod = await db.select().from(products).where(eq(products.id, item.productId)).get()
    if (!prod?.agroId) {
      throw new ApprovalError(
        'INVALID_ITEMS',
        `"${linea.description}" no está sincronizado con Galas Cloud y no se puede devolver`
      )
    }
    mapeados.push({ product_id: prod.agroId, quantity: item.qty })
  }

  const sale = localSale
  let clienteAgroId: number | undefined
  if (sale?.customerId) {
    const cust = await db.select().from(customers).where(eq(customers.id, sale.customerId)).get()
    clienteAgroId = cust?.agroId ?? undefined
  }

  try {
    const request = await crear('RETURN_SALE', saleId, cajero, approverIds, {
      items: mapeados,
      ...(clienteAgroId ? { cliente_id: clienteAgroId } : {}),
      // El administrador lo ve en su bandeja antes de aprobar.
      totalDevolucion: (() => {
        const lineTotal = items.reduce((sum, i) => {
          const l = porProducto.get(i.productId)
          return sum + (l ? (l.lineTotal / l.qty) * i.qty : 0)
        }, 0)
        return sale
          ? paidShareForReturnCents(lineTotal, sale.subtotal, sale.total) / 100
          : lineTotal / 100
      })()
    })
    await db
      .update(sales)
      .set({ returnStatus: 'pending', returnRequestId: request.id })
      .where(eq(sales.id, saleId))
      .run()
    return request
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('RETURN_ALREADY_COMPLETED')) {
      await db.update(sales).set({ returnStatus: 'approved' }).where(eq(sales.id, saleId)).run()
      throw new ApprovalError('RETURN_ALREADY_COMPLETED', 'Esta venta ya fue devuelta')
    }
    if (message.includes('RETURN_ALREADY_REQUESTED')) {
      await db.update(sales).set({ returnStatus: 'pending' }).where(eq(sales.id, saleId)).run()
      throw new ApprovalError('RETURN_ALREADY_REQUESTED', 'Esta venta ya tiene una devolución pendiente')
    }
    throw error
  }
}

/** Estado actual de una solicitud, para que la caja sepa si ya se resolvió. */
export async function getApprovalStatus(requestId: number): Promise<AuthorizationRequestDTO> {
  const baseUrl = await requireBaseUrl()
  try {
    const request = await fetchAuthorizationRequest(baseUrl, requestId)
    if (request.type === 'RETURN_SALE' && request.ventaId) {
      const db = getDb()
      const synced = await db
        .select({ saleId: syncState.saleId })
        .from(syncState)
        .where(eq(syncState.agroSaleId, request.ventaId))
        .get()
      if (synced) {
        await db
          .update(sales)
          .set({
            returnStatus:
              request.status === 'APPROVED'
                ? 'approved'
                : request.status === 'REJECTED'
                  ? 'rejected'
                  : 'pending',
            returnRequestId: request.id
          })
          .where(eq(sales.id, synced.saleId))
          .run()
      }
    }
    return request
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new ApprovalError('AGRO_UNREACHABLE', `No se pudo consultar la solicitud: ${msg}`)
  }
}
