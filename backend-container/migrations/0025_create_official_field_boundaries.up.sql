CREATE TABLE official_field_boundaries (
    id BIGSERIAL PRIMARY KEY,
    sbi VARCHAR NOT NULL,
    parcel_id VARCHAR NOT NULL,
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    source VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_official_field_boundaries_geom ON official_field_boundaries USING GIST (geom);
