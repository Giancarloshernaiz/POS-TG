import { logger } from '@main/logger'
import type { StoreOptionDTO } from '@shared/ipc/contracts/device'

// Capa anticorrupción hacia Galas Cloud (el máster de inventario externo, plan §31).
// Aquí viven las llamadas REST y el mapeo de sus DTOs (nombres en español,
// Decimals como string, IDs Int) hacia los tipos limpios del POS.

const DEFAULT_TIMEOUT_MS = 8000

export class AgroError extends Error {
  constructor(
    public code: 'AGRO_UNREACHABLE',
    message: string
  ) {
    super(message)
  }
}

/** Normaliza la base: sin barra final, con esquema http:// por defecto. */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  return url
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`status ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Rechazo de negocio del máster (4xx con `error` redactado para el operador),
 * a diferencia de un fallo de transporte. Se distingue para no disfrazar de
 * "Galas Cloud no responde" un mensaje que en realidad sí vino del máster.
 */
export class AgroBusinessError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'AgroBusinessError'
  }
}

async function sendJson<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : null,
        signal: controller.signal
      })
    } catch (e) {
      // Red caída, DNS, timeout: `fetch failed` a secas no le dice nada a nadie.
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn({ err: e, url }, 'agro: send failed')
      throw new AgroError('AGRO_UNREACHABLE', `Galas Cloud no responde (${msg})`)
    }
    const text = await res.text()
    const data = text ? (JSON.parse(text) as T & { error?: string; message?: string }) : ({} as T)
    if (!res.ok) {
      const msg = (data as { error?: string; message?: string })?.error ?? `status ${res.status}`
      throw new AgroBusinessError(msg, res.status)
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

/** Galas Cloud serializa Decimal a veces como number, a veces como string. */
function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

async function get<T>(baseUrl: string, path: string): Promise<T> {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`
  try {
    return await getJson<T>(url)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn({ err: e, url }, 'agro: GET failed')
    throw new AgroError('AGRO_UNREACHABLE', `Galas Cloud no responde (${path}): ${msg}`)
  }
}

type WarehousesResponse = {
  warehouses?: Array<{
    id: number
    nombre: string
    ubicacion: string | null
    sedeId: number
    sede?: { id: number; nombre: string } | null
  }>
}

/** GET /api/v1/inventory/warehouses/ → lista de tiendas (para el wizard). */
export async function fetchStores(baseUrl: string): Promise<StoreOptionDTO[]> {
  const data = await get<WarehousesResponse>(baseUrl, '/api/v1/inventory/warehouses/')
  return (data.warehouses ?? []).map((w) => ({
    id: w.id,
    nombre: w.nombre,
    ubicacion: w.ubicacion ?? null,
    sedeId: w.sedeId,
    sedeNombre: w.sede?.nombre ?? null
  }))
}

// ---- Tipos limpios de pull (mapeados desde Galas Cloud) ----

export type AgroCategory = {
  agroId: number
  nombre: string
  parentAgroId: number | null
  simbolo: string | null
  descuentoBp: number
}

export type AgroProduct = {
  agroId: number
  categoriaAgroId: number | null
  nombre: string
  codigo: string // SKU
  codigoBarras: string | null
  descripcion: string | null
  unidadMedida: string
  /** Baja lógica del máster: si es false, deja de ofrecerse en la caja. */
  activo: boolean
  precioVentaCents: number
  costoPromedioCents: number
  stockMinimo: number
  existencias: Array<{ tiendaId: number; cantidad: number }>
  descuentoBp: number
}

export type AgroSeller = {
  agroId: number
  nombre: string
  apellido: string
  cedula: string
}

export type AgroClient = {
  agroId: number
  nombreContacto: string
  cedula: string
  telefono: string | null
  correo: string | null
  direccion: string | null
  descuentoEspecialBp: number
  saldoFavorCents: number
  creditoDevolucionCents: number
  saldoFidelidadCents: number
  acumuladoFidelidadCents: number
}

export type AgroClientCredit = {
  clienteAgroId: number
  saldoCents: number
}

export type AgroTasa = { rate: number; fecha: number | null } | null

