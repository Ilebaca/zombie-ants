/** Platform surface: storage, profile and progression. */
export { MemoryStore, defaultStore, readJson, writeJson } from "./storage";
export type { KeyValueStore } from "./storage";
export {
  ProfileStore, defaultProfile, normalise, modsFrom, MATCH_MYCEL,
} from "./profile";
export type { ChamberId, Equipped, Profile, Research, Stats } from "./profile";
export {
  CHAMBERS, DEFAULT_SPECIES, RESEARCH_TRACKS, RESEARCH_TOTAL_MAX, SPECIES_NOTES, SPECIES_ORDER,
  SPECIES_UNLOCK, TIERS, tierOf,
} from "./catalogue";
export type { ChamberDef, ResearchDef, ResearchTrack, Tier } from "./catalogue";
export {
  ROAD_CHAPTER, ROAD_CHAPTERS, ROAD_MAX, ROAD_STEP, freeReward, isPassKey, passReward,
  rewardFor, rewardText, roadKey, roadStops, roadTrophies,
} from "./road";
export type { RoadReward, RoadStop, RoadTrack } from "./road";
export {
  QUESTS_PER_DAY, QUEST_POOL, QUEST_SWEEP_BONUS, dayIndex, isClaimable, isComplete,
  levelProgress, levelReward, msUntilRollover, questDef, rollQuests, unclaimedLevels, xpForLevel,
} from "./quests";
export type { LevelProgress, QuestDef, QuestKind, QuestReward, QuestState } from "./quests";
