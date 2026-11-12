-- Migration 0027: User Telemetry Config and De-duplicated Ingestion Schema

-- Per-user telemetry ingestion configuration (dynamic cadence management)
CREATE TABLE IF NOT EXISTS user_telemetry_configs (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bulk_upload_interval_seconds INT NOT NULL DEFAULT 300,
    emergency_pre_event_window_seconds INT NOT NULL DEFAULT 120,
    emergency_post_event_window_seconds INT NOT NULL DEFAULT 60,
    compress_uploads BOOLEAN NOT NULL DEFAULT TRUE,
    allow_cellular_bulk BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core multi-user telemetry sample log with compound uniqueness for deduplication
CREATE TABLE IF NOT EXISTS telemetry_samples (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL,
    sample_type VARCHAR(16) NOT NULL, -- 'dsp', 'acc', 'ppg', 'event'
    timestamp_ms BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,

    -- DSP metrics
    heart_rate_bpm INT,
    energy_ratio_pct REAL,
    seizure_band_power REAL,
    total_power REAL,
    alarm_state VARCHAR(32),

    -- Raw Accel
    acc_x REAL,
    acc_y REAL,
    acc_z REAL,
    acc_magnitude REAL,

    -- Emergency metadata
    is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    emergency_type VARCHAR(32),
    batch_id UUID NOT NULL,

    CONSTRAINT uq_user_device_sample_time UNIQUE (user_id, device_id, sample_type, timestamp_ms)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_user_time
    ON telemetry_samples(user_id, timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_emergency
    ON telemetry_samples(user_id, is_emergency) WHERE is_emergency = TRUE;
