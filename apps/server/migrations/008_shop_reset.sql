-- Admin `reset-day --what shop` (apps/server/src/admin/cli.ts): the offers of /add ("Ajouter un trooper") are not
-- stored, they are derived from the day, the client and the recruiter (dailyOffers, salt "offers"). shop_reset counts
-- the shop resets of the day: 0 keeps the original derivation, n > 0 salts it with "offers#n" (a new draw each time).
ALTER TABLE daily ADD COLUMN shop_reset INTEGER NOT NULL DEFAULT 0;
