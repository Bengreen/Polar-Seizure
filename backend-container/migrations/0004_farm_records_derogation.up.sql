-- Add has_derogation column to farm_records
ALTER TABLE farm_records ADD COLUMN IF NOT EXISTS has_derogation BOOLEAN DEFAULT FALSE;
