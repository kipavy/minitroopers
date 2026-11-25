-- All the missions every day (spec 2026-11-25-missions-quotidiennes-design.md): one state per mission and per day, in
-- place of the single mission of `daily` (mission_type, missions_used, missions_reset, mission_won, mission_target,
-- left in place and no longer read). The days already played keep their tries under the type that was drawn.
CREATE TABLE mission_day (
  army_id INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
  day     TEXT    NOT NULL,
  type    TEXT    NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  reset   INTEGER NOT NULL DEFAULT 0,
  won     INTEGER NOT NULL DEFAULT 0,
  target  TEXT,
  PRIMARY KEY (army_id, day, type)
);
INSERT INTO mission_day (army_id, day, type, used, reset, won, target)
  SELECT army_id, day, mission_type, missions_used, missions_reset, mission_won, mission_target FROM daily WHERE mission_type IS NOT NULL;
