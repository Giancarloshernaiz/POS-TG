import { requirePermission } from '@main/auth/guard'
import { createBackup, listBackups, restoreFromBackup } from '@main/backup/backup.service'
import { audit } from '@main/audit/logger'
import { PERMISSIONS } from '@shared/auth/permissions'
import type { BackupEntryDTO } from '@shared/ipc/contracts/backup'

export const backupHandlers = {
  async list(input: { sessionId: string }): Promise<{ backups: BackupEntryDTO[] }> {
    requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    return { backups: listBackups() }
  },

  async create(input: { sessionId: string }): Promise<{ backup: BackupEntryDTO }> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    const backup = await createBackup('manual')
    await audit({
      userId: session.userId,
      action: 'backup.create',
      after: { name: backup.name, sizeBytes: backup.sizeBytes }
    })
    return { backup }
  },

  async restore(input: { sessionId: string; path: string }): Promise<{ restarting: boolean }> {
    const session = requirePermission(input.sessionId, PERMISSIONS.SETTINGS_MANAGE)
    restoreFromBackup(input.path)
    await audit({
      userId: session.userId,
      action: 'backup.restore',
      after: { path: input.path }
    })
    return { restarting: true }
  }
}
