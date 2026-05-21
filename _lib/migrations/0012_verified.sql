-- 0012 — Verification status for equipment_items.
--
-- A row's verified column declares HOW its parameters got into the
-- database.  Only 'catalog' is trustworthy for design work; everything
-- else is a hint that the engineer must double-check before relying on
-- the numbers in a calculation.
--
--   'catalog'     — extracted from / matches a published manufacturer
--                   catalog PDF.  source_ref MUST point at the PDF.
--   'user'        — manually entered through the UI; no automated check.
--   'iec-typical' — typical IEC-default values (no SKU-specific source).
--                   Reserved label; no row should be inserted with this
--                   value in the global library going forward.
--   'imported'    — bulk CSV/JSON import — pending admin verification.
--
-- The 97 existing rows in the global library (post-rollback of 0011)
-- all reference real manufacturer catalog PDFs in `source_ref` — they
-- get promoted to 'catalog' here in one statement.
ALTER TABLE equipment_items ADD COLUMN verified    TEXT NOT NULL DEFAULT 'user';
ALTER TABLE equipment_items ADD COLUMN verified_at INTEGER;
ALTER TABLE equipment_items ADD COLUMN verified_by INTEGER;

UPDATE equipment_items
SET verified = 'catalog', verified_at = strftime('%s','now')
WHERE library_id = 1 AND source_ref IS NOT NULL;
