-- Sprint 1.B+: configurable low-stock thresholds.
-- NULL means "inherit" (product inherits category, category inherits global setting).

ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER;
ALTER TABLE categories ADD COLUMN low_stock_threshold INTEGER;
