-- 0007 — Equipment libraries.
--
-- A LIBRARY is a named collection of equipment items.  Three flavours
-- coexist in one table, distinguished by visibility:
--
--   • 'global' — owner_id IS NULL.  Maintained by ieccalc admins.
--                Everyone can READ; nobody (except admin) can WRITE.
--   • 'public' — owner_id = <user>.  Visible to all authenticated
--                users; only the owner can WRITE.
--   • 'private' — owner_id = <user>.  Visible only to the owner.
--
-- Each user also has an automatically-created "Default" private
-- library — that's where items copied FROM external (non-owned)
-- libraries land, so the engineer's schemas stay functional even if
-- the source library is later deleted or made private.
CREATE TABLE IF NOT EXISTS equipment_libraries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER,                                -- NULL = global
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  visibility  TEXT    NOT NULL DEFAULT 'private',    -- 'private' | 'public' | 'global'
  is_default  INTEGER NOT NULL DEFAULT 0,             -- 1 = the user's auto-created default lib
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eq_lib_owner      ON equipment_libraries(owner_id);
CREATE INDEX IF NOT EXISTS idx_eq_lib_visibility ON equipment_libraries(visibility);

-- An ITEM is a concrete piece of equipment — a specific cable model,
-- a specific MCCB, a specific transformer — with its full parameter
-- set baked into params_json.  category maps onto the editor's SYM
-- type codes ('cable', 'cb_lv', 'tx2', …) so applying an item to a
-- selected node is a simple params merge.
--
-- source_ref preserves provenance when an item is copied from an
-- external library: "lib:<source_lib_id>/item:<source_item_id>".
CREATE TABLE IF NOT EXISTS equipment_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id   INTEGER NOT NULL,
  category     TEXT    NOT NULL,                    -- maps to SYM key
  type_code    TEXT,                                -- short model/SKU
  manufacturer TEXT,
  model        TEXT,
  display_name TEXT    NOT NULL,
  params_json  TEXT    NOT NULL DEFAULT '{}',
  source_ref   TEXT,                                -- e.g. 'lib:5/item:42'
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (library_id) REFERENCES equipment_libraries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eq_item_lib ON equipment_items(library_id);
CREATE INDEX IF NOT EXISTS idx_eq_item_cat ON equipment_items(library_id, category);

-- Seed the singleton GLOBAL library so the admin endpoints have
-- something to write items into from day one.
INSERT OR IGNORE INTO equipment_libraries (id, owner_id, name, description, visibility, is_default, created_at, updated_at)
VALUES (1, NULL, 'ieccalc Global', 'Maintained by ieccalc — manufacturer-agnostic IEC defaults.', 'global', 0, strftime('%s','now'), strftime('%s','now'));
