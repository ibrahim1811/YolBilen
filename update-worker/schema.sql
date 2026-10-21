CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT,
  stack TEXT,
  user_note TEXT,
  app_version TEXT,
  update_id TEXT,
  device TEXT,
  uid TEXT,
  logs TEXT,
  context TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at);
