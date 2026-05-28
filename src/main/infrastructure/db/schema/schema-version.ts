import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

export const schemaVersion = sqliteTable('schema_version', {
  id: integer('id').primaryKey(),
  current: integer('current').notNull(),
  appVersion: text('app_version').notNull(),
  migratedAt: integer('migrated_at').notNull()
})

export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  name: text('name').notNull(),
  hash: text('hash').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  status: text('status', {
    enum: ['running', 'done', 'failed', 'rolled_back']
  }).notNull()
})
