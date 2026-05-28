export type PaymentMethod =
  | 'cash_ves'
  | 'cash_usd'
  | 'card'
  | 'pago_movil'
  | 'transfer'
  | 'zelle'
  | 'credit'

export const PAYMENT_DIVISA: Record<PaymentMethod, boolean> = {
  cash_ves: false,
  cash_usd: true,
  card: false,
  pago_movil: false,
  transfer: false,
  zelle: true,
  credit: false
}

export const PAYMENT_CURRENCY: Record<PaymentMethod, 'USD' | 'VES'> = {
  cash_ves: 'VES',
  cash_usd: 'USD',
  card: 'VES',
  pago_movil: 'VES',
  transfer: 'VES',
  zelle: 'USD',
  credit: 'USD'
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash_ves: 'Efectivo Bs',
  cash_usd: 'Efectivo $',
  card: 'Tarjeta / Punto',
  pago_movil: 'Pago móvil',
  transfer: 'Transferencia',
  zelle: 'Zelle',
  credit: 'Crédito (cuenta)'
}
