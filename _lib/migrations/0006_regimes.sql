-- 0006 — operational regimes (switching states) hung off a network.
--
-- Concept:
--   A "network" is the BASE MODEL — the full schematic the engineer
--   draws.  Every change to it (added equipment, edited params,
--   reroute, …) is the source of truth for ALL regimes hanging off it.
--
--   A "regime" is a calculation case that = base + a tiny delta_json
--   describing which circuit breakers are OPEN in this case.  When the
--   base model changes, every regime automatically reflects those
--   changes (the only thing the regime carries is its own switching
--   state).
--
--   delta_json shape:
--     { connOpens: { "<connId>": { from?: bool, to?: bool } } }
--
--   last_calc_json caches the most recent calc result for this regime.
CREATE TABLE IF NOT EXISTS regimes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  network_id      INTEGER NOT NULL,
  name            TEXT    NOT NULL,
  delta_json      TEXT    NOT NULL DEFAULT '{}',
  last_calc_json  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (network_id) REFERENCES network_schemes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_regimes_network ON regimes(network_id);
