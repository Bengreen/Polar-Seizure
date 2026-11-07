CREATE TABLE IF NOT EXISTS soil_analyses (
    id BIGSERIAL PRIMARY KEY,
    field_id BIGINT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    sample_date VARCHAR(255) NOT NULL,
    ph_level DOUBLE PRECISION,
    phosphorus_index INTEGER,
    potassium_index INTEGER,
    magnesium_index INTEGER
);

CREATE TABLE IF NOT EXISTS fertilisation_plans (
    id BIGSERIAL PRIMARY KEY,
    field_id BIGINT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    crop_type VARCHAR(255) NOT NULL,
    target_yield DOUBLE PRECISION NOT NULL,
    nitrogen_requirement DOUBLE PRECISION NOT NULL,
    phosphorus_requirement DOUBLE PRECISION NOT NULL,
    potassium_requirement DOUBLE PRECISION NOT NULL,
    application_date VARCHAR(255) NOT NULL
);
