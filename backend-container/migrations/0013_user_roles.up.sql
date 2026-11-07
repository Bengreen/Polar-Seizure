CREATE TYPE user_role AS ENUM ('user', 'support', 'admin');
ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'user';
