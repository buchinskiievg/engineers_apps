-- ieccalc.com — D1 initial schema
-- Apply with: wrangler d1 execute ieccalc --remote --file=_lib/migrations/0001_init.sql

-- ── USERS / AUTH ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  marketing_optin INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token         TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  purpose       TEXT NOT NULL,           -- 'magic_link' | 'session'
  expires_at    INTEGER NOT NULL,
  consumed_at   INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_email ON auth_tokens(email);

CREATE TABLE IF NOT EXISTS admin_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'super'
  created_at  INTEGER NOT NULL
);

-- ── CATALOG ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calculators (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,        -- '001', '002', ...
  name           TEXT NOT NULL,
  short_desc     TEXT,
  standards      TEXT,
  category       TEXT NOT NULL,               -- 'free' | 'pro'
  tier           TEXT NOT NULL DEFAULT 'active', -- 'active' | 'beta' | 'coming_soon' | 'archived'
  base_url       TEXT NOT NULL,               -- '/001/' relative
  paid_features_json TEXT,                    -- JSON array
  preview_image  TEXT,
  display_order  INTEGER NOT NULL DEFAULT 100,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- ── PRICING ENGINE (data-driven, editable from /admin) ───────────────────
-- A rule fires when the user's cart matches its conditions.
-- match_type:
--   'per_item'        — applies per calculator picked (count = N → price ×N)
--   'bundle_all'      — applies only when cart covers ALL active calculators
--   'bundle_specific' — applies when cart equals exactly calc_ids_json set
--   'count_range'     — applies when count between count_min..count_max
-- period: 'day' | 'month' | 'year' | 'lifetime' (cart's selected period)
CREATE TABLE IF NOT EXISTS pricing_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  match_type     TEXT NOT NULL,
  period         TEXT NOT NULL,
  count_min      INTEGER,
  count_max      INTEGER,
  calc_ids_json  TEXT,
  price_usd      REAL NOT NULL,
  discount_pct   REAL DEFAULT 0,
  ls_variant_id  TEXT,                        -- direct LS variant id if 1-to-1
  badge          TEXT,                        -- 'Most popular', 'Save 24%'
  display_order  INTEGER DEFAULT 100,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- ── ORDERS / LICENSES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  ls_order_id     TEXT UNIQUE,
  ls_event        TEXT,
  amount_usd      REAL,
  currency        TEXT DEFAULT 'USD',
  status          TEXT NOT NULL,              -- 'pending' | 'paid' | 'refunded' | 'failed'
  items_json      TEXT NOT NULL,              -- [{calc_id, period}, ...]
  pricing_rule_id INTEGER,
  created_at      INTEGER NOT NULL,
  paid_at         INTEGER,
  refunded_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS licenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  calc_id         INTEGER NOT NULL,
  order_id        INTEGER,
  period          TEXT NOT NULL,              -- 'day' | 'month' | 'year' | 'lifetime'
  starts_at       INTEGER NOT NULL,
  expires_at      INTEGER,                    -- NULL = lifetime
  revoked         INTEGER NOT NULL DEFAULT 0,
  revoked_reason  TEXT,
  source          TEXT NOT NULL DEFAULT 'purchase', -- 'purchase' | 'gift' | 'promo'
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lic_user ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_lic_calc ON licenses(calc_id);

-- ── LEADS / EMAIL ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,
  source       TEXT,
  calc_slug    TEXT,
  subscribed   INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  UNIQUE(email, source)
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,
  segment_query  TEXT,                        -- e.g. "calc_slug = '003'"
  status         TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'sending' | 'sent'
  sent_at        INTEGER,
  recipients_count INTEGER,
  created_at     INTEGER NOT NULL
);

-- ── CONTENT (articles / blog / case studies) ─────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT,
  body_md      TEXT NOT NULL,
  cover_image  TEXT,
  tags_json    TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  published_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- ── ANALYTICS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  email        TEXT,
  calc_slug    TEXT,
  event_type   TEXT NOT NULL,
  feature      TEXT,
  payload_json TEXT,
  ip_hash      TEXT,
  user_agent   TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_calc ON events(calc_slug, created_at);

-- ── SEED DATA ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO admin_users (email, role, created_at)
VALUES ('buchinskii.evg@gmail.com', 'super', unixepoch()*1000);

INSERT OR IGNORE INTO calculators (slug, name, short_desc, standards, category, tier, base_url, display_order, created_at, updated_at) VALUES
  ('001', 'Voltage Drop — LV & MV up to 33 kV',
   'Multi-feeder, multi-segment voltage drop per IEC 60364-5-52 Annex D (LV) and IEC 60502-2 / IEC 60287 (MV).',
   'IEC 60364-5-52, IEC 60502-2, IEC 60287, IEC 60228, IEC 61089',
   'pro', 'active', '/001/', 10, unixepoch()*1000, unixepoch()*1000),
  ('002', 'Short-Circuit — IEC 60909',
   'Positive/negative/zero sequence Iʺk3, Iʺk2, Iʺk1, peak ip and κ at every busbar.',
   'IEC 60909-0, IEC 60909-1, IEC 60909-4',
   'pro', 'active', '/002/', 20, unixepoch()*1000, unixepoch()*1000),
  ('003', 'Substation Grounding Grid — IEEE 80',
   'Multi-grid sizing per IEEE Std 80-2013 with sketch editor and full Word report.',
   'IEEE 80, IEEE 81, IEC 61936-1',
   'pro', 'active', '/003/', 30, unixepoch()*1000, unixepoch()*1000),
  ('004', 'Cable Ampacity — IEC 60287',
   'Continuous current rating per IEC 60287 with grouping/soil/ambient derating; multi-cable trench CAD.',
   'IEC 60287, IEC 60228, IEC 60949',
   'pro', 'active', '/004/', 40, unixepoch()*1000, unixepoch()*1000);

-- Default pricing rules (admin can edit/disable/add)
INSERT OR IGNORE INTO pricing_rules (name, match_type, period, calc_ids_json, price_usd, badge, display_order, created_at, updated_at) VALUES
  ('Single calc — Day pass',      'per_item',  'day',      NULL,  1.99, NULL,            10,  unixepoch()*1000, unixepoch()*1000),
  ('Single calc — Monthly',       'per_item',  'month',    NULL,  5.99, NULL,            20,  unixepoch()*1000, unixepoch()*1000),
  ('Single calc — Yearly',        'per_item',  'year',     NULL, 49.00, 'Save 32%',      30,  unixepoch()*1000, unixepoch()*1000),
  ('Single calc — Lifetime',      'per_item',  'lifetime', NULL,129.00, NULL,            40,  unixepoch()*1000, unixepoch()*1000),
  ('All calculators — Day pass',  'bundle_all','day',      NULL,  3.99, NULL,            110, unixepoch()*1000, unixepoch()*1000),
  ('All calculators — Monthly',   'bundle_all','month',    NULL, 12.99, 'Most popular',  120, unixepoch()*1000, unixepoch()*1000),
  ('All calculators — Yearly',    'bundle_all','year',     NULL,119.00, 'Save 24%',      130, unixepoch()*1000, unixepoch()*1000),
  ('All calculators — Lifetime',  'bundle_all','lifetime', NULL,319.00, NULL,            140, unixepoch()*1000, unixepoch()*1000);
