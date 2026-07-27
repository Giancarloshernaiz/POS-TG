import { z } from 'zod'

const knownPeer = z.object({
  nodeId: z.string(),
  nodeLabel: z.string().nullable(),
  status: z.enum(['online', 'offline']),
  lastConnectedAt: z.number().nullable()
})

const p2pStatus = z.object({
  started: z.boolean(),
  nodeId: z.string().nullable(),
  port: z.number().nullable(),
  connectedPeers: z.array(z.object({ nodeId: z.string(), nodeLabel: z.string() })),
  knownPeers: z.array(knownPeer)
})

const serialConflict = z.object({
  id: z.string(),
  imei: z.string(),
  productName: z.string().nullable(),
  localSaleId: z.string().nullable(),
  localSaleNumber: z.string().nullable(),
  winningNodeId: z.string(),
  detectedAt: z.number(),
  resolved: z.boolean(),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  resolutionNotes: z.string().nullable()
})

export const p2pContract = {
  getStatus: {
    kind: 'request',
    channel: 'p2p.getStatus',
    input: z.object({}).optional(),
    output: p2pStatus,
    errors: [] as const
  },
  peersChanged: {
    kind: 'subscription',
    channel: 'p2p.peersChanged',
    output: p2pStatus
  },
  listSerialConflicts: {
    kind: 'request',
    channel: 'p2p.listSerialConflicts',
    input: z.object({ includeResolved: z.boolean().default(false) }).optional(),
    output: z.array(serialConflict),
    errors: [] as const
  },
  resolveSerialConflict: {
    kind: 'request',
    channel: 'p2p.resolveSerialConflict',
    input: z.object({
      sessionId: z.string(),
      conflictId: z.string(),
      notes: z.string().max(500).nullable().optional()
    }),
    output: serialConflict,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND'] as const
  }
} as const

export type P2pStatusDTO = z.infer<typeof p2pStatus>
export type SerialConflictDTO = z.infer<typeof serialConflict>
