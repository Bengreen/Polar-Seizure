-- Migration: 0012_spreading_equipment_exemptions
-- Add equipment_used and lesse_exemption_reason to organic_manure_applications

ALTER TABLE organic_manure_applications ADD COLUMN IF NOT EXISTS equipment_used VARCHAR(255);
ALTER TABLE organic_manure_applications ADD COLUMN IF NOT EXISTS lesse_exemption_reason TEXT;
