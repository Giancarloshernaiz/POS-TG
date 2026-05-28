import { ulid } from 'ulid'
import { getDb } from '@main/infrastructure/db/client'
import { auditLog } from '@main/infrastructure/db/schema'

export type AuditEntry = {
  userId?: string | undefined
  action: string
  targetType?: string | undefined
  targetId?: string | undefined
  before?: unknown
  after?: unknown
  ip?: string | undefined
  nodeId?: string | undefined
}

export async function audit(entry: AuditEntry): Promise<void> {
  const db = getDb()
  await db
    .insert(auditLog)
    .values({
      id: ulid(),
      userId: entry.userId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ts: Date.now(),
      ip: entry.ip ?? null,
      nodeId: entry.nodeId ?? null
    })
    .run()
}