/** GET /inventory/category/?flat=true — lista plana (sin flat=true devuelve un árbol anidado). */
export async function fetchCategories(baseUrl: string): Promise<AgroCategory[]> {
  const data = await get<{
    categories?: Array<{
      id: number
      nombre: string
      categoria_padre_id: number | null
      simbolo?: string | null
      descuento?: unknown
    }>
  }>(baseUrl, '/api/v1/inventory/category/?flat=true')
  return (data.categories ?? []).map((c) => ({
    agroId: c.id,
    nombre: c.nombre,
    parentAgroId: c.categoria_padre_id ?? null,
    simbolo: c.simbolo ?? null,
    descuentoBp: Math.round(num(c.descuento) * 100)
  }))
}

/** GET /inventory/products/summary → catálogo + existencias por tienda. Incluye `unidadMedida` y `descripcion`. */
export async function fetchProductsSummary(baseUrl: string): Promise<AgroProduct[]> {
  const data = await get<{
    products?: Array<{
      id: number
      nombre: string
      codigo: string
      codigo_barras: string | null
      descripcion?: string | null
      unidadMedida?: string | null
      activo?: boolean
      precioVenta: unknown
      costoPromedio: unknown
      stockMinimo: unknown
      categoria?: { id: number } | null
      existencias?: Array<{ tiendaId: number; cantidad: unknown }>
      descuento?: unknown
    }>
  }>(baseUrl, '/api/v1/inventory/products/summary')
  return (data.products ?? []).map((p) => ({
    agroId: p.id,
    categoriaAgroId: p.categoria?.id ?? null,
    nombre: p.nombre,
    codigo: p.codigo,
    codigoBarras: p.codigo_barras ?? null,
    descripcion: p.descripcion ?? null,
    unidadMedida: p.unidadMedida?.trim() || 'UNIDAD',
    // El máster puede no mandarlo (versión vieja): se asume activo.
    activo: p.activo !== false,
    precioVentaCents: Math.round(num(p.precioVenta) * 100),
    costoPromedioCents: Math.round(num(p.costoPromedio) * 100),
    stockMinimo: Math.round(num(p.stockMinimo)),
    existencias: (p.existencias ?? []).map((e) => ({
      tiendaId: e.tiendaId,
      cantidad: Math.round(num(e.cantidad))
    })),
    descuentoBp: Math.round(num(p.descuento) * 100)
  }))
}

/** Porcentaje global aplicado por Tiendas Gala a pagos en USD. */
export async function fetchDescuentoDivisa(baseUrl: string): Promise<number> {
  const data = await get<{ descuento?: { descuento?: unknown } | unknown }>(
    baseUrl,
    '/api/v1/finance/descuento'
  )
  const raw =
    data && typeof data.descuento === 'object' && data.descuento !== null
      ? (data.descuento as { descuento?: unknown }).descuento
      : data.descuento
  return Math.max(0, Math.round(num(raw) * 100))
}

export type AgroCompletedReturn = {
  saleId: number
  amountCents: number
  completedAt: number | null
}

/** Ventas del maestro con monto exacto y fecha de devolución completada. */
export async function fetchCompletedReturns(baseUrl: string): Promise<AgroCompletedReturn[]> {
  const data = await get<{
    saleIds?: unknown[]
    returns?: Array<{ saleId?: unknown; amount?: unknown; completedAt?: unknown }>
  }>(baseUrl, '/api/v1/sales/returns/completed-sale-ids')
  if (Array.isArray(data.returns)) {
    return data.returns
      .map((item) => ({
        saleId: Math.round(num(item.saleId)),
        amountCents: Math.max(0, Math.round(num(item.amount) * 100)),
        completedAt:
          typeof item.completedAt === 'number' && Number.isFinite(item.completedAt)
            ? item.completedAt
            : null
      }))
      .filter((item) => item.saleId > 0)
  }
  // Compatibilidad durante el despliegue del backend maestro actualizado.
  return (data.saleIds ?? [])
    .map((id) => ({ saleId: Math.round(num(id)), amountCents: 0, completedAt: null }))
    .filter((item) => item.saleId > 0)
}

