-- The session cookie carries a random 128-bit token, no longer the 6-char key that every action URL shows
-- (anyone who saw an action URL could set ssid=<key> and take the army). The key stays the anti-CSRF token of the URLs.
-- Existing sessions are invalidated: their visitors get a fresh session (and log in again).
DELETE FROM sessions;
ALTER TABLE sessions ADD COLUMN token TEXT;
CREATE UNIQUE INDEX sessions_token ON sessions(token);
