-- Admin `reset-day` (apps/server/src/admin/cli.ts), the draws of the day. Neither is stored as a quota: the offers of
-- /add ("Ajouter un trooper") are derived from the day, the client and the recruiter (dailyOffers, salt "offers"), and
-- the opponents of /b/opp are drawn from the day and the client (pickOpponents) then frozen in daily.opponents.
-- Each counter salts its draw once it is above 0 (0 keeps the original derivation): a new draw at each reset.
-- shop_reset: resets of the shop (`--what shop`).
ALTER TABLE daily ADD COLUMN shop_reset INTEGER NOT NULL DEFAULT 0;
-- opponents_reset: battle resets (`--what battles`), which also clear daily.opponents so that they are drawn again.
ALTER TABLE daily ADD COLUMN opponents_reset INTEGER NOT NULL DEFAULT 0;
