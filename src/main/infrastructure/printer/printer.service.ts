import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'
import { getSetting, setSetting } from '@main/infrastructure/settings/settings.service'
import { logger } from '@main/logger'
import { formatMoney, formatVes } from '@shared/format'
import type { SaleDTO } from '@shared/ipc/contracts/sales'
import type { StoreProfileDTO } from '@shared/ipc/contracts/settings'
import type { CashReportDTO } from '@shared/ipc/contracts/cash'
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

export async function printSaleTicket(
  sale: SaleDTO,
  store: StoreProfileDTO | null,
  opts?: { cajaLabel?: string; esCopia?: boolean }
): Promise<void> {
  const cajaLabel = opts?.cajaLabel ?? '1'
  const esCopia = opts?.esCopia ?? false
  const cfg = await getPrinterConfig()
  const printer = build(cfg)
  const rate = sale.rateUsed

  // Pre-check connection (same as printTest) so we fail with PRINTER_OFFLINE
  // instead of a generic PRINT_FAILED when the printer is unreachable.
  try {
    const connected = await printer.isPrinterConnected()
    if (!connected) {
      throw new PrinterError('PRINTER_OFFLINE', `impresora no responde en ${cfg.interface}`)
    }
  } catch (e) {
    if (e instanceof PrinterError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    logger.error({ err: e, iface: cfg.interface }, 'printer connection check failed')
    throw new PrinterError('PRINTER_OFFLINE', `no se pudo conectar: ${msg}`)
  }

  // ---- Formato de factura, espejo del de Galas Cloud ------------------------
  //
  // La estructura y el orden replican `apps/frontend/utils/printInvoice.ts`
  // del máster para que la factura del mostrador y la que reimprime el
  // administrador sean la misma. Diferencia deliberada: los datos de la
  // empresa salen del perfil de tienda en vez de estar escritos en el código,
  // que es lo que hace Galas Cloud.
  //
  // Importes de línea en USD, igual que el máster. Los equivalentes en Bs van
  // en el bloque de totales, según cómo se pagó.
  const usd = (cents: number): string => (cents / 100).toFixed(2)
  const bs = (cents: number): string =>
    rate ? (formatVes(cents, rate) ?? formatMoney(cents)) : formatMoney(cents)

  // Tipo de venta, deducido de la moneda de los pagos.
  const pagadoUsd = sale.payments
    .filter((p) => p.currency === 'USD')
    .reduce((acc, p) => acc + p.amountUsd, 0)
  const pagadoVes = sale.payments
    .filter((p) => p.currency === 'VES')
    .reduce((acc, p) => acc + p.amountUsd, 0)
  const tipoVenta =
    pagadoVes === 0 && pagadoUsd > 0 ? 'USD' : pagadoUsd === 0 && pagadoVes > 0 ? 'VES' : 'MIXTO'

  // Kilos y unidades se cuentan aparte, como en el máster.
  let totalKilos = 0
  let totalUnidades = 0
  for (const l of sale.lines) {
    const u = (l.unitOfMeasure ?? '').toLowerCase()
    if (u.includes('kg') || u.includes('kilo')) totalKilos += l.qty
    else totalUnidades += l.qty
  }

  const fechaVenta = new Date(sale.createdAt)

  printer.alignCenter()
  if (esCopia) {
    printer.bold(true)
    printer.println('*** COPIA ***')
    printer.bold(false)
  }
  printer.bold(true)
  printer.println(store?.legalName || 'Tienda')
  if (store?.rif) printer.println(`Rif: ${store.rif}`)
  printer.bold(false)
  if (store?.address) printer.println(store.address)
  printer.drawLine()

  printer.alignLeft()
  printer.leftRight('Referencia Nro:', sale.number)
  printer.leftRight('Fecha:', fechaVenta.toLocaleDateString('es-VE'))
  printer.leftRight(
    'Hora:',
    fechaVenta.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
  )
  printer.leftRight('Caja No #:', cajaLabel)
  printer.leftRight('Tipo de Venta:', tipoVenta)
  printer.drawLine()

  printer.println(`Cliente: ${sale.customerName || 'Cliente General'}`)
  const rifCliente = sale.customerDocId
    ? `${sale.customerDocType ? `${sale.customerDocType}-` : ''}${sale.customerDocId}`
    : 'N/A'
  printer.println(`Rif: ${rifCliente}`)
  printer.println(`Direccion: ${sale.customerAddress || 'N/A'}`)
  if (sale.sellerName) printer.println(`Vendedor: ${sale.sellerName}`)
  printer.drawLine()

  printer.alignCenter()
  printer.bold(true)
  printer.println('CANTIDAD DESCRIPCION PRECIO DESC TOTAL')
  printer.bold(false)
  printer.drawLine()
  printer.alignLeft()

  for (const l of sale.lines) {
    printer.println(l.description)
    const base = l.unitPrice * l.qty
    const descPct = base > 0 ? Math.round((l.discountAmount / base) * 100) : 0
    printer.println(
      `${l.qty} ${l.unitOfMeasure}   ${usd(l.unitPrice)}   ${descPct > 0 ? `${descPct}%` : '-'}   ${usd(l.lineTotal)}`
    )
  }
  printer.drawLine()

  if (sale.discountTotal > 0) {
    printer.leftRight('Descuento productos', `-${usd(sale.discountTotal)}`)
  }
  if (sale.usdDiscountTotal > 0) {
    const rateLabel =
      sale.usdDiscountRateBp > 0 ? ` (${(sale.usdDiscountRateBp / 100).toFixed(2)}%)` : ''
    printer.leftRight(`Descuento pago USD${rateLabel}`, `-${usd(sale.usdDiscountTotal)}`)
  }
  if (sale.fidelityApplied > 0) {
    printer.leftRight('Fidelizacion', `-${usd(sale.fidelityApplied)}`)
  }
  if (sale.creditApplied > 0) {
    printer.leftRight('Credito a favor', `-${usd(sale.creditApplied)}`)
  }
  if (
    sale.discountTotal > 0 ||
    sale.usdDiscountTotal > 0 ||
    sale.fidelityApplied > 0 ||
    sale.creditApplied > 0
  ) {
    printer.drawLine()
  }

  printer.leftRight('Total Kilos', totalKilos.toFixed(2))
  printer.leftRight('Total Unidades', String(totalUnidades))
  printer.leftRight('Total Items', String(sale.lines.length))
  printer.drawLine()

  if (sale.payments.length > 0) {
    printer.alignCenter()
    printer.bold(true)
    printer.println('METODOS DE PAGO')
    printer.bold(false)
    printer.alignLeft()
    for (const p of sale.payments) {
      const etiqueta = PAYMENT_LABEL[p.method as PaymentMethod] ?? p.method
      const monto =
        p.currency === 'USD'
          ? `${usd(p.amountUsd)} USD`
          : `${p.amountOriginal?.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? bs(p.amountUsd)} VES`
      printer.leftRight(etiqueta, monto)
    }
    printer.drawLine()
  }

  // Totales bimoneda, con la misma lógica del máster.
  printer.bold(true)
  if (tipoVenta === 'USD') {
    printer.leftRight('Total Dolares', usd(sale.total))
    printer.bold(false)
    if (rate) printer.leftRight('Total Bolivares equivalente', bs(sale.total))
  } else if (tipoVenta === 'VES') {
    printer.leftRight('Total Bolivares', bs(sale.total))
    printer.bold(false)
    printer.leftRight('USD equivalente', usd(sale.total))
  } else {
    printer.println('VENTA MIXTA')
    printer.bold(false)
    printer.leftRight('Pagado en Dolares', usd(pagadoUsd))
    printer.leftRight('Pagado en Bolivares', bs(pagadoVes))
    printer.leftRight('TOTAL', usd(sale.total))
  }
  printer.drawLine()

  printer.alignCenter()
  printer.bold(true)
  printer.println('Puntos De La Compra:')
  printer.println(esCopia ? 'COPIA' : 'ORIGINAL CLIENTE')
  printer.bold(false)
  printer.drawLine()
  printer.newLine()
  printer.println('FIRMA DEL CLIENTE')
  printer.println('________________________')
  printer.newLine()
  printer.cut()
  printer.openCashDrawer()

  try {
    await printer.execute()
  } catch (e) {
    const cause = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    logger.error({ err: e, sale: sale.number, iface: cfg.interface }, 'printer execute failed')
    throw new PrinterError('PRINT_FAILED', `no se pudo imprimir: ${cause}`)
  }
}

export async function printCashReport(
  report: CashReportDTO,
  store: StoreProfileDTO | null,
  cajaLabel: string
): Promise<void> {
  const cfg = await getPrinterConfig()
  const printer = build(cfg)
  try {
    const connected = await printer.isPrinterConnected()
    if (!connected) {
      throw new PrinterError('PRINTER_OFFLINE', `impresora no responde en ${cfg.interface}`)
    }
  } catch (e) {
    if (e instanceof PrinterError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new PrinterError('PRINTER_OFFLINE', `no se pudo conectar: ${msg}`)
  }

  const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`
  const opened = new Date(report.openedAt)
  const closed = report.closedAt ? new Date(report.closedAt) : null

  printer.alignCenter()
  printer.bold(true)
  printer.println(store?.legalName || 'Tienda')
  printer.println('REPORTE Z - CIERRE DE CAJA')
  printer.bold(false)
  if (store?.rif) printer.println(`RIF: ${store.rif}`)
  printer.drawLine()
  printer.alignLeft()
  printer.leftRight('Caja:', cajaLabel)
  printer.leftRight('Cajero:', report.userName)
  printer.leftRight('Apertura:', opened.toLocaleString('es-VE'))
  printer.leftRight('Cierre:', closed?.toLocaleString('es-VE') ?? 'Caja abierta')
  printer.drawLine()
  printer.leftRight('Ventas:', String(report.salesCount))
  printer.leftRight('Total ventas:', money(report.salesGross))
  if (report.refundCount > 0) {
    printer.leftRight('Devoluciones:', `${report.refundCount} / -${money(report.refundTotal)}`)
    printer.leftRight('Venta neta:', money(report.netSales))
  }
  printer.drawLine()
  printer.alignCenter()
  printer.bold(true)
  printer.println('METODOS DE PAGO')
  printer.bold(false)
  printer.alignLeft()
  for (const [method, totals] of Object.entries(report.byMethod)) {
    const label = PAYMENT_LABEL[method as PaymentMethod] ?? method
    printer.leftRight(`${label} (${totals.count})`, money(totals.amountUsd))
  }
  printer.drawLine()
  printer.leftRight('Monto inicial:', money(report.openingAmount))
  printer.leftRight('Ingresos:', money(report.movementsIn))
  printer.leftRight('Retiros:', money(report.movementsOut))
  printer.leftRight('Efectivo esperado:', money(report.expectedCashUsd))
  printer.leftRight('Efectivo contado:', money(report.closingAmount ?? 0))
  printer.bold(true)
  const difference = report.overShort ?? 0
  printer.leftRight(
    difference === 0 ? 'Resultado:' : difference > 0 ? 'Sobrante:' : 'Faltante:',
    difference === 0 ? 'CUADRADA' : money(Math.abs(difference))
  )
  printer.bold(false)
  printer.drawLine()
  printer.alignCenter()
  printer.println(`Impreso: ${new Date().toLocaleString('es-VE')}`)
  printer.newLine()
  printer.cut()

  try {
    await printer.execute()
  } catch (e) {
    const cause = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    logger.error({ err: e, sessionId: report.sessionId }, 'cash report print failed')
    throw new PrinterError('PRINT_FAILED', `no se pudo imprimir: ${cause}`)
  }
}
