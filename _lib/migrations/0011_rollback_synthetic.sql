-- 0011 — Roll back synthetic-parameter bulk migrations 0009 / 0010.
-- Keeps only the originally-seeded 97 items from 0008, every one of
-- which has factory-catalog-verified parameters.
DELETE FROM equipment_items WHERE library_id = 1 AND id > 97;
