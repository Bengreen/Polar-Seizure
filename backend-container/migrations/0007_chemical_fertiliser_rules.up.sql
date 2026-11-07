-- Add fields for Chemical Fertiliser Management (Rule Engine support)
ALTER TABLE fertiliser_applications ADD COLUMN IF NOT EXISTS phosphorus_content DOUBLE PRECISION;
ALTER TABLE fertiliser_applications ADD COLUMN IF NOT EXISTS is_protected_urea BOOLEAN DEFAULT FALSE;
ALTER TABLE fertiliser_applications ADD COLUMN IF NOT EXISTS buffer_zone_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE fertiliser_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE fertiliser_applications ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Add land_use to fields if not exists to support Grassland vs Arable rules
ALTER TABLE fields ADD COLUMN IF NOT EXISTS land_use VARCHAR(50) DEFAULT 'grassland';
