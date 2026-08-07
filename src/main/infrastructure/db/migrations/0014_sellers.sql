-- Vendedores (comisionistas) de la tienda.
--
-- Los define AgroOne por tienda (`Vendedores.tienda_id`) y bajan por pull; la
-- caja solo los elige al cobrar. `RegistroVenta.vendedor_id` del máster ya
-- existía y `postSaleFull` ya aceptaba `vendedorAgroId` — faltaba que el POS
-- supiera qué vendedores hay y a cuál atribuir cada venta.
CREATE TABLE IF NOT EXISTS sellers (
  id          TEXT PRIMARY KEY,
  agro_id     INTEGER NOT NULL,
  nombre      TEXT NOT NULL,
  apellido    TEXT NOT NULL DEFAULT '',
  cedula      TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sellers_agro_id_idx ON sellers (agro_id);
CREATE INDEX IF NOT EXISTS sellers_active_idx ON sellers (active);

-- Vendedor atribuido a la venta. Nullable: no toda venta tiene comisionista.
ALTER TABLE sales ADD COLUMN seller_id TEXT REFERENCES sellers (id);
CREATE INDEX IF NOT EXISTS sales_seller_idx ON sales (seller_id);
