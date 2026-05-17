-- ieccalc.com — content + forum schema (v2)
-- Adds: posts, videos, presentations + slides, comments,
--       forum (categories, threads, replies, votes).
-- Articles table already exists in 0001 — extending it.

-- ── ARTICLES extension ──────────────────────────────────────────────────
-- Add columns if missing (D1 has limited ALTER, do conditionally in app)
-- Existing schema:
--   articles(id, slug, title, excerpt, body_md, cover_image, tags_json,
--            status, published_at, created_at, updated_at)
-- Re-using as-is. Reading-time computed on the fly.

-- ── POSTS (short-form LinkedIn-style) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id     INTEGER NOT NULL,
  body_md       TEXT NOT NULL,             -- up to ~600 chars
  image_url     TEXT,
  tags_json     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  published_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_pub ON posts(status, published_at DESC);

-- ── VIDEOS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT,
  source        TEXT NOT NULL,             -- 'youtube' | 'r2' | 'embed'
  youtube_id    TEXT,                      -- if source=youtube
  video_url     TEXT,                      -- if source=r2 (R2 key/URL)
  embed_html    TEXT,                      -- if source=embed (full iframe)
  cover_url     TEXT,
  duration_sec  INTEGER,
  tags_json     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  published_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_pub ON videos(status, published_at DESC);

-- ── PRESENTATIONS (LinkedIn-style carousels) ────────────────────────────
CREATE TABLE IF NOT EXISTS presentations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT,
  cover_url     TEXT,
  tags_json     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  published_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pres_pub ON presentations(status, published_at DESC);

CREATE TABLE IF NOT EXISTS presentation_slides (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  presentation_id INTEGER NOT NULL,
  idx             INTEGER NOT NULL,        -- slide order, 0-based
  image_url       TEXT NOT NULL,           -- R2 key or external URL
  caption         TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slides_pres ON presentation_slides(presentation_id, idx);

-- ── COMMENTS (polymorphic — attach to any content type) ─────────────────
CREATE TABLE IF NOT EXISTS comments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type  TEXT NOT NULL,              -- 'article' | 'post' | 'video' | 'presentation' | 'forum_thread' | 'forum_reply'
  target_id    INTEGER NOT NULL,
  author_id    INTEGER NOT NULL,
  parent_id    INTEGER,                    -- for nested replies (NULL = root)
  body_md      TEXT NOT NULL,
  votes_up     INTEGER NOT NULL DEFAULT 0,
  votes_down   INTEGER NOT NULL DEFAULT 0,
  deleted      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id  INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  direction   INTEGER NOT NULL,            -- +1 | -1
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

-- ── FORUM ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,                      -- icon kind: bolt, cable, earth, tx, ...
  display_order INTEGER NOT NULL DEFAULT 100,
  thread_count  INTEGER NOT NULL DEFAULT 0,
  last_activity INTEGER,                   -- updated by trigger / app code
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_threads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id     INTEGER NOT NULL,
  author_id       INTEGER NOT NULL,
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body_md         TEXT NOT NULL,
  pinned          INTEGER NOT NULL DEFAULT 0,
  locked          INTEGER NOT NULL DEFAULT 0,
  views           INTEGER NOT NULL DEFAULT 0,
  reply_count     INTEGER NOT NULL DEFAULT 0,
  last_reply_at   INTEGER,
  last_reply_by   INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_cat ON forum_threads(category_id, pinned DESC, last_reply_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_slug ON forum_threads(category_id, slug);

CREATE TABLE IF NOT EXISTS forum_replies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id     INTEGER NOT NULL,
  author_id     INTEGER NOT NULL,
  parent_id     INTEGER,                   -- for nested (NULL = top-level reply)
  body_md       TEXT NOT NULL,
  votes_up      INTEGER NOT NULL DEFAULT 0,
  votes_down    INTEGER NOT NULL DEFAULT 0,
  deleted       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_replies_thread ON forum_replies(thread_id, created_at);

CREATE TABLE IF NOT EXISTS forum_reply_votes (
  reply_id    INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  direction   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (reply_id, user_id)
);

-- ── SEED forum categories ───────────────────────────────────────────────
INSERT OR IGNORE INTO forum_categories (slug, name, description, icon, display_order, created_at) VALUES
  ('cables',     'Cables & Conduits',       'Ampacity, sizing, voltage drop, derating, accessories.', 'cable', 10, unixepoch()*1000),
  ('faults',     'Faults & Protection',     'Short-circuit, fuses, MCB/MCCB, ACB, coordination, arc-flash.', 'bolt', 20, unixepoch()*1000),
  ('grounding',  'Grounding & Earthing',    'IEEE 80 grids, soil resistivity, touch/step voltages, lightning.', 'earth', 30, unixepoch()*1000),
  ('transformers','Transformers',           'Sizing, losses, %Z, vector groups, parallel operation.', 'tx', 40, unixepoch()*1000),
  ('motors',     'Motors & Drives',         'Starting current, locked rotor, VFD harmonics, derating.', 'motor', 50, unixepoch()*1000),
  ('power-quality','Power Quality',         'Harmonics, PFC, voltage flicker, sag/swell.', 'cap', 60, unixepoch()*1000),
  ('standards',  'Standards & Codes',       'IEC, IEEE, NFPA 70/70E, ПУЭ, СП — interpretation, edge cases.', 'doc', 70, unixepoch()*1000),
  ('general',    'General Discussion',      'Anything else — career, tools, market, projects.', 'book', 100, unixepoch()*1000);
