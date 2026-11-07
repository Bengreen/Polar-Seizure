-- Create table for Compliance Breaches
CREATE TABLE IF NOT EXISTS compliance_breaches (
    id SERIAL PRIMARY KEY,
    farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    breach_type VARCHAR(200) NOT NULL, -- e.g. Slurry closed period, Over-application of N
    severity VARCHAR(50) NOT NULL, -- Very Low, Low, Medium, High, Very High
    estimated_penalty_percentage DOUBLE PRECISION DEFAULT 0.0,
    mandatory_training_required VARCHAR(200),
    breach_date DATE NOT NULL,
    notes TEXT,
    is_repeat BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
