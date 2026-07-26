import { z } from 'zod'

const backupEntry = z.object({
  name: z.string(),
  kind: z.enum(['daily', 'manual', 'pre-migration']),
  path: z.string(),
  sizeBytes: z.number(),
  createdAt: z.number(),
  schemaVersion: z.number().nullable()
})

export const backupContract = {
  list: {
    kind: 'request',
    channel: 'backup.list',
    input: z.object({ sessionId: z.string() }),
    output: z.object({ backups: z.array(backupEntry) }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  create: {
    kind: 'request',
    channel: 'backup.create',
    input: z.object({ sessionId: z.string() }),
    output: z.object({ backup: backupEntry }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'BACKUP_FAILED'] as const
  },
  restore: {
    kind: 'request',
    channel: 'backup.restore',
    input: z.object({ sessionId: z.string(), path: z.string() }),
    output: z.object({ restarting: z.boolean() }),
    errors: [
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'BACKUP_NOT_FOUND',
      'BACKUP_PATH_INVALID',
      'BACKUP_TOO_NEW'
    ] as const
  }
} as const

export type BackupEntryDTO = z.infer<typeof backupEntry>
