CREATE TABLE IF NOT EXISTS fertiliser_applications (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    fertiliser_type VARCHAR(255) NOT NULL,
    amount_applied DOUBLE PRECISION NOT NULL,
    nitrogen_content DOUBLE PRECISION,
    evidence_of_control TEXT
);