/** GET /sales/clients/ — con `cedula` filtra exacto (case-insensitive) server-side. */
export async function fetchClients(baseUrl: string, cedula?: string): Promise<AgroClient[]> {
  const path = cedula
    ? `/api/v1/sales/clients/?cedula=${encodeURIComponent(cedula)}`
    : '/api/v1/sales/clients/'
  const data = await get<{
    clients?: Array<{
      id: number
      nombre_contacto: string
      cedula: string
      telefono: string | null
      correo: string | null
      direccion: string | null
      descuento_especial: unknown
      saldo_favor?: unknown
      monto_acumulado_fidelizacion?: unknown
    }>
  }>(baseUrl, path)
  const returnCredits = await fetchClientCredits(baseUrl)
  const creditByClient = new Map<number, number>()
  for (const credit of returnCredits) {
    creditByClient.set(
      credit.clienteAgroId,
      (creditByClient.get(credit.clienteAgroId) ?? 0) + credit.saldoCents
    )
  }
  return (data.clients ?? []).map((c) => {
    const saldoFavorCents = Math.max(0, Math.round(num(c.saldo_favor) * 100))
    const creditoDevolucionCents = Math.min(saldoFavorCents, creditByClient.get(c.id) ?? 0)
    return {
      agroId: c.id,
      nombreContacto: c.nombre_contacto,
      cedula: c.cedula,
      telefono: c.telefono ?? null,
      correo: c.correo ?? null,
      direccion: c.direccion ?? null,
      descuentoEspecialBp: Math.round(num(c.descuento_especial) * 100),
      saldoFavorCents,
      creditoDevolucionCents,
      saldoFidelidadCents: Math.max(0, saldoFavorCents - creditoDevolucionCents),
      acumuladoFidelidadCents: Math.max(0, Math.round(num(c.monto_acumulado_fidelizacion) * 100))
    }
  })
}

/** Créditos activos originados por devoluciones, separados del saldo de fidelidad. */
export async function fetchClientCredits(baseUrl: string): Promise<AgroClientCredit[]> {
  const data = await get<{
    items?: Array<{ clienteId?: unknown; saldo_favor?: unknown; origen?: string }>
  }>(baseUrl, '/api/v1/sales/credits')
  return (data.items ?? [])
    .filter((item) => item.origen !== 'SALDO_FAVOR')
    .map((item) => ({
      clienteAgroId: Math.round(num(item.clienteId)),
      saldoCents: Math.max(0, Math.round(num(item.saldo_favor) * 100))
    }))
    .filter((item) => item.clienteAgroId > 0 && item.saldoCents > 0)
}

/** GET /sales/vendedores/farms/:tiendaId → comisionistas de esta tienda. */
export async function fetchSellers(baseUrl: string, tiendaId: number): Promise<AgroSeller[]> {
  const data = await get<{
    vendedores?: Array<{
      id: number
      nombre: string
      apellido?: string | null
      cedula?: string | null
    }>
  }>(baseUrl, `/api/v1/sales/vendedores/farms/${tiendaId}`)
  return (data.vendedores ?? []).map((v) => ({
    agroId: v.id,
    nombre: v.nombre,
    apellido: v.apellido ?? '',
    cedula: v.cedula ?? ''
  }))
}

export type DeleteProductResult = {
  /** `eliminado` = se borró de verdad; `desactivado` = tenía historial. */
  modo: 'eliminado' | 'desactivado'
  message: string
}

/**
 * DELETE /inventory/products/:agroId → baja en el máster.
 * El máster decide el modo: borra de verdad solo si el producto nunca se movió;
 * si tiene ventas, despachos o existencias, lo desactiva para no destruir el
 * historial. El POS no toma esa decisión ni la puede forzar.
 */
