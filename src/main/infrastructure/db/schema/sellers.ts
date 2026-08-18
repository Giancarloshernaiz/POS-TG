import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Vendedores (comisionistas) de la tienda. Los define Galas Cloud y bajan por pull:
// el POS no los crea ni los edita, solo elige uno al cobrar.
export const sellers = sqliteTable(
  'sellers',
  {
    id: text('id').primaryKey(),
    agroId: integer('agro_id').notNull(),
    nombre: text('nombre').notNull(),
    apellido: text('apellido').notNull().default(''),
    cedula: text('cedula').notNull().default(''),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [uniqueIndex('sellers_agro_id_idx').on(t.agroId), index('sellers_active_idx').on(t.active)]
)
