import { app } from 'electron'
import { getCurrentSchemaVersion } from '@main/infrastructure/db/migrator'

export const healthHandlers = {
  ping: async (): Promise<{
    pong: true
    ts: number
    appVersion: string
    schemaVersion: number
  }> => {
    return {
      pong: true,
      ts: Date.now(),
      appVersion: app.getVersion(),
      schemaVersion: getCurrentSchemaVersion()
    }
  }
}
