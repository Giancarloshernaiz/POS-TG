-- Fase 2 / Capa B: máquina de estados de idempotencia para el push de ventas
-- hacia AgroOne (§31.7). AgroOne no es idempotente y crea la venta en 2 pasos
-- no atómicos, así que el POS lleva su propio registro de progreso por venta.

CREATE TABLE sync_state (
  sale_id TEXT PRIMARY KEY REFERENCES sales(id),
  phase TEXT NOT NULL DEFAULT 'NONE',        -- NONE | HEADER_DONE | LINES_DONE | ERROR
  agro_sale_id INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX sync_state_phase_idx ON sync_state(phase);
