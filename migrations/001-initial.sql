CREATE TABLE state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    value JSONB NOT NULL CHECK (jsonb_typeof(value) = 'object')
);
