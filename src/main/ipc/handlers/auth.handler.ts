import { eq } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { users, roles } from '@main/infrastructure/db/schema'
import { verifyPassword, hashPassword } from '@main/auth/password'
import {
  createSession,
  destroySession,
  getSession,
  destroyAllUserSessions
} from '@main/auth/session'
import { audit } from '@main/audit/logger'
import type { AuthSessionDTO } from '@shared/ipc/contracts/auth'
import type { Permission } from '@shared/auth/permissions'

class AuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

const loginAttempts = new Map<string, { count: number; firstAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60 * 1000

function checkRateLimit(username: string): void {
  const now = Date.now()
  const entry = loginAttempts.get(username)
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    loginAttempts.set(username, { count: 1, firstAt: now })
    return
  }
  entry.count++
  if (entry.count > MAX_ATTEMPTS) throw new AuthError('RATE_LIMITED', 'demasiados intentos')
}

function clearRateLimit(username: string): void {
  loginAttempts.delete(username)
}

function toDto(s: ReturnType<typeof createSession>, mustChangePassword: boolean): AuthSessionDTO {
  return {
    id: s.id,
    userId: s.userId,
    username: s.username,
    fullName: s.fullName,
    roleId: s.roleId,
    roleName: s.roleName,
    permissions: s.permissions,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    mustChangePassword
  }
}

export const authHandlers = {
  async login(input: { username: string; password: string }): Promise<AuthSessionDTO> {
    checkRateLimit(input.username)
    const db = getDb()
    const row = await db
      .select({
        user: users,
        role: roles
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.username, input.username))
      .get()

    if (!row) throw new AuthError('INVALID_CREDENTIALS', 'usuario o contraseña inválido')
    if (!row.user.active) throw new AuthError('USER_INACTIVE', 'usuario inactivo')

    const okPw = await verifyPassword(input.password, row.user.passwordHash)
    if (!okPw) throw new AuthError('INVALID_CREDENTIALS', 'usuario o contraseña inválido')

    clearRateLimit(input.username)

    await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, row.user.id)).run()

    const session = createSession({
      userId: row.user.id,
      username: row.user.username,
      fullName: row.user.fullName,
      roleId: row.role.id,
      roleName: row.role.name,
      permissions: row.role.permissions as Permission[]
    })

    await audit({
      userId: row.user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: row.user.id
    })

    return toDto(session, row.user.mustChangePassword)
  },

  async logout(input: { sessionId: string }): Promise<{ ok: true }> {
    const s = getSession(input.sessionId)
    if (s) {
      await audit({
        userId: s.userId,
        action: 'auth.logout',
        targetType: 'user',
        targetId: s.userId
      })
    }
    destroySession(input.sessionId)
    return { ok: true }
  },

  async me(input: { sessionId: string }): Promise<AuthSessionDTO> {
    const s = getSession(input.sessionId)
    if (!s) throw new AuthError('NOT_AUTHENTICATED', 'sesión expirada')

    const db = getDb()
    const u = await db
      .select({ mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.id, s.userId))
      .get()

    return toDto(s, u?.mustChangePassword ?? false)
  },

  async changePassword(input: {
    sessionId: string
    currentPassword: string
    newPassword: string
  }): Promise<{ ok: true }> {
    const s = getSession(input.sessionId)
    if (!s) throw new AuthError('NOT_AUTHENTICATED', 'sesión expirada')
    if (input.newPassword.length < 8) throw new AuthError('WEAK_PASSWORD', 'min 8 chars')

    const db = getDb()
    const u = await db.select().from(users).where(eq(users.id, s.userId)).get()
    if (!u) throw new AuthError('NOT_AUTHENTICATED', 'usuario no existe')

    const okPw = await verifyPassword(input.currentPassword, u.passwordHash)
    if (!okPw) throw new AuthError('INVALID_CREDENTIALS', 'contraseña actual inválida')

    const newHash = await hashPassword(input.newPassword)
    await db
      .update(users)
      .set({ passwordHash: newHash, mustChangePassword: false, updatedAt: Date.now() })
      .where(eq(users.id, s.userId))
      .run()

    destroyAllUserSessions(s.userId)

    await audit({
      userId: s.userId,
      action: 'auth.password.change',
      targetType: 'user',
      targetId: s.userId
    })
    return { ok: true }
  }
}
