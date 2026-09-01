ALTER TABLE users ADD COLUMN register_id TEXT;
ALTER TABLE users ADD COLUMN register_name TEXT;

-- Conserva la identidad historica de Caja 1 para el administrador de esta
-- instalacion y separa al cajero como Caja 2 dentro de la misma tienda.
UPDATE users
SET register_id = (SELECT json_extract(value, '$.nodeId') FROM settings WHERE key = 'device.identity'),
    register_name = 'Caja 1',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE username = 'admin';

UPDATE users
SET register_id = (SELECT json_extract(value, '$.nodeId') || ':register:2' FROM settings WHERE key = 'device.identity'),
    register_name = 'Caja 2',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE username = 'cajero';
