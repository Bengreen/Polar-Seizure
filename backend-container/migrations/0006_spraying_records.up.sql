-- Add specific fields for Spraying (Pesticide Use) Records to the events table.
ALTER TABLE events ADD COLUMN IF NOT EXISTS mapp_number VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS eppo_code VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS bbch_growth_stage VARCHAR(255);
