-- Fase 2 / Capa A: event log + outbox + estado de peers para el motor P2P
-- entre cajas de una misma tienda (plan §8). Cada caja mantiene su propio
-- log append-only; el outbox desacopla la escritura local del envío, el
-- estado de peers trackea últimos vistos para el banner "Caja N desconectada".

CREATE TABLE events (
  id TEXT PRIMARY KEY,               -- ULID, clave de idempotencia
  hlc TEXT NOT NULL,                 -- '<ms>-<counter>-<nodeId>'
  node_id TEXT NOT NULL,             -- caja que originó el evento
  store_id INTEGER NOT NULL,
  aggregate_type TEXT NOT NULL,      -- 'sale' | 'stock_level' | 'serial' | ...
  aggregate_id TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'sale.completed', 'stock.decremented', ...
  payload TEXT NOT NULL,             -- JSON
  origin_ts INTEGER NOT NULL,
  applied_at INTEGER NOT NULL,
  prev_hash TEXT,
  hash TEXT
);
CREATE INDEX events_hlc_idx ON events(hlc);
CREATE INDEX events_aggregate_idx ON events(aggregate_type, aggregate_id);
CREATE INDEX events_node_idx ON events(node_id);

CREATE TABLE outbox (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|delivered
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER
);
CREATE INDEX outbox_status_idx ON outbox(status);

CREATE TABLE peer_state (
  node_id TEXT PRIMARY KEY,
  node_label TEXT,
  last_seen_hlc TEXT,
  last_connected_at INTEGER,
  status TEXT NOT NULL DEFAULT 'offline'   -- online|offline
);
