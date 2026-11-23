-- Battles of stage 2. `defender_ref` names a defender that is not a stored army (defender_id NULL): a generated
-- army ("filler:<power>:<seed>") or a faction army not seeded yet ("faction:<host>"); its troopers are in `input`.
-- `seen` marks the first view of a battle by its attacker (the "+N" end message and the credits animation, once).
ALTER TABLE battles ADD COLUMN defender_ref TEXT;
ALTER TABLE battles ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;
UPDATE battles SET seen = 1;
