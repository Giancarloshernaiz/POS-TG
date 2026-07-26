import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'
import { getSetting, setSetting } from '@main/infrastructure/settings/settings.service'
import { logger } from '@main/logger'
import { formatMoney, formatVes } from '@shared/format'
import type { SaleDTO } from '@shared/ipc/contracts/sales'
import type { StoreProfileDTO } from '@shared/ipc/contracts/settings'
import { PAYMENT_LABEL, type PaymentMethod } from '@shared/payment'

const SETTINGS_KEY_PRINTER = 'printer.config'

export type PrinterConfig = {
  type: 'epson' | 'star'
  interface: string // e.g. 'tcp://192.168.1.50' or 'printer:POS-80'
  widthChars: number
  enabled: boolean
}

const DEFAULT_CONFIG: PrinterConfig = {
  type: 'epson',
  interface: '',
  widthChars: 48,
  enabled: false
}

export async function getPrinterConfig(): Promise<PrinterConfig> {
  const cfg = await getSetting<PrinterConfig>(SETTINGS_KEY_PRINTER)
  return cfg ?? DEFAULT_CONFIG
}

export async function setPrinterConfig(cfg: PrinterConfig): Promise<PrinterConfig> {
  await setSetting(SETTINGS_KEY_PRINTER, cfg)
  return cfg
}

export class PrinterError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

function build(cfg: PrinterConfig): ThermalPrinter {
  if (!cfg.enabled || !cfg.interface) {
    throw new PrinterError('PRINTER_NOT_CONFIGURED', 'impresora no configurada')
  }
  return new ThermalPrinter({
    type: cfg.type === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: cfg.interface,
    characterSet: CharacterSet.PC858_EURO,
    removeSpecialCharacters: false,
    options: { timeout: 5000 }
  })
}

export async function printTest(): Promise<void> {
  const cfg = await getPrinterConfig()
  const printer = build(cfg)
  const connected = await printer.isPrinterConnected()
  if (!connected) throw new PrinterError('PRINTER_OFFLINE', 'impresora no responde')
  printer.alignCenter()
  printer.bold(true)
  printer.println('PRUEBA DE IMPRESION')
  printer.bold(false)
  printer.println(new Date().toLocaleString())
  printer.drawLine()
  printer.println('POS-TG conectado correctamente')
  printer.cut()
  await printer.execute()
}

export async function openCashDrawer(): Promise<void> {
  const cfg = await getPrinterConfig()
  const printer = build(cfg)
  printer.openCashDrawer()
  await printer.execute()
}

export async function printSaleTicket(sale: SaleDTO, store: StoreProfileDTO | null): Promise<void> {
  const cfg = await getPrinterConfig()
  const printer = build(cfg)
  const rate = sale.rateUsed

  // Pre-check connection (same as printTest) so we fail with PRINTER_OFFLINE
  // instead of a generic PRINT_FAILED when the printer is unreachable.
  try {
    const connected = await printer.isPrinterConnected()
    if (!connected) {
      throw new PrinterError(
        'PRINTER_OFFLINE',
        `impresora no responde en ${cfg.interface}`
      )
    }
  } catch (e) {
    if (e instanceof PrinterError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    logger.error({ err: e, iface: cfg.interface }, 'printer connection check failed')
    throw new PrinterError('PRINTER_OFFLINE', `no se pudo conectar: ${msg}`)
  }

  // Helper: Bs primary; falls back to USD if no rate.
  const amount = (cents: number): string =>
    rate ? (formatVes(cents, rate) ?? formatMoney(cents)) : formatMoney(cents)

  printer.alignCenter()
  printer.bold(true)
  printer.setTextDoubleHeight()
  printer.println(store?.legalName || 'Tienda')
  printer.setTextNormal()
  printer.bold(false)
  if (store?.rif) printer.println(`RIF: ${store.rif}`)
  if (store?.address) printer.println(store.address)
  if (store?.phone) printer.println(`Tel: ${store.phone}`)
  printer.drawLine()

  printer.alignLeft()
  printer.println(`Factura: ${sale.number}`)
  printer.println(`Fecha: ${new Date(sale.createdAt).toLocaleString()}`)
  if (sale.customerName) printer.println(`Cliente: ${sale.customerName}`)
  if (rate) printer.println(`Tasa BCV: ${formatVes(100, rate)}/$`)
  printer.drawLine()

  for (const l of sale.lines) {
    printer.println(`${l.qty} x ${l.description}`)
    printer.leftRight(`  ${l.sku}`, amount(l.lineSubtotal))
  }
  printer.drawLine()

  printer.leftRight('Subtotal', amount(sale.subtotal))
  printer.leftRight('IVA', amount(sale.taxTotal))
  if (sale.igtfTotal > 0) printer.leftRight('IGTF (3%)', amount(sale.igtfTotal))
  printer.bold(true)
  printer.setTextDoubleHeight()
  printer.leftRight('TOTAL', amount(sale.total))
  printer.setTextNormal()
  printer.bold(false)
  if (rate) printer.leftRight('Equivalente USD', formatMoney(sale.total))
  printer.drawLine()

  for (const p of sale.payments) {
    printer.leftRight(
      PAYMENT_LABEL[p.method as PaymentMethod] ?? p.method,
      amount(p.amountUsd)
    )
  }

  printer.alignCenter()
  printer.newLine()
  // No leading "¡" — extended Latin char (0xAD) gets misread as a CJK lead
  // byte on some thermal firmware and corrupts the next character.
  printer.println('Gracias por su compra!')
  printer.cut()
  printer.openCashDrawer()

  try {
    await printer.execute()
  } catch (e) {
    const cause = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    logger.error(
      { err: e, sale: sale.number, iface: cfg.interface },
      'printer execute failed'
    )
    throw new PrinterError('PRINT_FAILED', `no se pudo imprimir: ${cause}`)
  }
}
