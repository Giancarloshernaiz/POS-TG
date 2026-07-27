-- Fase 2 / Capa B: mapeo de IDs con el máster AgroOne (§31.4).
-- AgroOne usa IDs Int autoincrement; el POS usa ULID. Guardamos el id de
-- AgroOne por entidad para reconciliar en pulls y referenciarlo en pushes.
-- SQLite permite múltiples NULL en índice UNIQUE (filas locales sin vincular).

ALTER TABLE products ADD COLUMN agro_id INTEGER;
ALTER TABLE categories ADD COLUMN agro_id INTEGER;
ALTER TABLE customers ADD COLUMN agro_id INTEGER;

CREATE UNIQUE INDEX products_agro_idx ON products(agro_id);
CREATE UNIQUE INDEX categories_agro_idx ON categories(agro_id);
CREATE UNIQUE INDEX customers_agro_idx ON customers(agro_id);
