import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sales } from './sales'

// Progreso de push hacia Galas Cloud por venta (§31.7). NONE = no intentado aún;
// HEADER_DONE = cabecera creada en Galas Cloud (agroSaleId conocido, líneas pendientes);
// LINES_DONE = sincronización completa; ERROR = falló, reintentable.
export const syncState = sqliteTable(
  'sync_state',
  {
    saleId: text('sale_id')
      .primaryKey()
      .references(() => sales.id),
    phase: text('phase', {
      enum: ['NONE', 'HEADER_DONE', 'LINES_DONE', 'ERROR']
    })
      .notNull()
      .default('NONE'),
    agroSaleId: integer('agro_sale_id'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [index('sync_state_phase_idx').on(t.phase)]
)
