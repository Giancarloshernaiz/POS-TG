-- Rastreo por seriales/IMEI desactivado: el inventario pasa a manejarse solo
-- por unidades (decisión operativa, 2026-08-03).
--
-- No se borran las tablas `serials` ni `serial_conflicts`, ni la columna
-- `products.tracks_serial`: la desactivación es reversible y destruir los
-- seriales ya capturados sería irrecuperable. Lo que se hace es apagar el
-- flag en todos los productos, para que el flujo de venta deje de exigir
-- serial — si no, un producto marcado quedaría imposible de vender: el
-- checkout pediría un serial que la interfaz ya no ofrece cómo elegir.
UPDATE products SET tracks_serial = 0 WHERE tracks_serial = 1;
