export { atLocal, dayKey, nextResetAt, prevDay } from "./day.ts";
export { RECHARGE_EVERY_H, RESERVE_MAX, rechargeTimes, reserveState, weekendEvent } from "./weekend.ts";
export type { ReserveState, WeekendEvent } from "./weekend.ts";
export { haxeTrim, host, validateArmyName, RESERVED_HOSTS } from "./host.ts";
export { dailyOffers } from "./offers.ts";
export type { OfferTrooper } from "./offers.ts";
export { trooperName } from "./names.ts";
export { battleAllowance, battlesPerDay, battleReward, isWeekend, referralBounty, rewardMultiplier, STARTING_CREDITS } from "./economy.ts";
export { FACTIONS, FACTION_COLOURS, factionBattleArmy } from "./factions.ts";
export type { Faction, FactionTrooper } from "./factions.ts";
export { fillerArmy, fillerBattleArmy, fillerId, parseFillerId } from "./fillers.ts";
export type { FillerArmy, FillerTrooper } from "./fillers.ts";
export { pickOpponents, pickTrainingOpponents, OPPONENT_COUNT } from "./opponents.ts";
export type { ArmyRef } from "./opponents.ts";
export {
  MISSION_UNLOCK_COST, MISSION_ATTEMPTS, missionReward, RAID_REWARD, RAID_MAX_PHASE, RAID_PER_BATTLE,
  EPIC_MIN_RECRUITS, EPIC_SIDE_MAX, EPIC_NPC_MAX, RATS_MAX, NPC_SEED_MAX,
} from "./economy.ts";
export { armyComposition, npcArmy } from "./npc.ts";
export { RAT_SKILLS, dayRats, ratArmy, ratPref } from "./rats.ts";
export type { RatSpec } from "./rats.ts";
export { raidPower, raidTrooperRange, epicPower } from "./raid.ts";
export { missionOfDay, pickInfiltrationTarget } from "./missions.ts";
export type { MissionType } from "./missions.ts";
export { seedsOffering } from "./seeds.ts";
