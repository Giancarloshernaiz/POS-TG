import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { getDb } from '@main/infrastructure/db/client'
import { roles, users } from '@main/infrastructure/db/schema'
import { DEFAULT_ROLES, PERMISSIONS } from '@shared/auth/permissions'
import { hashPassword } from './password'
import { logger } from '@main/logger'

const DEFAULT_ADMIN_USERNAME = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'admin1234'
const DEFAULT_ADMIN_FULLNAME = 'Administrador'

export async function seedAuthIfNeeded(): Promise<void> {
  const db = getDb()

  const existingRoles = await db.select({ name: roles.name }).from(roles).all()
  const existingNames = new Set(existingRoles.map((r) => r.name))

  const now = Date.now()
  const rolesToInsert: (typeof roles.$inferInsert)[] = []
  for (const [, def] of Object.entries(DEFAULT_ROLES)) {
    if (existingNames.has(def.name)) continue
    rolesToInsert.push({
      id: ulid(),
      name: def.name,
      description: def.description,
      permissions: [...def.permissions],
      systemRole: true,
      createdAt: now,
      updatedAt: now
    })
  }
  if (rolesToInsert.length > 0) {
    await db.insert(roles).values(rolesToInsert).run()
    logger.info({ count: rolesToInsert.length }, 'seeded default roles')
  }

  // El cierre de caja requiere autorización presencial de gerente/admin. Se
  // corrigen también instalaciones existentes donde el rol cajero la heredó.
  const cashierRole = await db.select().from(roles).where(eq(roles.name, 'cashier')).get()
  if (cashierRole?.permissions.includes(PERMISSIONS.CASH_CLOSE)) {
    await db
      .update(roles)
      .set({
        permissions: cashierRole.permissions.filter(
          (permission) => permission !== PERMISSIONS.CASH_CLOSE
        ),
        updatedAt: now
      })
      .where(eq(roles.id, cashierRole.id))
      .run()
  }

  const userCount = await db.$count(users)
  if (userCount > 0) return

  const adminRole = await db.select().from(roles).where(eq(roles.name, 'admin')).get()
  if (!adminRole) throw new Error('admin role missing after seed')

  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD)
  await db
    .insert(users)
    .values({
      id: ulid(),
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash,
      fullName: DEFAULT_ADMIN_FULLNAME,
      roleId: adminRole.id,
      active: true,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now
    })
    .run()

  logger.warn(
    { username: DEFAULT_ADMIN_USERNAME },
    'seeded default admin user — CHANGE PASSWORD ON FIRST LOGIN'
  )
}
