import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '@main/infrastructure/db/client'
import { serials, serialConflicts } from '@main/infrastructure/db/schema'
import { compareHlc, parseHlc } from '../hlc'
import { logger } from '@main/logger'
import { audit } from '@main/audit/logger'

// Reducer de seriales: unique-claim register con HLC (§8.4, §9.1). Un serial
// vendido en dos cajas offline simultáneamente se detecta aquí; el HLC menor
// gana la reclamación. La caja perdedora NUNCA se auto-anula (hay dinero
// cobrado) — queda en cuarentena para revisión de gerente.

export type SerialSoldPayload = {
  imei: string
  saleNumber: string
  nodeLabel: string
}

export function applySerialSold(
  fromNodeId: string,
  payload: SerialSoldPayload,
  hlc: string,
  ts: number
): void {
  const db = getDb()
  const local = db.select().from(serials).where(eq(serials.imei, payload.imei)).get()
  if (!local) {
    logger.warn(
      { imei: payload.imei },
      'p2p: serial.sold para IMEI desconocido localmente, ignorado'
    )
    return
  }

  const weSoldItOurselves = local.status === 'sold' && local.currentSaleId !== null

  if (weSoldItOurselves) {
    // Ambas cajas reclaman el mismo serial: el HLC menor gana.
    const remoteWins = !local.lwwHlc || compareHlc(parseHlc(hlc), parseHlc(local.lwwHlc)) < 0
    if (!remoteWins) return // nuestra reclamación es más vieja (gana), ignorar remoto

    const conflictId = ulid()
    db.insert(serialConflicts)
      .values({
        id: conflictId,
        serialId: local.id,
        imei: payload.imei,
        localSaleId: local.currentSaleId,
        localSaleNumber: null, // se resuelve en la UI vía join con sales
        winningNodeId: fromNodeId,
        winningHlc: hlc,
        detectedAt: ts
      })
      .run()
    logger.error(
      { imei: payload.imei, localSaleId: local.currentSaleId, winningNodeId: fromNodeId },
      'p2p: CONFLICTO — mismo serial vendido en dos cajas, cuarentena creada'
    )
    void audit({
      action: 'p2p.serial_conflict',
      targetType: 'serial',
      targetId: local.id,
      after: { imei: payload.imei, localSaleId: local.currentSaleId, winningNodeId: fromNodeId }
    })
    return
  }

  // No lo teníamos vendido a una venta nuestra: marcarlo vendido igual, para
  // que esta caja no permita revenderlo (currentSaleId queda null a propósito
  // — la venta real vive en el nodo que la originó; no proyectamos ventas
  // remotas todavía).
  if (local.lwwHlc && compareHlc(parseHlc(hlc), parseHlc(local.lwwHlc)) <= 0) return
  db.update(serials)
    .set({
      status: 'sold',
      notes: `Vendido en ${payload.nodeLabel} — venta ${payload.saleNumber}`,
      lwwHlc: hlc,
      updatedAt: ts
    })
    .where(eq(serials.id, local.id))
    .run()
}

export type SerialReturnedPayload = { imei: string }

/** Anulación de venta en un peer: libera el serial de vuelta a disponible. */
export function applySerialReturned(payload: SerialReturnedPayload, hlc: string, ts: number): void {
  const db = getDb()
  const local = db.select().from(serials).where(eq(serials.imei, payload.imei)).get()
  if (!local) return
  if (local.currentSaleId) return // lo tenemos vendido a una venta NUESTRA — no lo tocamos
  if (local.lwwHlc && compareHlc(parseHlc(hlc), parseHlc(local.lwwHlc)) <= 0) return
  db.update(serials)
    .set({ status: 'available', notes: null, lwwHlc: hlc, updatedAt: ts })
    .where(eq(serials.id, local.id))
    .run()
}
