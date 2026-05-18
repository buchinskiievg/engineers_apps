-- Add visibility column to calculators: 'free' | 'pro' | 'both'
-- Default = current category value (so behaviour stays unchanged unless admin updates)

ALTER TABLE calculators ADD COLUMN visibility TEXT;

-- Backfill: set visibility = category (free/pro)
UPDATE calculators SET visibility = category WHERE visibility IS NULL;
