ALTER TABLE cash_sessions ADD COLUMN opening_ves REAL NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN closing_ves REAL;
ALTER TABLE cash_sessions ADD COLUMN expected_ves REAL;
ALTER TABLE cash_sessions ADD COLUMN over_short_ves REAL;

ALTER TABLE cash_movements ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE cash_movements ADD COLUMN amount_original REAL;
