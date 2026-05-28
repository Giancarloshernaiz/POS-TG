import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import pino, { type Logger } from 'pino'
import { is } from '@electron-toolkit/utils'

function buildLogger(): Logger {
  const userData = app.getPath('userData')
  const logDir = join(userData, 'logs')
  mkdirSync(logDir, { recursive: true })

  const baseOpts: pino.LoggerOptions = {
    level: is.dev ? 'debug' : 'info',
    base: {
      pid: process.pid,
      appVersion: app.getVersion()
    },
    timestamp: pino.stdTimeFunctions.isoTime
  }

  if (is.dev) {
    return pino({
      ...baseOpts,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }
      }
    })
  }

  return pino(
    baseOpts,
    pino.destination({
      dest: join(logDir, 'app.log'),
      sync: false,
      mkdir: true
    })
  )
}

let _logger: Logger | null = null

export function getLogger(): Logger {
  if (!_logger) _logger = buildLogger()
  return _logger
}

export const logger = new Proxy({} as Logger, {
  get(_target, prop) {
    const l = getLogger()
    const value = (l as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(l) : value
  }
})

export function installCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    getLogger().fatal({ err }, 'uncaughtException')
  })
  process.on('unhandledRejection', (reason) => {
    getLogger().fatal({ reason }, 'unhandledRejection')
  })
  app.on('child-process-gone', (_e, details) => {
    getLogger().error({ details }, 'child-process-gone')
  })
  app.on('render-process-gone', (_e, _wc, details) => {
    getLogger().error({ details }, 'render-process-gone')
  })
}
