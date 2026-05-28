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
          // Rate appears inside <div id="dolar"> ... <strong> 40,12345678 </strong>
          const block = html.match(/id="dolar"[\s\S]*?<strong>\s*([\d.,]+)\s*<\/strong>/i)
          const raw = block?.[1]
          if (!raw) {
            reject(new Error('bcv: rate not found in html'))
            return
          }
          const normalized = raw.replace(/\./g, '').replace(',', '.')
          const rate = Number(normalized)
          if (!Number.isFinite(rate) || rate <= 0) {
            reject(new Error(`bcv: bad rate parse "${raw}"`))
            return
          }
          resolve({ rate, source: 'bcv', fetchedAt: Date.now(), publishedAt: null })
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
  let result: FxRate | null = null
  try {
    result = await fetchFromApi()
    logger.info({ rate: result.rate }, 'fx: rate from api')
  } catch (apiErr) {
    logger.warn({ err: apiErr }, 'fx: api failed, trying bcv scrape')
    try {
      result = await fetchFromBcv()
      logger.info({ rate: result.rate }, 'fx: rate from bcv scrape')
    } catch (bcvErr) {
      logger.error({ err: bcvErr }, 'fx: both sources failed')
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
