DO $$
DECLARE
    tables TEXT[] := ARRAY['farms', 'fields', 'events', 'farm_records', 'soil_analyses', 'fertilisation_plans'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_updated_at', t);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS updated_at', t);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS is_deleted', t);
    END LOOP;
END;
$$;
DROP FUNCTION IF EXISTS update_updated_at_column();
