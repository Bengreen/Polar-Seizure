-- Migration: 0015_spatial_data
-- Enable PostGIS and add geometry columns

CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry to fields
ALTER TABLE fields ADD COLUMN IF NOT EXISTS geom GEOMETRY(Polygon, 4326);

-- Create waterways table
CREATE TABLE IF NOT EXISTS waterways (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    waterway_type VARCHAR(50), -- 'stream', 'river', 'lake', 'drain'
    geom GEOMETRY(Geometry, 4326),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS fields_geom_idx ON fields USING GIST (geom);
CREATE INDEX IF NOT EXISTS waterways_geom_idx ON waterways USING GIST (geom);
