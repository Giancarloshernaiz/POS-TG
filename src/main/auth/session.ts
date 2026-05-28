import { randomBytes } from 'node:crypto'
import { ulid } from 'ulid'
import type { Permission } from '@shared/auth/permissions'

export type AuthSession = {
  id: string
  userId: string
  username: string
  fullName: string
  roleId: string
  roleName: string
  permissions: Permission[]
  createdAt: number
  expiresAt: number
  lastActivityAt: number
}

const SESSION_TTL_MS = 60 * 60 * 1000 // 1h base
const INACTIVITY_MS = 30 * 60 * 1000 // 30min inactividad

const sessions = new Map<string, AuthSession>()

function newSessionId(): string {
  return `sess_${ulid()}_${randomBytes(8).toString('hex')}`
}

export function createSession(
  input: Omit<AuthSession, 'id' | 'createdAt' | 'expiresAt' | 'lastActivityAt'>
): AuthSession {
  const now = Date.now()
  const session: AuthSession = {
    ...input,
    id: newSessionId(),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastActivityAt: now
  }
  sessions.set(session.id, session)
  return session
}

export function getSession(id: string): AuthSession | null {
  const s = sessions.get(id)
  if (!s) return null
  const now = Date.now()
  if (now > s.expiresAt || now - s.lastActivityAt > INACTIVITY_MS) {
    sessions.delete(id)
    return null
  }
  s.lastActivityAt = now
  return s
}

export function destroySession(id: string): void {
  sessions.delete(id)
}

export function destroyAllUserSessions(userId: string): void {
  for (const [id, s] of sessions) {
    if (s.userId === userId) sessions.delete(id)
  }
}

export function hasPermission(session: AuthSession, perm: Permission): boolean {
  return session.permissions.includes(perm)
}
