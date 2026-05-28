export type PaymentMethod =
  | 'cash_ves'
  | 'cash_usd'
  | 'card'
  | 'pago_movil'
  | 'transfer'
  | 'zelle'
  | 'credit'

export const PAYMENT_METHODS: {
  value: PaymentMethod
  label: string
  currency: 'USD' | 'VES'
  isDivisa: boolean
}[] = [
  { value: 'cash_ves', label: 'Efectivo Bs', currency: 'VES', isDivisa: false },
  { value: 'cash_usd', label: 'Efectivo $', currency: 'USD', isDivisa: true },
  { value: 'card', label: 'Tarjeta / Punto', currency: 'VES', isDivisa: false },
  { value: 'pago_movil', label: 'Pago móvil', currency: 'VES', isDivisa: false },
  { value: 'transfer', label: 'Transferencia', currency: 'VES', isDivisa: false },
  { value: 'zelle', label: 'Zelle', currency: 'USD', isDivisa: true },
  { value: 'credit', label: 'Crédito (cuenta)', currency: 'USD', isDivisa: false }
]

export const PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label])
)
