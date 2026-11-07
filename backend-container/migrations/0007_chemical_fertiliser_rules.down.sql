ALTER TABLE fields DROP COLUMN IF EXISTS land_use;
ALTER TABLE fertiliser_applications DROP COLUMN IF EXISTS is_deleted;
ALTER TABLE fertiliser_applications DROP COLUMN IF EXISTS updated_at;
ALTER TABLE fertiliser_applications DROP COLUMN IF EXISTS buffer_zone_confirmed;
ALTER TABLE fertiliser_applications DROP COLUMN IF EXISTS is_protected_urea;
ALTER TABLE fertiliser_applications DROP COLUMN IF EXISTS phosphorus_content;
