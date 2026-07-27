import cron, { type ScheduledTask } from 'node-cron'
import { getIdentity, isProvisioned } from '@main/infrastructure/device/identity.service'
import { runPull } from './pull.service'
import { pushPendingSales } from './push.service'
import { logger } from '@main/logger'

type PublishFn = (channel: string, payload: unknown) => void

// Pull automático del máster: al arrancar (si está vinculada) y cada 15 min.
// No bloqueante; si AgroOne no responde, conserva los datos ya bajados.
const CRON_EXPR = '*/15 * * * *'
const BOOT_DELAY_MS = 4000 // deja abrir la ventana antes de la primera sync

let task: ScheduledTask | null = null

async function tick(publish: PublishFn): Promise<void> {
  const id = await getIdentity()
  if (!isProvisioned(id) || id.storeId === null || !id.agroBaseUrl) return
  try {
    const summary = await runPull(id.agroBaseUrl, id.storeId)
    publish('sync.updated', summary)
    logger.info({ products: summary.products, stock: summary.stock }, 'agro: auto-pull ok')
  } catch (err) {
    logger.warn({ err }, 'agro: auto-pull failed, keeping cached data')
  }
  try {
    const retried = await pushPendingSales()
    if (retried > 0) logger.info({ retried }, 'agro: retried pending sale pushes')
  } catch (err) {
    logger.warn({ err }, 'agro: push retry sweep failed')
  }
}

export function startAgroPullScheduler(publish: PublishFn): void {
  setTimeout(() => void tick(publish), BOOT_DELAY_MS)
  if (task) task.stop()
  task = cron.schedule(CRON_EXPR, () => void tick(publish))
}

export function stopAgroPullScheduler(): void {
  if (task) {
    task.stop()
    task = null
  }
}
