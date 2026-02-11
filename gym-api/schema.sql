PRAGMA foreign_keys=ON;

-- Each start/end will create/update one row.
-- session_id will be a random id we generate (client or API).
CREATE TABLE IF NOT EXISTS gym_sessions (
  session_id   TEXT PRIMARY KEY,
  started_at   TEXT NOT NULL,   -- ISO8601 string
  ended_at     TEXT,            -- ISO8601 string
  duration_sec INTEGER,         -- computed when ending
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_gym_sessions_started_at ON gym_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_gym_sessions_ended_at   ON gym_sessions(ended_at);
