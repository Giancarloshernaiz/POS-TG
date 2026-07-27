-- Fase 2 / Capa A: cuarentena de conflictos de serial (§9.1). Dos cajas
-- pueden vender el mismo IMEI simultáneamente offline; el HLC determina el
-- ganador, pero el perdedor requiere revisión humana (nunca se auto-anula
-- una venta con dinero ya cobrado).

ALTER TABLE serials ADD COLUMN lww_hlc TEXT;

CREATE TABLE serial_conflicts (
  id TEXT PRIMARY KEY,
  serial_id TEXT NOT NULL REFERENCES serials(id),
  imei TEXT NOT NULL,
  local_sale_id TEXT,
  local_sale_number TEXT,
  winning_node_id TEXT NOT NULL,
  winning_hlc TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  resolved_at INTEGER,
  resolution_notes TEXT
);
CREATE INDEX serial_conflicts_resolved_idx ON serial_conflicts(resolved);
