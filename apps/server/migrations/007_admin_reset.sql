-- Admin `reset-day` (apps/server/src/admin/cli.ts) gives an army's day back without touching its history: what was
-- used before the last reset of the day. The counters themselves only grow (battle rows of kind 'battle',
-- missions_used, raid_phase), so every action URL stays single-shot and the numbers of /b/view/bat<n> and miss<n> stay
-- unique; the quotas count from these offsets.
-- battles_reset: daily battles fought before the reset (the allowance counts the battles beyond it).
ALTER TABLE daily ADD COLUMN battles_reset INTEGER NOT NULL DEFAULT 0;
-- missions_reset: mission tries made before the reset (MISSION_ATTEMPTS counts the tries beyond it).
ALTER TABLE daily ADD COLUMN missions_reset INTEGER NOT NULL DEFAULT 0;
-- raid_reset: raid_phase is the URL counter (`/b/raid?phase=`); the phase played is raid_phase - raid_reset.
ALTER TABLE daily ADD COLUMN raid_reset INTEGER NOT NULL DEFAULT 0;
