-- Sprint 1.A: auth (roles, users), cash sessions/movements, audit log, settings.
-- Products/inventory/sales come in 0002+.

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT NOT NULL,            -- JSON array of permission strings
  system_role INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX users_username_idx ON users(username);
CREATE INDEX users_role_idx ON users(role_id);

CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  opening_amount INTEGER NOT NULL,
  closing_amount INTEGER,
  expected_amount INTEGER,
  over_short_amount INTEGER,
  status TEXT NOT NULL,                 -- 'open'|'closed'|'reconciled'
  notes TEXT
);

CREATE INDEX cash_sessions_user_idx ON cash_sessions(user_id);
CREATE INDEX cash_sessions_status_idx ON cash_sessions(status);
CREATE INDEX cash_sessions_opened_idx ON cash_sessions(opened_at);

CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES cash_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,                   -- 'sale'|'refund'|'withdrawal'|'deposit'|'adjustment'|'drop'
  amount INTEGER NOT NULL,
  reference TEXT,
  notes TEXT,
  ts INTEGER NOT NULL
);

CREATE INDEX cash_movements_session_idx ON cash_movements(session_id);
CREATE INDEX cash_movements_ts_idx ON cash_movements(ts);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before TEXT,                          -- JSON
  after TEXT,                           -- JSON
  ts INTEGER NOT NULL,
  ip TEXT,
  node_id TEXT
);

CREATE INDEX audit_log_user_idx ON audit_log(user_id);
CREATE INDEX audit_log_action_idx ON audit_log(action);
CREATE INDEX audit_log_ts_idx ON audit_log(ts);
CREATE INDEX audit_log_target_idx ON audit_log(target_type, target_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                  -- JSON
  updated_at INTEGER NOT NULL
);
