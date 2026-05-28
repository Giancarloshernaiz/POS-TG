import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import Database, { type Database as BetterSqliteDatabase } from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { logger } from '@main/logger'

let _raw: BetterSqliteDatabase | null = null
let _db: BetterSQLite3Database<typeof schema> | null = null

export function getDbPath(): string {
  const dir = join(app.getPath('userData'))
  mkdirSync(dir, { recursive: true })
  return join(dir, 'pos.sqlite')
}

export function openDb(): {
  raw: BetterSqliteDatabase
  db: BetterSQLite3Database<typeof schema>
} {
  if (_raw && _db) return { raw: _raw, db: _db }

  const dbPath = getDbPath()
  logger.info({ dbPath }, 'opening sqlite')

  const raw = new Database(dbPath, { fileMustExist: false })
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  raw.pragma('synchronous = NORMAL')
  raw.pragma('busy_timeout = 5000')
  raw.pragma('cache_size = -64000')
  raw.pragma('mmap_size = 268435456')
  raw.pragma('temp_store = MEMORY')

  const db = drizzle(raw, { schema })

  _raw = raw
  _db = db
  return { raw, db }
}

export function closeDb(): void {
  if (_raw) {
    try {
      _raw.close()
    } catch (e) {
      logger.warn({ err: e }, 'error closing sqlite')
    }
  }
  _raw = null
  _db = null
}

export function getRawDb(): BetterSqliteDatabase {
  if (!_raw) throw new Error('DB not initialized — call openDb() first')
  return _raw
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) throw new Error('DB not initialized — call openDb() first')
  return _db
}
