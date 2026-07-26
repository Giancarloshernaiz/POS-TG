import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { getRawDb, openDb } from './client'
import { logger } from '@main/logger'

type MigrationFile = {
  version: number
  name: string
  sql: string
  hash: string
}

export type MigrationProgress = {
  phase: 'idle' | 'backup' | 'migrating' | 'done' | 'failed' | 'downgrade-detected'
  current: number
  target: number
  message: string
}

type ProgressCb = (p: MigrationProgress) => void

const migrationModules = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

function ensureMetaTables(): void {
  const raw = getRawDb()
  raw.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current INTEGER NOT NULL,
      app_version TEXT NOT NULL,
      migrated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      hash TEXT NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      status TEXT NOT NULL
    );
  `)
  const row = raw.prepare('SELECT current FROM schema_version WHERE id = 1').get() as
    | { current: number }
    | undefined
  if (!row) {
    raw
      .prepare(
        'INSERT INTO schema_version (id, current, app_version, migrated_at) VALUES (1, 0, ?, ?)'
      )
      .run(app.getVersion(), Date.now())
  }
}

function loadMigrations(): MigrationFile[] {
  const entries = Object.entries(migrationModules)
  const files: MigrationFile[] = []
  for (const [path, sql] of entries) {
    const filename = path.split('/').pop() ?? path
    const matched = filename.match(/^(\d{4})_(.+)\.sql$/)
    if (!matched) continue
    const version = Number(matched[1])
    const name = matched[2]!
    const hash = createHash('sha256').update(sql).digest('hex')
    files.push({ version, name, sql, hash })
  }
  return files.sort((a, b) => a.version - b.version)
}

export function getCurrentSchemaVersion(): number {
  const raw = getRawDb()
  const row = raw.prepare('SELECT current FROM schema_version WHERE id = 1').get() as
    | { current: number }
    | undefined
  return row?.current ?? 0
}

/** Highest migration version bundled with this app build. */
export function getBundledTargetVersion(): number {
  return loadMigrations().reduce((max, m) => Math.max(max, m.version), 0)
}

function backupDb(version: number): string {
  const userData = app.getPath('userData')
  const backupDir = join(userData, 'backups', 'pre-migration')
  mkdirSync(backupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const destPath = join(backupDir, `pos.sqlite.bak.v${version}.${ts}`)
  const dbPath = join(userData, 'pos.sqlite')
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, destPath)
    const wal = `${dbPath}-wal`
    const shm = `${dbPath}-shm`
    if (existsSync(wal)) copyFileSync(wal, `${destPath}-wal`)
    if (existsSync(shm)) copyFileSync(shm, `${destPath}-shm`)
  }
  return destPath
}

function restoreBackup(backupPath: string): void {
  const userData = app.getPath('userData')
  const dbPath = join(userData, 'pos.sqlite')
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, dbPath)
    const wal = `${backupPath}-wal`
    const shm = `${backupPath}-shm`
    if (existsSync(wal)) copyFileSync(wal, `${dbPath}-wal`)
    if (existsSync(shm)) copyFileSync(shm, `${dbPath}-shm`)
  }
}

export async function runMigrations(onProgress?: ProgressCb): Promise<void> {
  openDb()
  ensureMetaTables()

  const migrations = loadMigrations()
  const target = migrations.reduce((max, m) => Math.max(max, m.version), 0)
  const current = getCurrentSchemaVersion()

  logger.info({ current, target, count: migrations.length }, 'migrator: status')

  if (current === target) {
    onProgress?.({ phase: 'done', current, target, message: 'up-to-date' })
    return
  }

  if (current > target) {
    onProgress?.({
      phase: 'downgrade-detected',
      current,
      target,
      message: `DB at v${current}, app bundles v${target}. Refusing to start.`
    })
    throw new Error(`schema downgrade detected: db=${current} app=${target}`)
  }

  const pending = migrations.filter((m) => m.version > current)
  onProgress?.({ phase: 'backup', current, target, message: 'creating pre-migration backup' })
  const backupPath = backupDb(current)
  logger.info({ backupPath }, 'migrator: backup created')

  const raw = getRawDb()
  for (const m of pending) {
    onProgress?.({
      phase: 'migrating',
      current: m.version,
      target,
      message: `migrating to v${m.version}: ${m.name}`
    })

    try {
      raw.exec('BEGIN IMMEDIATE')
      raw
        .prepare(
          'INSERT OR REPLACE INTO schema_migrations (version, name, hash, started_at, status) VALUES (?, ?, ?, ?, ?)'
        )
        .run(m.version, m.name, m.hash, Date.now(), 'running')
      raw.exec(m.sql)
      raw
        .prepare(
          'UPDATE schema_version SET current = ?, app_version = ?, migrated_at = ? WHERE id = 1'
        )
        .run(m.version, app.getVersion(), Date.now())
      raw
        .prepare('UPDATE schema_migrations SET finished_at = ?, status = ? WHERE version = ?')
        .run(Date.now(), 'done', m.version)
      raw.exec('COMMIT')
      logger.info({ version: m.version, name: m.name }, 'migrator: applied')
    } catch (e) {
      try {
        raw.exec('ROLLBACK')
      } catch {
        // ignore
      }
      logger.error({ err: e, version: m.version }, 'migrator: failed, restoring backup')
      raw.close()
      restoreBackup(backupPath)
      onProgress?.({
        phase: 'failed',
        current: m.version,
        target,
        message: `migration v${m.version} failed; DB restored to v${current}`
      })
      throw e
    }
  }

  onProgress?.({ phase: 'done', current: target, target, message: 'all migrations applied' })
}
