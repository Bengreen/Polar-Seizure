-- Add has_derogation column to farms table
ALTER TABLE farms ADD COLUMN IF NOT EXISTS has_derogation BOOLEAN DEFAULT FALSE;
