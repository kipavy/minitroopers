-- Training battles (/b/train): unlimited, they never count anywhere (credits, daily quota, history, notices, ranks,
-- stats, infiltration bias), hence their own table. Only the TRAININGS_KEPT most recent of each army are kept
-- (repo.ts insertTraining), for their replay page /b/tview/<id>.
CREATE TABLE trainings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_id  INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
  defender_id  INTEGER REFERENCES armies(id) ON DELETE SET NULL,
  defender_ref TEXT,
  input        TEXT    NOT NULL,
  winner       INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX trainings_attacker ON trainings(attacker_id, id);
