-- Sprint 1.B: catalog (categories, products, stock_levels, serials) + purchasing (suppliers, POs, receipts).
-- Money amounts are INTEGER cents. Tax rates are basis points (e.g. 1600 = 16%).

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX categories_name_parent_idx ON categories(parent_id, name);
CREATE INDEX categories_parent_idx ON categories(parent_id);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id TEXT REFERENCES categories(id),
  base_price INTEGER NOT NULL,          -- cents
  cost_price INTEGER,                   -- cents (nullable)
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,  -- basis points
  tracks_serial INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX products_sku_idx ON products(sku);
CREATE INDEX products_barcode_idx ON products(barcode);
CREATE INDEX products_category_active_idx ON products(category_id, active);
CREATE INDEX products_name_idx ON products(name);

CREATE TABLE stock_levels (
  product_id TEXT NOT NULL REFERENCES products(id),
  location_id TEXT NOT NULL DEFAULT 'main',
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (product_id, location_id)
);
CREATE INDEX stock_levels_low_idx ON stock_levels(quantity);

CREATE TABLE serials (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  imei TEXT NOT NULL,
  status TEXT NOT NULL,                 -- 'available'|'reserved'|'sold'|'returned'|'defective'
  current_sale_id TEXT,
  location_id TEXT NOT NULL DEFAULT 'main',
  received_at INTEGER NOT NULL,
  received_via TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX serials_imei_idx ON serials(imei);
CREATE INDEX serials_product_status_idx ON serials(product_id, status);
CREATE INDEX serials_status_location_idx ON serials(status, location_id);
CREATE INDEX serials_sale_idx ON serials(current_sale_id);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX suppliers_name_idx ON suppliers(name);

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL,                 -- 'draft'|'submitted'|'partial'|'received'|'closed'|'cancelled'
  expected_at INTEGER,
  notes TEXT,
  total_amount INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  submitted_at INTEGER,
  received_at INTEGER,
  closed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX po_number_idx ON purchase_orders(number);
CREATE INDEX po_supplier_status_idx ON purchase_orders(supplier_id, status);
CREATE INDEX po_status_idx ON purchase_orders(status);
CREATE INDEX po_created_idx ON purchase_orders(created_at);

CREATE TABLE po_lines (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  qty_ordered INTEGER NOT NULL,
  qty_received INTEGER NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL,
  line_total INTEGER NOT NULL
);
CREATE INDEX po_lines_po_idx ON po_lines(po_id);
CREATE INDEX po_lines_product_idx ON po_lines(product_id);

CREATE TABLE goods_receipts (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id),
  received_by TEXT NOT NULL REFERENCES users(id),
  ts INTEGER NOT NULL,
  notes TEXT
);
CREATE UNIQUE INDEX gr_number_idx ON goods_receipts(number);
CREATE INDEX gr_po_idx ON goods_receipts(po_id);
CREATE INDEX gr_ts_idx ON goods_receipts(ts);

CREATE TABLE goods_receipt_lines (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_line_id TEXT NOT NULL REFERENCES po_lines(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL
);
CREATE INDEX grl_receipt_idx ON goods_receipt_lines(receipt_id);
CREATE INDEX grl_poline_idx ON goods_receipt_lines(po_line_id);
