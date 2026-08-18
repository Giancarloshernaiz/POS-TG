ALTER TABLE sales ADD COLUMN return_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN returned_at INTEGER;

CREATE INDEX sales_returned_at_idx ON sales(returned_at);
