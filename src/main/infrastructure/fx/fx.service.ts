import https from 'node:https'
import {
  getSetting,
  setSetting,
  SETTINGS_KEYS
} from '@main/infrastructure/settings/settings.service'
import { logger } from '@main/logger'

export type FxRate = {
  rate: number // VES per 1 USD
  source: 'api' | 'bcv' | 'manual'
  fetchedAt: number
  publishedAt: number | null
}

const API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial'
const BCV_URL = 'https://www.bcv.org.ve/'
const FETCH_TIMEOUT_MS = 8000

async function fetchFromApi(): Promise<FxRate> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, { signal: controller.signal })
    if (!res.ok) throw new Error(`api status ${res.status}`)
    const json = (await res.json()) as { promedio?: number; fechaActualizacion?: string }
    if (typeof json.promedio !== 'number' || json.promedio <= 0) {
      throw new Error('api: invalid promedio')
    }
    return {
      rate: json.promedio,
      source: 'api',
      fetchedAt: Date.now(),
      publishedAt: json.fechaActualizacion ? new Date(json.fechaActualizacion).getTime() : null
    }
  } finally {
    clearTimeout(timer)
  }
}

function fetchFromBcv(): Promise<FxRate> {
  return new Promise((resolve, reject) => {
    // bcv.org.ve serves an invalid TLS chain; this endpoint is public read-only data.
    const req = https.get(
      BCV_URL,
      { rejectUnauthorized: false, timeout: FETCH_TIMEOUT_MS },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume()
          reject(new Error(`bcv status ${res.statusCode}`))
          return
        }
        let html = ''
        res.setEncoding('utf-8')
        res.on('data', (chunk) => (html += chunk))
        res.on('end', () => {
          // Rate is inside <div id="dolar"> … <strong class="strong-tb">742,22920000</strong>.
          // The <strong> carries attributes now, so allow them ([^>]*).
          const block = html.match(/id="dolar"[\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i)
          const raw = block?.[1]
          if (!raw) {
            reject(new Error('bcv: rate not found in html'))
            return
          }
          const normalized = raw.trim().replace(/\./g, '').replace(',', '.')
          const rate = Number(normalized)
          if (!Number.isFinite(rate) || rate <= 0) {
            reject(new Error(`bcv: bad rate parse "${raw}"`))
            return
          }
          // "Fecha Valor: <span … content="2026-07-27T00:00:00-04:00">" = the value date.
          const dm = html.match(/Fecha Valor:\s*<span[^>]*content="([^"]+)"/i)
          const parsed = dm ? new Date(dm[1]!).getTime() : NaN
          const publishedAt = Number.isFinite(parsed) ? parsed : null
          resolve({ rate, source: 'bcv', fetchedAt: Date.now(), publishedAt })
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('bcv timeout'))
    })
    req.on('error', reject)
  })
}

export async function refreshRate(): Promise<FxRate> {
  // BCV is the source of truth (the UI is labelled "Tasa BCV"). dolarapi's
  // "oficial" mirrors BCV but can lag several days, so it's only a fallback.
  let result: FxRate | null = null
  try {
    result = await fetchFromBcv()
    logger.info({ rate: result.rate }, 'fx: rate from bcv scrape')
  } catch (bcvErr) {
    logger.warn({ err: bcvErr }, 'fx: bcv scrape failed, trying dolarapi fallback')
    try {
      result = await fetchFromApi()
      logger.info({ rate: result.rate }, 'fx: rate from dolarapi (fallback)')
    } catch (apiErr) {
      logger.error({ err: apiErr, bcvErr }, 'fx: both sources failed')
      throw new Error('FX_FETCH_FAILED')
    }
  }
  await setSetting(SETTINGS_KEYS.FX_BCV, result)
  return result
}

export async function getCurrentRate(): Promise<FxRate | null> {
  return getSetting<FxRate>(SETTINGS_KEYS.FX_BCV)
}

export async function setManualRate(rate: number): Promise<FxRate> {
  const value: FxRate = { rate, source: 'manual', fetchedAt: Date.now(), publishedAt: null }
  await setSetting(SETTINGS_KEYS.FX_BCV, value)
  return value
}
