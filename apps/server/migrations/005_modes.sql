-- Stage 3 base. Rebuilds `armies` and `battles` to add ON DELETE to their foreign keys (SQLite cannot alter them),
-- then adds the columns of missions, raids and referral. migrate() runs this file with foreign_keys OFF and checks
-- PRAGMA foreign_key_check before committing.
-- Rebuilt armies: recruiter_id ON DELETE SET NULL. created_cid: client id at creation (referral anti-abuse).
CREATE TABLE armies_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  host                 TEXT    NOT NULL UNIQUE,
  name                 TEXT    NOT NULL,
  part                 INTEGER NOT NULL DEFAULT 0,
  faction              INTEGER NOT NULL DEFAULT 0,
  credits              INTEGER NOT NULL DEFAULT 0,
  recruiter_id         INTEGER REFERENCES armies(id) ON DELETE SET NULL,
  created_at           INTEGER NOT NULL,
  created_ip           TEXT,
  password_hash        TEXT,
  is_faction           INTEGER NOT NULL DEFAULT 0,
  created_cid          TEXT,
  missions_unlocked    INTEGER NOT NULL DEFAULT 0,
  rats                 INTEGER NOT NULL DEFAULT 1,
  epic_wins            INTEGER NOT NULL DEFAULT 0,
  recruit_confirmed_at INTEGER,
  recruit_bounty       INTEGER
);
INSERT INTO armies_new (id, host, name, part, faction, credits, recruiter_id, created_at, created_ip, password_hash, is_faction)
  SELECT id, host, name, part, faction, credits, recruiter_id, created_at, created_ip, password_hash, is_faction FROM armies;
DROP TABLE armies;
ALTER TABLE armies_new RENAME TO armies;

-- Rebuilt battles: the attacker's battles go with the attacker; a deleted defender leaves the battle (defender_ref
-- is then set to 'gone:<name>' by deleteArmy). mode/phase/opp: see missions, raids and stale attack links.
CREATE TABLE battles_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         TEXT    NOT NULL,
  attacker_id INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
  defender_id INTEGER REFERENCES armies(id) ON DELETE SET NULL,
  input       TEXT    NOT NULL,
  winner      INTEGER,
  kind        TEXT    NOT NULL DEFAULT 'battle',
  defender_ref TEXT,
  seen        INTEGER NOT NULL DEFAULT 0,
  mode        TEXT,
  phase       INTEGER,
  opp         TEXT
);
INSERT INTO battles_new (id, day, attacker_id, defender_id, input, winner, kind, defender_ref, seen)
  SELECT id, day, attacker_id, defender_id, input, winner, kind, defender_ref, seen FROM battles;
DROP TABLE battles;
ALTER TABLE battles_new RENAME TO battles;
CREATE INDEX battles_attacker ON battles(attacker_id, day);

ALTER TABLE daily ADD COLUMN missions_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily ADD COLUMN mission_won INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily ADD COLUMN mission_type TEXT;
ALTER TABLE daily ADD COLUMN mission_target TEXT;
ALTER TABLE daily ADD COLUMN raid_phase INTEGER NOT NULL DEFAULT 1;
ALTER TABLE daily ADD COLUMN raid_dead TEXT NOT NULL DEFAULT '[]';
ALTER TABLE daily ADD COLUMN raid_over INTEGER NOT NULL DEFAULT 0;
