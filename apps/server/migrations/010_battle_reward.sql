-- Credits a battle paid when it was fought (the "+N [T]" message of its first view and the money animation), so a
-- later change of the reward config (WEEKEND_MULTIPLIER) never alters what that message says. NULL for battles fought
-- before this column existed: their reward is computed again from the config.
ALTER TABLE battles ADD COLUMN reward INTEGER;
