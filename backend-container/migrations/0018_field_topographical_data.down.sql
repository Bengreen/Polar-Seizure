ALTER TABLE fields
    DROP COLUMN IF EXISTS max_slope,
    DROP COLUMN IF EXISTS average_slope,
    DROP COLUMN IF EXISTS mean_elevation,
    DROP COLUMN IF EXISTS max_elevation,
    DROP COLUMN IF EXISTS min_elevation;
