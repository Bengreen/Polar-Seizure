-- Migration 0028: Emergency Alert and SMS Incident Events Schema

CREATE TABLE IF NOT EXISTS alert_incidents (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL,
    alert_type VARCHAR(32) NOT NULL, -- 'PANIC', 'SEIZURE', 'HIGH_G', 'DEADMAN', 'TEST'
    severity VARCHAR(16) NOT NULL DEFAULT 'CRITICAL',
    trigger_source VARCHAR(32) NOT NULL DEFAULT 'ON_DEVICE', -- 'ON_DEVICE', 'WATCH_TRIPLE_TAP', 'MANUAL_PANIC', 'FALL_DETECTOR'

    -- Metric snapshots at alert moment
    heart_rate_bpm REAL,
    energy_ratio_pct REAL,
    seizure_band_power REAL,

    -- Location coordinates
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location_accuracy_meters REAL,
    maps_url TEXT,

    -- SMS dispatch details
    sms_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
    sms_recipient_count INT NOT NULL DEFAULT 0,
    sms_recipients JSONB,
    sms_body TEXT,

    -- Incident lifecycle
    triggered_at TIMESTAMPTZ NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(255),
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_alert_incidents_user_time
    ON alert_incidents(user_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_incidents_active
    ON alert_incidents(user_id) WHERE acknowledged_at IS NULL;
