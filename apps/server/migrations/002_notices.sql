-- One-shot popups shown on the next HQ visit (level-up congratulations). `data` is JSON, never HTML.
CREATE TABLE notices (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  army_id INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
  data    TEXT    NOT NULL
);
CREATE INDEX notices_army ON notices(army_id);