export async function deleteProductInAgro(
  baseUrl: string,
  agroId: number
): Promise<DeleteProductResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/inventory/products/${agroId}`
  const data = await sendJson<{ modo?: string; message?: string }>(url, 'DELETE')
  return {
    modo: data.modo === 'eliminado' ? 'eliminado' : 'desactivado',
    message: data.message ?? 'Producto dado de baja'
  }
}

/** GET /finance/tasa/latest → tasa BCV del máster (fuente única). */
export async function fetchTasa(baseUrl: string): Promise<AgroTasa> {
  const data = await get<{ tasa?: { tasa: unknown; fecha?: string | null } }>(
    baseUrl,
    '/api/v1/finance/tasa/latest'
  )
  if (!data.tasa) return null
  const rate = num(data.tasa.tasa)
  if (rate <= 0) return null
  const fecha = data.tasa.fecha ? new Date(data.tasa.fecha).getTime() : null
  return { rate, fecha: Number.isFinite(fecha as number) ? fecha : null }
}

// ---- Push de ventas (§31.7 — atómico + idempotente por idempotencyKey) ----

export type SaleHeaderInput = {
  clientAgroId: number
  storeId: number
  saleDateIso: string
  totalAmountUsd: number // dólares, no centavos
  currency: 'USD' | 'VES' | 'MIXTO'
  vendedorAgroId?: number
  subtotalOriginalUsd?: number
  descripcion?: string
  usarSaldoFavor?: boolean
  saldoFavorMonto?: number
  payments: Array<{ metodoPago: string; monto: number; moneda: 'USD' | 'VES' }>
}

export type SaleLineInput = {
  productAgroId: number
  quantity: number
  priceUsd: number
  descuentoUsd: number
}

export type SaleFullResult = { agroSaleId: number; idempotent: boolean }

/**
 * POST /sales/sale/create-full → cabecera + líneas + descuento de ExistenciaTienda
 * en una sola transacción atómica de Galas Cloud (reemplaza el viejo par create+batch,
 * que dejaba una cabecera huérfana si el paso de líneas fallaba por falta de stock).
 * Idempotente por `idempotencyKey`: un reintento con la misma clave devuelve la
 * venta ya creada (`idempotent: true`) en vez de duplicarla.
 */
export async function postSaleFull(
  baseUrl: string,
  input: SaleHeaderInput & { idempotencyKey: string; lines: SaleLineInput[] }
): Promise<SaleFullResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/sales/sale/create-full`
  const data = await sendJson<{ sale: { id: number }; idempotent?: boolean }>(url, 'POST', {
    client_id: input.clientAgroId,
    tienda_id: input.storeId,
    sale_date: input.saleDateIso,
    total_amount: input.totalAmountUsd,
    currency: input.currency,
    vendedor_id: input.vendedorAgroId,
    subtotal_original_us: input.subtotalOriginalUsd,
    descripcion: input.descripcion,
    usar_saldo_favor: input.usarSaldoFavor,
    saldo_favor_monto: input.saldoFavorMonto,
    payments: input.payments,
    idempotency_key: input.idempotencyKey,
    details: input.lines.map((l) => ({
      product_id: l.productAgroId,
      quantity: l.quantity,
      price: l.priceUsd,
      // `descuento_monto` es siempre monto en USD y no admite interpretación.
      // NO usar `descuento`: ese campo tiene heurística por rango en el máster
      // (el frontend de Galas Cloud lo manda como porcentaje), así que un descuento
      // de $0.50 se guardaba como 50% y uno de $10 como 10%.
      descuento_monto: l.descuentoUsd
    }))
  })
  return { agroSaleId: data.sale.id, idempotent: data.idempotent === true }
}

// ---- Recepción de despachos del Centro de Acopio ----------------------------
//
// El acopio despacha mercancía hacia la tienda; la caja la recibe escaneando.
// El máster es dueño del despacho y de `ExistenciaTienda`: cada lectura suma
// una unidad allá y la proyección local se actualiza después. Por eso la
// recepción exige red — igual que el alta de catálogo.

export type AgroDispatchLine = {
  lineaId: number
  productoAgroId: number
  nombre: string
  codigo: string
  codigoBarras: string | null
  unidadMedida: string | null
  cantidad: number
  cantidadRecibida: number
  estado: 'POR_VALIDAR' | 'RECIBIDO' | 'NO_RECIBIDO' | 'RECIBIDO_PARCIALMENTE'
}

export type AgroDispatch = {
  agroId: number
  referencia: string
  fecha: number | null
  estado: string
  tiendaId: number
  lineas: AgroDispatchLine[]
}

