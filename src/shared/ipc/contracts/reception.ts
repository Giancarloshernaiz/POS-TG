import { z } from 'zod'

// Recepción en la tienda de los despachos que envía el Centro de Acopio.
// El despacho y las existencias son del máster (Galas Cloud); la caja escanea.

const dispatchLine = z.object({
  lineaId: z.number(),
  productoAgroId: z.number(),
  nombre: z.string(),
  codigo: z.string(),
  codigoBarras: z.string().nullable(),
  unidadMedida: z.string().nullable(),
  cantidad: z.number(),
  cantidadRecibida: z.number(),
  estado: z.enum(['POR_VALIDAR', 'RECIBIDO', 'NO_RECIBIDO', 'RECIBIDO_PARCIALMENTE']),
  /** null si el catálogo local todavía no bajó ese producto. */
  productIdLocal: z.string().nullable()
})

const dispatch = z.object({
  agroId: z.number(),
  referencia: z.string(),
  fecha: z.number().nullable(),
  estado: z.string(),
  tiendaId: z.number(),
  lineas: z.array(dispatchLine),
  totalDespachado: z.number(),
  totalRecibido: z.number(),
  pendiente: z.number()
})

const scanResult = z.object({
  productoAgroId: z.number(),
  nombre: z.string(),
  recibido: z.number(),
  despachado: z.number(),
  pendiente: z.number(),
  estadoLinea: z.string(),
  estadoDespacho: z.string(),
  stockLocal: z.number().nullable()
})

export const receptionContract = {
  listDispatches: {
    kind: 'request',
    channel: 'reception.listDispatches',
    input: z.object({}).optional(),
    output: z.array(dispatch),
    errors: ['NOT_PROVISIONED', 'AGRO_UNREACHABLE'] as const
  },
  getDispatch: {
    kind: 'request',
    channel: 'reception.getDispatch',
    input: z.object({ agroDispatchId: z.number().int().positive() }),
    output: dispatch,
    errors: ['NOT_PROVISIONED', 'AGRO_UNREACHABLE'] as const
  },
  scan: {
    kind: 'request',
    channel: 'reception.scan',
    input: z.object({
      sessionId: z.string(),
      agroDispatchId: z.number().int().positive(),
      codigo: z.string().trim().min(1),
      cantidad: z.number().int().positive().default(1)
    }),
    output: scanResult,
    errors: [
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'NOT_PROVISIONED',
      'AGRO_UNREACHABLE',
      'UNKNOWN_PRODUCT',
      'OVER_RECEIPT'
    ] as const
  }
} as const

export type DispatchDTO = z.infer<typeof dispatch>
export type DispatchLineDTO = z.infer<typeof dispatchLine>
export type ScanReceptionDTO = z.infer<typeof scanResult>
