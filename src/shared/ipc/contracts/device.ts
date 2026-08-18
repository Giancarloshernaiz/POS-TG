import { z } from 'zod'

// Identidad de esta caja (nodo POS) y su vinculación con una Tienda de Galas Cloud.
const deviceIdentity = z.object({
  nodeId: z.string(), // ULID, generado una vez en el primer arranque
  nodeLabel: z.string(), // etiqueta humana, ej. "Caja 1"
  storeId: z.number().nullable(), // Galas Cloud Tienda.id
  storeName: z.string().nullable(),
  sedeId: z.number().nullable(), // Galas Cloud Sede.id (forward-compat)
  agroBaseUrl: z.string().nullable(), // base del máster, ej. http://192.168.1.10:3001
  provisionedAt: z.number().nullable() // epoch ms cuando se vinculó
})

// Una tienda ofrecida por Galas Cloud para elegir en el wizard.
const storeOption = z.object({
  id: z.number(),
  nombre: z.string(),
  ubicacion: z.string().nullable(),
  sedeId: z.number(),
  sedeNombre: z.string().nullable()
})

export const deviceContract = {
  getIdentity: {
    kind: 'request',
    channel: 'device.getIdentity',
    input: z.object({}).optional(),
    output: deviceIdentity,
    errors: [] as const
  },
  listStores: {
    kind: 'request',
    channel: 'device.listStores',
    input: z.object({ agroBaseUrl: z.string().min(1) }),
    output: z.object({ stores: z.array(storeOption) }),
    errors: ['AGRO_UNREACHABLE'] as const
  },
  provision: {
    kind: 'request',
    channel: 'device.provision',
    input: z.object({
      sessionId: z.string(),
      agroBaseUrl: z.string().min(1),
      storeId: z.number().int().positive(),
      storeName: z.string(),
      sedeId: z.number().int().nonnegative(),
      nodeLabel: z.string().min(1).max(40)
    }),
    output: deviceIdentity,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  setLabel: {
    kind: 'request',
    channel: 'device.setLabel',
    input: z.object({ sessionId: z.string(), nodeLabel: z.string().min(1).max(40) }),
    output: deviceIdentity,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  }
} as const

export type DeviceIdentityDTO = z.infer<typeof deviceIdentity>
export type StoreOptionDTO = z.infer<typeof storeOption>