type RawDispatch = {
  id: number
  despacho: string
  fecha: string | null
  estado: string
  tienda_id: number
  productos?: Array<{
    id: number
    producto_id: number
    cantidad: number
    cantidad_recibida: number
    estado: string
    codigo_barras: string | null
    producto?: {
      id: number
      nombre: string
      codigo: string
      codigo_barras: string | null
      unidadMedida?: string | null
    } | null
  }>
}

function toDispatch(d: RawDispatch): AgroDispatch {
  const fecha = d.fecha ? new Date(d.fecha).getTime() : null
  return {
    agroId: d.id,
    referencia: d.despacho,
    fecha: Number.isFinite(fecha as number) ? fecha : null,
    estado: d.estado,
    tiendaId: d.tienda_id,
    lineas: (d.productos ?? []).map((p) => ({
      lineaId: p.id,
      productoAgroId: p.producto_id,
      nombre: p.producto?.nombre ?? `Producto ${p.producto_id}`,
      codigo: p.producto?.codigo ?? '',
      codigoBarras: p.producto?.codigo_barras ?? p.codigo_barras ?? null,
      unidadMedida: p.producto?.unidadMedida ?? null,
      cantidad: p.cantidad,
      cantidadRecibida: p.cantidad_recibida,
      estado: p.estado as AgroDispatchLine['estado']
    }))
  }
}

/**
 * GET /inventory/dispatches/store/:tiendaId → despachos dirigidos a esta tienda.
 * Los BORRADOR se excluyen: todavía se están armando en el acopio y no
 * representan mercancía en camino.
 */
export async function fetchDispatchesForStore(
  baseUrl: string,
  tiendaId: number
): Promise<AgroDispatch[]> {
  const data = await get<{ despachos?: RawDispatch[] }>(
    baseUrl,
    `/api/v1/inventory/dispatches/store/${tiendaId}`
  )
  return (data.despachos ?? []).filter((d) => d.estado !== 'BORRADOR').map(toDispatch)
}

/** GET /inventory/dispatches/:id */
export async function fetchDispatch(
  baseUrl: string,
  agroDispatchId: number
): Promise<AgroDispatch> {
  const data = await get<{ despacho: RawDispatch }>(
    baseUrl,
    `/api/v1/inventory/dispatches/${agroDispatchId}`
  )
  return toDispatch(data.despacho)
}

export type ReceiveScanResult = {
  productoAgroId: number
  nombre: string
  recibido: number
  despachado: number
  pendiente: number
  estadoLinea: string
  estadoDespacho: string
}

/**
 * POST /inventory/dispatches/:id/receive-scan → suma `cantidad` (default 1) a
 * lo recibido de ese producto e incrementa ExistenciaTienda en el máster.
 * Devuelve un error de negocio legible si el código no viene en el despacho o
 * si se excede lo despachado.
 */
