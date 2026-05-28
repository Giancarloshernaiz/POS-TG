import cron, { type ScheduledTask } from 'node-cron'
import { refreshRate, getCurrentRate, type FxRate } from './fx.service'
import { logger } from '@main/logger'

type PublishFn = (channel: string, payload: unknown) => void

// Refresh every 6 hours at minute 5 (00:05, 06:05, 12:05, 18:05).
const CRON_EXPR = '5 */6 * * *'

let task: ScheduledTask | null = null

async function doRefresh(publish: PublishFn): Promise<void> {
  try {
    const rate: FxRate = await refreshRate()
    publish('fx.updated', rate)
  } catch (err) {
    logger.warn({ err }, 'fx scheduler: refresh failed, keeping last rate')
  }
}

export function startFxScheduler(publish: PublishFn): void {
  // Boot fetch (non-blocking): if no rate cached yet, or to refresh on startup.
  void getCurrentRate().then((existing) => {
    if (!existing) {
      logger.info('fx: no cached rate, fetching on boot')
    }
    void doRefresh(publish)
  })

  if (task) task.stop()
  task = cron.schedule(CRON_EXPR, () => {
    logger.info('fx scheduler: tick')
    void doRefresh(publish)
  })
}

export function stopFxScheduler(): void {
  if (task) {
    task.stop()
    task = null
  }
}
