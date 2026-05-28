-- Sprint 1.B+: Venezuelan fiscal data.
-- suppliers.tax_id is reused to store the RIF. Add contributor type.
-- Store fiscal profile (RIF, razón social, dirección, tipo) lives in settings (no schema change).

ALTER TABLE suppliers ADD COLUMN fiscal_type TEXT;
