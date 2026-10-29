CREATE TABLE app_users (
    username TEXT PRIMARY KEY CHECK (username IN ('ben','robin','erwin')),
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_users(username) VALUES ('ben'), ('robin'), ('erwin');
CREATE TABLE user_state (
    username TEXT PRIMARY KEY REFERENCES app_users(username) ON DELETE CASCADE,
    value JSONB NOT NULL CHECK (jsonb_typeof(value) = 'object')
);
-- Eenmalige overdracht van de bestaande single-user-campagnes aan erwin.
INSERT INTO user_state(username,value) SELECT 'erwin',value FROM state WHERE id=1;
CREATE TABLE app_sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX app_sessions_expiry ON app_sessions(expires_at);
