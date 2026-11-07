-- Create table for Organic Manure Applications
CREATE TABLE IF NOT EXISTS organic_manure_applications (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    manure_type VARCHAR(100) NOT NULL, -- e.g. Slurry, FYM, Poultry Litter, Digestate
    volume_applied_m3_per_ha DOUBLE PRECISION,
    weight_applied_tonnes_per_ha DOUBLE PRECISION,
    nitrogen_content_kg_per_unit DOUBLE PRECISION,
    is_lesse_applied BOOLEAN DEFAULT FALSE, -- Low Emission Slurry Spreading Equipment
    weather_conditions_confirmed BOOLEAN DEFAULT FALSE,
    buffer_zone_distance_meters INTEGER DEFAULT 10,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Add derogation_status to farms to support N loading rules (170 vs 250 kg N/ha)
ALTER TABLE farms ADD COLUMN IF NOT EXISTS has_derogation BOOLEAN DEFAULT FALSE;