export async function receiveDispatchScan(
  baseUrl: string,
  agroDispatchId: number,
  codigo: string,
  cantidad = 1
): Promise<ReceiveScanResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/inventory/dispatches/${agroDispatchId}/receive-scan`
  const data = await sendJson<{
    producto: { id: number; nombre: string }
    recibido: number
    despachado: number
    pendiente: number
    estadoLinea: string
    estadoDespacho: string
  }>(url, 'POST', { codigo, cantidad })
  return {
    productoAgroId: data.producto.id,
    nombre: data.producto.nombre,
    recibido: data.recibido,
    despachado: data.despachado,
    pendiente: data.pendiente,
    estadoLinea: data.estadoLinea,
    estadoDespacho: data.estadoDespacho
  }
}

// ---- Autorizaciones: la caja pide, el administrador aprueba en Galas Cloud ------
//
// Devolución y reimpresión de factura no las decide la caja. El POS crea una
// solicitud en el máster y espera; el administrador la aprueba o rechaza desde
// Galas Cloud, que ya tiene la bandeja de pendientes. En el caso de la devolución,
// aprobar además EJECUTA el efecto allá (repone stock, emite el crédito): la
// caja solo lo refleja en su próximo pull.

export type AuthorizationType = 'RETURN_SALE' | 'REPRINT_INVOICE'
export type AuthorizationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type AuthorizationRequestDTO = {
  id: number
  type: AuthorizationType
  status: AuthorizationStatus
  ventaId: number | null
  createdAt: number | null
  approvedAt: number | null
}

function toAuthorization(r: {
  id: number
  type: string
  status: string
  ventaId: number | null
  createdAt?: string | null
  approvedAt?: string | null
}): AuthorizationRequestDTO {
  const ms = (v?: string | null): number | null => {
    if (!v) return null
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : null
  }
  return {
    id: r.id,
    type: r.type as AuthorizationType,
    status: r.status as AuthorizationStatus,
    ventaId: r.ventaId,
    createdAt: ms(r.createdAt),
    approvedAt: ms(r.approvedAt)
  }
}

export type AgroApprover = {
  id: number
  nombre: string
  rol: string
  email: string
}

/** GET /authorization/approvers → usuarios que pueden resolver la solicitud. */
export async function fetchApprovers(baseUrl: string): Promise<AgroApprover[]> {
  const data = await get<{
    approvers?: Array<{
      id: number
      names: string
      last_names: string
      email: string
      roles?: { name_role: string } | null
    }>
  }>(baseUrl, '/api/v1/authorization/approvers')
  return (data.approvers ?? []).map((a) => ({
    id: a.id,
    nombre: `${a.names} ${a.last_names}`.trim(),
    rol: a.roles?.name_role ?? '',
    email: a.email
  }))
}

/** POST /authorization/requests → crea la solicitud en estado PENDING. */
export async function createAuthorizationRequest(
  baseUrl: string,
  input: {
    /** A quién va dirigida. Vacío = a cualquiera que pueda atenderla. */
    approverIds: number[]
    /** Quién pide, en texto: la caja no tiene usuario propio en el máster. */
    requesterLabel: string
    ventaId: number
    type: AuthorizationType
    metadata: Record<string, unknown>
  }
): Promise<AuthorizationRequestDTO> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/authorization/requests`
  const data = await sendJson<{ request: Parameters<typeof toAuthorization>[0] }>(
    url,
    'POST',
    input
  )
  return toAuthorization(data.request)
}

/** GET /authorization/requests/:id → estado actual de la solicitud. */
export async function fetchAuthorizationRequest(
  baseUrl: string,
  requestId: number
): Promise<AuthorizationRequestDTO> {
  const data = await get<{ request: Parameters<typeof toAuthorization>[0] }>(
    baseUrl,
    `/api/v1/authorization/requests/${requestId}`
  )
  return toAuthorization(data.request)
}

// ---- Escrituras de CATÁLOGO hacia el máster (§31.4) --------------------------
//
// Galas Cloud (Centro de Acopio) es el único dueño del catálogo global: productos y
// categorías se crean y editan allá, y vuelven por pull. El POS nunca crea una
// fila de catálogo sin `agroId` — un producto sin mapeo hace que toda venta que
// lo incluya quede trabada para siempre en `sync_state.phase = ERROR`.
// Por eso estas llamadas son de red obligatoria: sin máster, no hay alta.

export type AgroProductInput = {
  codigo: string // SKU / referencia interna
  codigoBarras: string
  nombre: string
  descripcion?: string | null
  categoriaAgroId: number
  unidadMedida: string
  precioVentaCents: number
  costoPromedioCents?: number | null
  stockMinimo?: number | null
}

function toAgroProductBody(input: Partial<AgroProductInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (input.codigo !== undefined) body.codigo = input.codigo
  if (input.codigoBarras !== undefined) body.codigo_barras = input.codigoBarras
  if (input.nombre !== undefined) body.nombre = input.nombre
  if (input.descripcion !== undefined) body.descripcion = input.descripcion ?? undefined
  if (input.categoriaAgroId !== undefined) body.categoriaId = input.categoriaAgroId
  if (input.unidadMedida !== undefined) body.unidadMedida = input.unidadMedida
  // El POS trabaja en centavos, Galas Cloud en unidades monetarias.
  if (input.precioVentaCents !== undefined) body.precioVenta = input.precioVentaCents / 100
  if (input.costoPromedioCents !== undefined && input.costoPromedioCents !== null) {
    body.costoPromedio = input.costoPromedioCents / 100
  }
  if (input.stockMinimo !== undefined && input.stockMinimo !== null)
    body.stockMinimo = input.stockMinimo
  return body
}

