import cron, { type ScheduledTask } from 'node-cron'
import { createBackup, listBackups, pruneDailyBackups } from './backup.service'
import { logger } from '@main/logger'

// Daily backup at 03:15 local time.
const CRON_EXPR = '15 3 * * *'
// If the last daily backup is older than this on boot, make one now (covers
// machines that were powered off at 03:15).
const STALE_MS = 20 * 60 * 60 * 1000 // 20h

let task: ScheduledTask | null = null

async function runDaily(): Promise<void> {
  try {
    await createBackup('daily')
    pruneDailyBackups()
  } catch (err) {
    logger.error({ err }, 'backup scheduler: daily backup failed')
  }
}

function lastDailyAt(): number | null {
  const daily = listBackups().filter((b) => b.kind === 'daily')
  return daily.length > 0 ? daily[0]!.createdAt : null
}

export function startBackupScheduler(): void {
  // Boot catch-up: if no recent daily backup, create one now (non-blocking).
  const last = lastDailyAt()
  if (last === null || Date.now() - last > STALE_MS) {
    logger.info({ last }, 'backup: no recent daily backup, creating on boot')
    void runDaily()
  }

  if (task) task.stop()
  task = cron.schedule(CRON_EXPR, () => {
    logger.info('backup scheduler: tick')
    void runDaily()
  })
}

export function stopBackupScheduler(): void {
  if (task) {
    task.stop()
    task = null
  }
}
