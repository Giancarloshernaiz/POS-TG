CREATE TABLE sale_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  payload TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX sale_drafts_updated_idx ON sale_drafts(updated_at);
CREATE INDEX sale_drafts_user_idx ON sale_drafts(user_id);
