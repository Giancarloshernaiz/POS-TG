import { getSession, hasPermission, type AuthSession } from './session'
import type { Permission } from '@shared/auth/permissions'

export class AuthGuardError extends Error {
  constructor(
    public code: 'NOT_AUTHENTICATED' | 'FORBIDDEN',
    message: string
  ) {
    super(message)
  }
}

export function requireSession(sessionId: string): AuthSession {
  const s = getSession(sessionId)
  if (!s) throw new AuthGuardError('NOT_AUTHENTICATED', 'sesión expirada')
  return s
}

export function requirePermission(sessionId: string, perm: Permission): AuthSession {
  const s = requireSession(sessionId)
  if (!hasPermission(s, perm)) {
    throw new AuthGuardError('FORBIDDEN', `permiso requerido: ${perm}`)
  }
  return s
}
