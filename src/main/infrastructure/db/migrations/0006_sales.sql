-- Sprint 1.C: customers + sales + payments + AR.
-- Money in INTEGER cents USD (canonical). rate_used snapshots BCV rate at sale time.
-- Payment methods: cash_ves | cash_usd | card | pago_movil | transfer | zelle | credit
-- is_divisa flags foreign-currency payments subject to IGTF (3%).

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  doc_type TEXT,                       -- 'V'|'E'|'J'|'P'|'G'
  doc_id TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  credit_limit INTEGER NOT NULL DEFAULT 0,    -- cents USD
  current_balance INTEGER NOT NULL DEFAULT 0, -- cents USD, positive = customer owes store
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX customers_name_idx ON customers(name);
CREATE INDEX customers_doc_idx ON customers(doc_type, doc_id);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id),
  status TEXT NOT NULL,                -- 'completed'|'voided'
  subtotal INTEGER NOT NULL,           -- after line discounts, before tax
  discount_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  igtf_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  rate_used REAL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  voided_at INTEGER,
  voided_by TEXT REFERENCES users(id)
);
CREATE UNIQUE INDEX sales_number_idx ON sales(number);
CREATE INDEX sales_session_idx ON sales(cash_session_id);
CREATE INDEX sales_customer_idx ON sales(customer_id);
CREATE INDEX sales_created_idx ON sales(created_at);
CREATE INDEX sales_status_idx ON sales(status);

CREATE TABLE sale_lines (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  serial_id TEXT REFERENCES serials(id),
  sku TEXT NOT NULL,
  description TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,         -- base price cents USD
  discount_amount INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  line_subtotal INTEGER NOT NULL,      -- unit_price*qty - discount
  line_tax INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL
);
CREATE INDEX sale_lines_sale_idx ON sale_lines(sale_id);
CREATE INDEX sale_lines_product_idx ON sale_lines(product_id);
CREATE INDEX sale_lines_serial_idx ON sale_lines(serial_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  currency TEXT NOT NULL,              -- 'USD'|'VES'
  is_divisa INTEGER NOT NULL DEFAULT 0,
  amount_usd INTEGER NOT NULL,         -- normalized USD cents
  amount_original REAL,                -- amount in payment currency
  igtf INTEGER NOT NULL DEFAULT 0,     -- IGTF cents USD on this payment
  reference TEXT,
  captured_at INTEGER NOT NULL
);
CREATE INDEX payments_sale_idx ON payments(sale_id);
CREATE INDEX payments_method_idx ON payments(method);

CREATE TABLE ar_movements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  sale_id TEXT REFERENCES sales(id),
  type TEXT NOT NULL,                  -- 'charge'|'payment'|'adjustment'
  amount INTEGER NOT NULL,             -- cents USD, positive = charge (increases balance)
  notes TEXT,
  ts INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id)
);
CREATE INDEX ar_customer_idx ON ar_movements(customer_id);
CREATE INDEX ar_sale_idx ON ar_movements(sale_id);
CREATE INDEX ar_ts_idx ON ar_movements(ts);
