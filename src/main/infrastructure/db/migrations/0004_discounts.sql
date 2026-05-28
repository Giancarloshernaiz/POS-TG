-- Sprint 1.B+: standing discounts per product and per category.
-- discount_type: 'none' | 'percent' | 'amount'
-- discount_value: percent in basis points (1000 = 10%) OR fixed amount in cents.
-- Resolution: product discount overrides category discount (most specific wins).
-- Subcategories already supported via categories.parent_id (no schema change needed).

ALTER TABLE products ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE products ADD COLUMN discount_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE categories ADD COLUMN discount_value INTEGER NOT NULL DEFAULT 0;
