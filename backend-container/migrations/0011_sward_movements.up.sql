-- Create sward_movements table for tracking imports and exports of organic manure
CREATE TABLE IF NOT EXISTS sward_movements (
    id BIGSERIAL PRIMARY KEY,
    farm_id BIGINT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL, -- 'import' or 'export'
    quantity_m3 DOUBLE PRECISION NOT NULL,
    date VARCHAR(255) NOT NULL,
    manure_type VARCHAR(255) NOT NULL,
    consignee_name VARCHAR(255),
    consignee_address TEXT,
    consignor_name VARCHAR(255),
    consignor_address TEXT,
    transporter_name VARCHAR(255),
    contract_length_months INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Add trigger for updated_at
CREATE TRIGGER trg_sward_movements_updated_at BEFORE UPDATE ON sward_movements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
