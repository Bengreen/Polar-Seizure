-- Migration 0027 Rollback
DROP TABLE IF EXISTS telemetry_samples CASCADE;
DROP TABLE IF EXISTS user_telemetry_configs CASCADE;
