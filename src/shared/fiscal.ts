// Venezuelan fiscal concepts.

/** Standard VES decimals. */
export const VES_DECIMALS = 2

/** RIF — Registro de Información Fiscal. Prefix V/E/J/P/G + digits. */
export type RifType = 'V' | 'E' | 'J' | 'P' | 'G'

export const RIF_TYPES: { value: RifType; label: string }[] = [
  { value: 'V', label: 'V — Venezolano' },
  { value: 'E', label: 'E — Extranjero' },
  { value: 'J', label: 'J — Jurídico (empresa)' },
  { value: 'P', label: 'P — Pasaporte' },
  { value: 'G', label: 'G — Gubernamental' }
]

export type ContribuyenteType = 'ordinario' | 'especial' | 'formal'

export const CONTRIBUYENTE_TYPES: { value: ContribuyenteType; label: string }[] = [
  { value: 'ordinario', label: 'Contribuyente ordinario' },
  { value: 'especial', label: 'Contribuyente especial' },
  { value: 'formal', label: 'Contribuyente formal' }
]

/** Normalize a RIF to canonical "J-12345678-9" form (uppercase, single dashes). */
export function normalizeRif(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length < 2) return clean
  const prefix = clean[0]!
  const digits = clean.slice(1)
  if (digits.length <= 1) return `${prefix}-${digits}`
  const body = digits.slice(0, -1)
  const check = digits.slice(-1)
  return `${prefix}-${body}-${check}`
}

/**
 * Validate a Venezuelan RIF. Accepts forms like J-12345678-9, V123456789, E-12345678-9.
 * Prefix V/E/J/P/G + 9 digits (8 body + 1 check). Lenient on dashes/spaces.
 */
export function isValidRif(raw: string): boolean {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[VEJPG]\d{9}$/.test(clean)
}
