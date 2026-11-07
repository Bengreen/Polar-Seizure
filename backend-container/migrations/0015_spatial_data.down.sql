DROP INDEX IF EXISTS waterways_geom_idx;
DROP INDEX IF EXISTS fields_geom_idx;
DROP TABLE IF EXISTS waterways CASCADE;
ALTER TABLE fields DROP COLUMN IF EXISTS geom;
-- Extension postgis is often left intact, but we can drop it if it's strictly part of this migration down.
-- DROP EXTENSION IF EXISTS postgis;