/** POST /inventory/products → alta en el máster. Devuelve el agroId asignado. */
export async function createProductInAgro(
  baseUrl: string,
  input: AgroProductInput
): Promise<{ agroId: number; codigoBarras: string }> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/inventory/products/`
  const data = await sendJson<{ product: { id: number; codigo_barras: string } }>(
    url,
    'POST',
    toAgroProductBody(input)
  )
  return { agroId: data.product.id, codigoBarras: data.product.codigo_barras }
}

/** PATCH /inventory/products/:agroId → edición en el máster. */
export async function updateProductInAgro(
  baseUrl: string,
  agroId: number,
  input: Partial<AgroProductInput>
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/inventory/products/${agroId}`
  await sendJson(url, 'PATCH', toAgroProductBody(input))
}

/** POST /inventory/category → alta de categoría en el máster. */
export async function createCategoryInAgro(
  baseUrl: string,
  input: { nombre: string; parentAgroId?: number | null; simbolo?: string | null }
): Promise<number> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/inventory/category/`
  const data = await sendJson<{ category: { id: number } }>(url, 'POST', {
    nombre: input.nombre,
    ...(input.parentAgroId ? { categoria_padre_id: input.parentAgroId } : {}),
    ...(input.simbolo ? { simbolo: input.simbolo } : {})
  })
  return data.category.id
}

/** PATCH /inventory/category/:agroId → edición de categoría en el máster. */
export async function updateCategoryInAgro(
  baseUrl: string,
  agroId: number,
  input: { nombre?: string; parentAgroId?: number | null; simbolo?: string | null }
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/inventory/category/${agroId}`
  const body: Record<string, unknown> = {}
  if (input.nombre !== undefined) body.nombre = input.nombre
  if (input.parentAgroId !== undefined && input.parentAgroId !== null) {
    body.categoria_padre_id = input.parentAgroId
  }
  if (input.simbolo !== undefined && input.simbolo !== null) body.simbolo = input.simbolo
  await sendJson(url, 'PATCH', body)
}

/**
 * GET /inventory/products/by-code/:codigo → busca por código de barras y, si no,
 * por referencia interna. Devuelve null si el máster no lo conoce.
 * Se usa en la reconciliación de productos locales sin `agroId`.
 */
export async function findProductInAgroByCode(
  baseUrl: string,
  codigo: string
): Promise<{ agroId: number; codigo: string; codigoBarras: string | null; nombre: string } | null> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/inventory/products/by-code/${encodeURIComponent(codigo)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = (await res.json()) as {
      product: { id: number; codigo: string; codigo_barras: string | null; nombre: string }
    }
    return {
      agroId: data.product.id,
      codigo: data.product.codigo,
      codigoBarras: data.product.codigo_barras,
      nombre: data.product.nombre
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn({ err: e, url }, 'agro: by-code failed')
    throw new AgroError('AGRO_UNREACHABLE', `Galas Cloud no responde (by-code): ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

/** POST /sales/clients/ → alta de cliente en el máster. */
export async function createClient(
  baseUrl: string,
  input: {
    nombreContacto: string
    cedula: string
    telefono?: string | null
    correo?: string | null
    direccion?: string | null
    descuentoEspecialBp?: number
  }
): Promise<number> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/sales/clients/`
  const data = await sendJson<{ client: { id: number } }>(url, 'POST', {
    nombre_contacto: input.nombreContacto,
    cedula: input.cedula,
    telefono: input.telefono,
    correo: input.correo,
    direccion: input.direccion,
    descuento_especial: (input.descuentoEspecialBp ?? 0) / 100
  })
  return data.client.id
}

/** PATCH /sales/clients/:id → actualiza los datos editables en el maestro. */
export async function updateClient(
  baseUrl: string,
  agroId: number,
  input: {
    nombreContacto: string
    cedula: string
    telefono: string | null
    correo: string | null
    direccion: string | null
    descuentoEspecialBp: number
  }
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/sales/clients/${agroId}`
  await sendJson(url, 'PATCH', {
    nombre_contacto: input.nombreContacto,
    cedula: input.cedula,
    telefono: input.telefono,
    correo: input.correo,
    direccion: input.direccion,
    descuento_especial: input.descuentoEspecialBp / 100
  })
}
