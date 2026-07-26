import { app } from 'electron'
import { join, resolve, basename, sep } from 'node:path'
import { mkdirSync, existsSync, statSync, readdirSync, copyFileSync, rmSync } from 'node:fs'
import { getRawDb, getDbPath, closeDb } from '@main/infrastructure/db/client'
import { getCurrentSchemaVersion, getBundledTargetVersion } from '@main/infrastructure/db/migrator'
import { logger } from '@main/logger'

export type BackupKind = 'daily' | 'manual' | 'pre-migration'

export type BackupEntry = {
  name: string
  kind: BackupKind
  path: string
  sizeBytes: number
  createdAt: number
  schemaVersion: number | null
}

export class BackupError extends Error {
  constructor(
    public code: 'BACKUP_FAILED' | 'BACKUP_NOT_FOUND' | 'BACKUP_PATH_INVALID' | 'BACKUP_TOO_NEW',
    message: string
  ) {
    super(message)
  }
}

const DAILY_RETENTION_DAYS = 14
const DAY_MS = 86_400_000

const SUBDIR: Record<BackupKind, string> = {
  daily: 'daily',
  manual: 'manual',
  'pre-migration': 'pre-migration'
}

function backupsRoot(): string {
  const dir = join(app.getPath('userData'), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function kindDir(kind: BackupKind): string {
  const dir = join(backupsRoot(), SUBDIR[kind])
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Parse a schema version out of a backup filename (…v12…) or null. */
function parseSchemaVersion(name: string): number | null {
  const m = name.match(/\.v(\d+)[.\-_]/i)
  return m ? Number(m[1]) : null
}

/**
 * Create a WAL-safe backup using SQLite's Online Backup API (better-sqlite3
 * `.backup()`), which yields a single consistent file — no sidecar wal/shm.
 */
export async function createBackup(kind: 'daily' | 'manual'): Promise<BackupEntry> {
  const version = getCurrentSchemaVersion()
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `pos.v${version}.${ts}.sqlite`
  const dest = join(kindDir(kind), name)

  try {
    await getRawDb().backup(dest)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error({ err: e, dest }, 'backup failed')
    throw new BackupError('BACKUP_FAILED', `no se pudo crear el respaldo: ${msg}`)
  }

  const st = statSync(dest)
  logger.info({ dest, sizeBytes: st.size, kind }, 'backup created')
  return {
    name,
    kind,
    path: dest,
    sizeBytes: st.size,
    createdAt: st.mtimeMs,
    schemaVersion: version
  }
}

/** All backups across daily / manual / pre-migration, newest first. */
export function listBackups(): BackupEntry[] {
  const kinds: BackupKind[] = ['daily', 'manual', 'pre-migration']
  const out: BackupEntry[] = []
  for (const kind of kinds) {
    const dir = kindDir(kind)
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      // Skip WAL/SHM sidecars written by the migrator's file-copy backups.
      if (name.endsWith('-wal') || name.endsWith('-shm')) continue
      const path = join(dir, name)
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(path)
      } catch {
        continue
      }
      if (!st.isFile()) continue
      out.push({
        name,
        kind,
        path,
        sizeBytes: st.size,
        createdAt: st.mtimeMs,
        schemaVersion: parseSchemaVersion(name)
      })
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** Delete daily backups older than the retention window. */
export function pruneDailyBackups(retentionDays = DAILY_RETENTION_DAYS): number {
  const cutoff = Date.now() - retentionDays * DAY_MS
  let removed = 0
  for (const b of listBackups()) {
    if (b.kind !== 'daily') continue
    if (b.createdAt >= cutoff) continue
    try {
      rmSync(b.path, { force: true })
      removed++
    } catch (e) {
      logger.warn({ err: e, path: b.path }, 'prune: could not delete backup')
    }
  }
  if (removed > 0) logger.info({ removed, retentionDays }, 'pruned daily backups')
  return removed
}

/**
 * Validate a backup and schedule an app-restart restore. The DB file is locked
 * while the app runs, so we close the DB, swap the file, and relaunch. Returns
 * once validated; the actual swap happens on a short timer so the IPC Result
 * flushes to the renderer first.
 */
export function restoreFromBackup(backupPath: string): void {
  const root = resolve(backupsRoot())
  const target = resolve(backupPath)
  // Prevent path traversal / restoring an arbitrary file from outside the vault.
  if (target !== root && !target.startsWith(root + sep)) {
    throw new BackupError('BACKUP_PATH_INVALID', 'ruta de respaldo fuera del directorio permitido')
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new BackupError('BACKUP_NOT_FOUND', 'el respaldo no existe')
  }
  const backupVersion = parseSchemaVersion(basename(target))
  const bundled = getBundledTargetVersion()
  if (backupVersion !== null && backupVersion > bundled) {
    throw new BackupError(
      'BACKUP_TOO_NEW',
      `respaldo en v${backupVersion}; esta app soporta hasta v${bundled}. Actualiza la app antes de restaurar.`
    )
  }
  logger.warn({ backupPath: target, backupVersion }, 'restore scheduled — app will relaunch')
  setTimeout(() => doRestore(target), 250)
}

function doRestore(backupPath: string): void {
  const dbPath = getDbPath()
  try {
    closeDb()
    for (const suf of ['-wal', '-shm']) {
      const p = `${dbPath}${suf}`
      if (existsSync(p)) rmSync(p, { force: true })
    }
    copyFileSync(backupPath, dbPath)
    // Pre-migration backups (file-copy) may carry sidecars; online backups don't.
    for (const suf of ['-wal', '-shm']) {
      const src = `${backupPath}${suf}`
      if (existsSync(src)) copyFileSync(src, `${dbPath}${suf}`)
    }
    logger.warn({ backupPath, dbPath }, 'restore applied — relaunching')
  } catch (e) {
    logger.fatal({ err: e, backupPath }, 'restore failed mid-swap')
  } finally {
    app.relaunch()
    app.exit(0)
  }
}
