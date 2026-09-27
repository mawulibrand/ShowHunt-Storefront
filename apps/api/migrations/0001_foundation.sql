-- Commerce tables arrive with their vertical slices and invariant tests.
CREATE TABLE platform_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_metadata (key, value) VALUES ('schema_phase', 'foundation');
