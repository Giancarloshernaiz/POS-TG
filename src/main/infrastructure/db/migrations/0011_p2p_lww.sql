-- Fase 2 / Capa A: LWW (last-write-wins) por HLC para catálogo autoría-POS
-- (§8.4). Solo aplica a filas sin agroId (creadas localmente, ej. alta rápida
-- de producto/cliente en el POS) — una vez una fila tiene agroId, AgroOne
-- (Capa B) es quien converge sus campos vía pull periódico.

ALTER TABLE products ADD COLUMN lww_hlc TEXT;
ALTER TABLE customers ADD COLUMN lww_hlc TEXT;
ALTER TABLE categories ADD COLUMN lww_hlc TEXT;
