import { defineConfig } from 'drizzle-kit'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

const APP_NAME = 'pos-tg'

function resolveUserData(): string {
  const env = process.env
  switch (platform()) {
    case 'win32':
      return join(env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), APP_NAME)
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', APP_NAME)
    default:
      return join(env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), APP_NAME)
  }
}

const dbPath = process.env['POS_DB_PATH'] ?? join(resolveUserData(), 'pos.sqlite')

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/infrastructure/db/schema/index.ts',
  out: './src/main/infrastructure/db/migrations',
  dbCredentials: { url: dbPath },
  verbose: true,
  strict: true
})
