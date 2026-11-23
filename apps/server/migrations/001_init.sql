-- Schema v1 (stage 2). Times are epoch milliseconds, days are dayKey strings ("YYYY-MM-DD").
CREATE TABLE armies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  host          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  part          INTEGER NOT NULL DEFAULT 0,
  faction       INTEGER NOT NULL DEFAULT 0,
  credits       INTEGER NOT NULL DEFAULT 0,
  recruiter_id  INTEGER REFERENCES armies(id),
  created_at    INTEGER NOT NULL,
  created_ip    TEXT,
  password_hash TEXT,
  is_faction    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE troopers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  army_id         INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
  slot            INTEGER NOT NULL,
  seed            INTEGER NOT NULL,
  name            TEXT    NOT NULL,
  renamed         INTEGER NOT NULL DEFAULT 0,
  choices         TEXT    NOT NULL DEFAULT '[]',
  pending_levelup TEXT,
  pref            TEXT,
  left_over       TEXT,
  UNIQUE (army_id, slot)
);

-- defender_id is TEXT: a real army id or a generated filler id ("filler:<power>:<seed>").
CREATE TABLE battles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         TEXT    NOT NULL,
  attacker_id INTEGER NOT NULL REFERENCES armies(id),
  defender_id TEXT    NOT NULL,
  input       TEXT    NOT NULL,
  winner      INTEGER,
  kind        TEXT    NOT NULL DEFAULT 'battle'
);
CREATE INDEX battles_attacker ON battles(attacker_id, day);

CREATE TABLE daily (
  army_id      INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
  day          TEXT    NOT NULL,
  battles_used INTEGER NOT NULL DEFAULT 0,
  opponents    TEXT,
  PRIMARY KEY (army_id, day)
);

CREATE TABLE sessions (
  key        TEXT PRIMARY KEY,
  army_id    INTEGER REFERENCES armies(id) ON DELETE CASCADE,
  client_id  TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_created ON sessions(created_at);
