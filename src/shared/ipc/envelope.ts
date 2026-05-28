export type Ok<T> = { ok: true; data: T }
export type Err<E extends string = string> = {
  ok: false
  error: { code: E; message: string; cause?: unknown }
}
export type Result<T, E extends string = string> = Ok<T> | Err<E>

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data }
}

export function err<E extends string>(code: E, message: string, cause?: unknown): Err<E> {
  return { ok: false, error: { code, message, ...(cause !== undefined ? { cause } : {}) } }
}

export const COMMON_ERRORS = {
  BAD_INPUT: 'BAD_INPUT',
  INTERNAL: 'INTERNAL',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND'
} as const

export type CommonError = (typeof COMMON_ERRORS)[keyof typeof COMMON_ERRORS]
