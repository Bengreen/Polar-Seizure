-- 0019_inventory_storage.sql
CREATE TABLE inventory_storage (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_id BIGINT REFERENCES farms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    storage_type VARCHAR(50) NOT NULL,
    capacity_volume NUMERIC NOT NULL,
    is_covered BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_storage_tenant ON inventory_storage(tenant_id);