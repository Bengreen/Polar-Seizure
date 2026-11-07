-- Alter Organic Manure Applications column types to BIGINT (INT8) to match Rust's i64 model type
ALTER TABLE organic_manure_applications ALTER COLUMN id TYPE BIGINT;
ALTER TABLE organic_manure_applications ALTER COLUMN event_id TYPE BIGINT;
ALTER TABLE organic_manure_applications ALTER COLUMN buffer_zone_distance_meters TYPE BIGINT;

-- Alter Compliance Breaches column types to BIGINT (INT8) to match Rust's i64 model type
ALTER TABLE compliance_breaches ALTER COLUMN id TYPE BIGINT;
ALTER TABLE compliance_breaches ALTER COLUMN farm_id TYPE BIGINT;
