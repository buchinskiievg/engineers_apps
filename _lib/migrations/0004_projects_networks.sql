-- Projects & network schemes — for the CAD-style schema editor.

CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'grid',  -- 'grid' | 'substation' | 'renewable'
  description   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS network_schemes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'grid',
  schema_json   TEXT NOT NULL DEFAULT '{}',   -- canvas state: {elements:[...], links:[...]}
  results_json  TEXT,                          -- last calculation results
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schemes_proj ON network_schemes(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS network_calc_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_id     INTEGER NOT NULL,
  calc_kind     TEXT NOT NULL,                 -- 'voltage_drop' | 'short_circuit' | ...
  params_json   TEXT,
  result_json   TEXT,
  status        TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed
  error         TEXT,
  created_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_scheme ON network_calc_runs(scheme_id, created_at DESC);

CREATE TABLE IF NOT EXISTS network_reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_id     INTEGER NOT NULL,
  name          TEXT NOT NULL,
  format        TEXT NOT NULL DEFAULT 'html',  -- 'html' | 'docx' | 'pdf'
  file_url      TEXT,                          -- R2 key when saved
  content       TEXT,                          -- inline HTML for quick preview
  generated_at  INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_scheme ON network_reports(scheme_id, generated_at DESC);
