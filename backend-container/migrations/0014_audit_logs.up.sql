CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id BIGINT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
