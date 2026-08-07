import { z } from 'zod'

const pullSummary = z.object({
  categories: z.number(),
  products: z.number(),
  stock: z.number(),
  customers: z.number(),
  sellers: z.number(),
  deactivated: z.number(),
  rateUpdated: z.boolean(),
  at: z.number()
})

const pushStatus = z.object({
  pending: z.number(),
  errors: z.array(
    z.object({
      saleId: z.string(),
      saleNumber: z.string(),
      lastError: z.string().nullable()
    })
  )
})

const uplinkLeaderStatus = z.object({
  isLeader: z.boolean(),
  leaderNodeId: z.string().nullable(),
  leaderNodeLabel: z.string().nullable()
})

// Productos locales sin `agroId`: quedaron de cuando la caja podía crear
// catálogo. Bloquean el push de toda venta que los incluya.
const orphanProduct = z.object({
  id: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  name: z.string(),
  ventasBloqueadas: z.number()
})

const catalogHealth = z.object({
  productosSinMapeo: z.number(),
  ventasBloqueadas: z.number(),
  orphans: z.array(orphanProduct)
})

export const syncContract = {
  pullFromAgro: {
    kind: 'request',
    channel: 'sync.pullFromAgro',
    input: z.object({ sessionId: z.string() }),
    output: pullSummary,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_PROVISIONED', 'AGRO_UNREACHABLE'] as const
  },
  getStatus: {
    kind: 'request',
    channel: 'sync.getStatus',
    input: z.object({}).optional(),
    output: z.object({
      lastPull: pullSummary.nullable(),
      push: pushStatus,
      uplinkLeader: uplinkLeaderStatus
    }),
    errors: [] as const
  },
  retryPush: {
    kind: 'request',
    channel: 'sync.retryPush',
    input: z.object({ sessionId: z.string() }),
    output: z.object({ retried: z.number() }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  getCatalogHealth: {
    kind: 'request',
    channel: 'sync.getCatalogHealth',
    input: z.object({}).optional(),
    output: catalogHealth,
    errors: [] as const
  },
  reconcileCatalog: {
    kind: 'request',
    channel: 'sync.reconcileCatalog',
    input: z.object({ sessionId: z.string() }),
    output: z.object({
      revisados: z.number(),
      mapeados: z.array(
        z.object({ id: z.string(), sku: z.string(), name: z.string(), agroId: z.number() })
      ),
      fusionados: z.array(
        z.object({
          id: z.string(),
          sku: z.string(),
          name: z.string(),
          haciaSku: z.string(),
          agroId: z.number()
        })
      ),
      sinCorrespondencia: z.array(orphanProduct),
      ventasReintentadas: z.number()
    }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_PROVISIONED', 'AGRO_UNREACHABLE'] as const
  },
  updated: {
    kind: 'subscription',
    channel: 'sync.updated',
    output: pullSummary
  }
} as const

export type PullSummaryDTO = z.infer<typeof pullSummary>
export type PushStatusDTO = z.infer<typeof pushStatus>
export type UplinkLeaderStatusDTO = z.infer<typeof uplinkLeaderStatus>
export type CatalogHealthDTO = z.infer<typeof catalogHealth>
export type OrphanProductDTO = z.infer<typeof orphanProduct>
