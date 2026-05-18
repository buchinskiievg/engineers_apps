-- Site-wide settings (KV store). Admin can edit; Worker enforces.

CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'string',  -- 'string' | 'int' | 'json'
  description TEXT,
  updated_at  INTEGER NOT NULL
);

INSERT OR IGNORE INTO site_settings (key, value, kind, description, updated_at) VALUES
  ('free_max_projects',    '1', 'int',
   'Max number of projects a free-tier user can have. 0 = unlimited.', unixepoch()*1000),
  ('free_max_calc_runs',   '20','int',
   'Max number of calculation runs per network for a free-tier user. 0 = unlimited.', unixepoch()*1000),
  ('free_allowed_calcs',   '["voltage_drop"]','json',
   'Calculation kinds available for free. JSON array of strings. Allowed values: voltage_drop, short_circuit, ampacity, grounding, protection.', unixepoch()*1000),
  ('free_max_elements',    '20','int',
   'Max elements (buses + cables + tx + load + gen) in a network for free users. 0 = unlimited.', unixepoch()*1000);
