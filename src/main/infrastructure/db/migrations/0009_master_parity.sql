-- Alinea campos con el máster AgroOne (plan §31): producto.unidadMedida,
-- categoria.simbolo, cliente.descuento_especial. Ver memoria de sesión para
-- el resto de campos evaluados y dejados fuera a propósito.

ALTER TABLE products ADD COLUMN unit_of_measure TEXT NOT NULL DEFAULT 'UNIDAD';
ALTER TABLE categories ADD COLUMN icon TEXT;
ALTER TABLE customers ADD COLUMN special_discount_bp INTEGER NOT NULL DEFAULT 0;
