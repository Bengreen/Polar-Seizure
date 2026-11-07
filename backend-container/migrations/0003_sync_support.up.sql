-- Add updated_at and is_deleted columns for delta sync support to all tables.
-- updated_at is automatically managed by a trigger on each table.

DO $$
DECLARE
    tables TEXT[] := ARRAY['farms', 'fields', 'events', 'farm_records', 'soil_analyses', 'fertilisation_plans'];
    t TEXT;
BEGIN
        -- Create the trigger function if it doesn't exist
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $inner$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $inner$ LANGUAGE plpgsql;

        FOREACH t IN ARRAY tables
        LOOP
            -- Add columns
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE', t);

            -- Drop trigger if exists and recreate
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_updated_at', t);
            EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', 'trg_' || t || '_updated_at', t);
        END LOOP;
    END;
$$;
