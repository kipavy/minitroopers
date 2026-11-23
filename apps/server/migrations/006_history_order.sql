-- Stage 4 base. migrate() runs this file with foreign_keys OFF and checks PRAGMA foreign_key_check before committing.
-- battles.created_at: epoch ms of the fight (history ordering); NULL for battles stored before this migration.
ALTER TABLE battles ADD COLUMN created_at INTEGER;
-- armies.deploy_order: JSON array of trooper slots in deployment order; NULL = slot order.
ALTER TABLE armies ADD COLUMN deploy_order TEXT;
-- daily.battles_used was written but never read: the count comes from the `battles` rows (needs SQLite >= 3.35).
ALTER TABLE daily DROP COLUMN battles_used;
-- RATS_MAX (@mt/game economy.ts, UNVERIFIED): capped on wins and in the CLI since stage 3, not on armies already beyond.
UPDATE armies SET rats = MIN(rats, 100);
