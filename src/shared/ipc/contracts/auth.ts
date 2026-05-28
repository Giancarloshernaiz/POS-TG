import { z } from 'zod'

const sessionShape = z.object({
  id: z.string(),
  userId: z.string(),
  username: z.string(),
  fullName: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  permissions: z.array(z.string()),
  createdAt: z.number(),
  expiresAt: z.number(),
  mustChangePassword: z.boolean()
})

export const authContract = {
  login: {
    kind: 'request',
    channel: 'auth.login',
    input: z.object({
      username: z.string().min(1),
      password: z.string().min(1)
    }),
    output: sessionShape,
    errors: ['INVALID_CREDENTIALS', 'USER_INACTIVE', 'RATE_LIMITED'] as const
  },
  logout: {
    kind: 'request',
    channel: 'auth.logout',
    input: z.object({ sessionId: z.string() }),
    output: z.object({ ok: z.literal(true) }),
    errors: [] as const
  },
  me: {
    kind: 'request',
    channel: 'auth.me',
    input: z.object({ sessionId: z.string() }),
    output: sessionShape,
    errors: ['NOT_AUTHENTICATED'] as const
  },
  changePassword: {
    kind: 'request',
    channel: 'auth.changePassword',
    input: z.object({
      sessionId: z.string(),
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8)
    }),
    output: z.object({ ok: z.literal(true) }),
    errors: ['NOT_AUTHENTICATED', 'INVALID_CREDENTIALS', 'WEAK_PASSWORD'] as const
  }
} as const

export type AuthSessionDTO = z.infer<typeof sessionShape>
