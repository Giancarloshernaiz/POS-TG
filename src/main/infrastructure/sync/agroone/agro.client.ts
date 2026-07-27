import { logger } from '@main/logger'
import type { StoreOptionDTO } from '@shared/ipc/contracts/device'

// Capa anticorrupción hacia AgroOne (el máster de inventario externo, plan §31).
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

async function sendJson<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : null,
      signal: controller.signal
    })
    const text = await res.text()
    const data = text ? (JSON.parse(text) as T & { error?: string; message?: string }) : ({} as T)
    if (!res.ok) {
      const msg = (data as { error?: string; message?: string })?.error ?? `status ${res.status}`
      throw new Error(msg)
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

/** AgroOne serializa Decimal a veces como number, a veces como string. */
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
    throw new AgroError('AGRO_UNREACHABLE', `AgroOne no responde (${path}): ${msg}`)
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

// ---- Tipos limpios de pull (mapeados desde AgroOne) ----

export type AgroCategory = {
  agroId: number
  nombre: string
  parentAgroId: number | null
  simbolo: string | null
}

export type AgroProduct = {
  agroId: number
  categoriaAgroId: number | null
  nombre: string
  codigo: string // SKU
  codigoBarras: string | null
  descripcion: string | null
  unidadMedida: string | null
  precioVentaCents: number
  costoPromedioCents: number
  stockMinimo: number
  existencias: Array<{ tiendaId: number; cantidad: number }>
}

export type AgroClient = {
  agroId: number
  nombreContacto: string
  cedula: string
  telefono: string | null
  correo: string | null
  direccion: string | null
  descuentoEspecialBp: number
}

export type AgroTasa = { rate: number; fecha: number | null } | null

/** GET /inventory/category/ */
export async function fetchCategories(baseUrl: string): Promise<AgroCategory[]> {
  const data = await get<{
    categories?: Array<{
      id: number
      nombre: string
      categoria_padre_id: number | null
      simbolo?: string | null
    }>
  }>(baseUrl, '/api/v1/inventory/category/')
  return (data.categories ?? []).map((c) => ({
    agroId: c.id,
    nombre: c.nombre,
    parentAgroId: c.categoria_padre_id ?? null,
    simbolo: c.simbolo ?? null
  }))
}

/**
 * GET /inventory/products/summary → catálogo + existencias por tienda.
 * NOTA: este endpoint NO incluye `unidadMedida` en su proyección actual
 * (confirmado contra AgroOne real); se deja el campo listo para cuando lo
 * agreguen o si en el futuro se cambia a `GET /inventory/products/:id`.
 */
export async function fetchProductsSummary(baseUrl: string): Promise<AgroProduct[]> {
  const data = await get<{
    products?: Array<{
      id: number
      nombre: string
      codigo: string
      codigo_barras: string | null
      descripcion?: string | null
      unidadMedida?: string | null
      precioVenta: unknown
      costoPromedio: unknown
      stockMinimo: unknown
      categoria?: { id: number } | null
      existencias?: Array<{ tiendaId: number; cantidad: unknown }>
    }>
  }>(baseUrl, '/api/v1/inventory/products/summary')
  return (data.products ?? []).map((p) => ({
    agroId: p.id,
    categoriaAgroId: p.categoria?.id ?? null,
    nombre: p.nombre,
    codigo: p.codigo,
    codigoBarras: p.codigo_barras ?? null,
    descripcion: p.descripcion ?? null,
    unidadMedida: p.unidadMedida ?? null,
    precioVentaCents: Math.round(num(p.precioVenta) * 100),
    costoPromedioCents: Math.round(num(p.costoPromedio) * 100),
    stockMinimo: Math.round(num(p.stockMinimo)),
    existencias: (p.existencias ?? []).map((e) => ({
      tiendaId: e.tiendaId,
      cantidad: Math.round(num(e.cantidad))
    }))
  }))
}

/** GET /sales/clients/ */
export async function fetchClients(baseUrl: string): Promise<AgroClient[]> {
  const data = await get<{
    clients?: Array<{
      id: number
      nombre_contacto: string
      cedula: string
      telefono: string | null
      correo: string | null
      direccion: string | null
      descuento_especial: unknown
    }>
  }>(baseUrl, '/api/v1/sales/clients/')
  return (data.clients ?? []).map((c) => ({
    agroId: c.id,
    nombreContacto: c.nombre_contacto,
    cedula: c.cedula,
    telefono: c.telefono ?? null,
    correo: c.correo ?? null,
    direccion: c.direccion ?? null,
    descuentoEspecialBp: Math.round(num(c.descuento_especial) * 100)
  }))
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

// ---- Push de ventas (§31.7 — 2 pasos no atómicos, sin idempotencia nativa) ----

export type SaleHeaderInput = {
  clientAgroId: number
  storeId: number
  saleDateIso: string
  totalAmountUsd: number // dólares, no centavos
  currency: 'USD' | 'VES' | 'MIXTO'
  vendedorAgroId?: number
  payments: Array<{ metodoPago: string; monto: number; moneda: 'USD' | 'VES' }>
}

/** POST /sales/sale/create → cabecera + pagos. NO crea líneas ni descuenta stock. */
export async function postSaleHeader(baseUrl: string, input: SaleHeaderInput): Promise<number> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/sales/sale/create`
  const data = await sendJson<{ sale: { id: number } }>(url, 'POST', {
    client_id: input.clientAgroId,
    tienda_id: input.storeId,
    sale_date: input.saleDateIso,
    total_amount: input.totalAmountUsd,
    currency: input.currency,
    vendedor_id: input.vendedorAgroId,
    payments: input.payments
  })
  return data.sale.id
}

export type SaleLineInput = {
  productAgroId: number
  quantity: number
  priceUsd: number
  descuentoUsd: number
}

/** GET /sales/details/sale/:id/details → guard de idempotencia antes de postear líneas. */
export async function fetchSaleDetails(
  baseUrl: string,
  agroSaleId: number
): Promise<Array<{ id: number }>> {
  const data = await get<{ details?: Array<{ id: number }> }>(
    baseUrl,
    `/api/v1/sales/details/sale/${agroSaleId}/details`
  )
  return data.details ?? []
}

/** POST /sales/details/sale/:id/batch → líneas + decremento de ExistenciaTienda. */
export async function postSaleLines(
  baseUrl: string,
  agroSaleId: number,
  lines: SaleLineInput[]
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/sales/details/sale/${agroSaleId}/batch`
  await sendJson(url, 'POST', {
    details: lines.map((l) => ({
      product_id: l.productAgroId,
      quantity: l.quantity,
      price: l.priceUsd,
      descuento: l.descuentoUsd
    }))
  })
}

/** POST /sales/clients/ → alta de cliente en el máster. */
export async function createClient(
  baseUrl: string,
  input: { nombreContacto: string; cedula: string; descuentoEspecialBp?: number }
): Promise<number> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/sales/clients/`
  const data = await sendJson<{ client: { id: number } }>(url, 'POST', {
    nombre_contacto: input.nombreContacto,
    cedula: input.cedula,
    descuento_especial: (input.descuentoEspecialBp ?? 0) / 100
  })
  return data.client.id
}
