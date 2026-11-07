ALTER TABLE users ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE modules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE user_modules (
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    module_id INT REFERENCES modules(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, module_id)
);

INSERT INTO modules (name, description) VALUES ('reports_and_analysis', 'Access to reporting exports and soil analysis tools.');
