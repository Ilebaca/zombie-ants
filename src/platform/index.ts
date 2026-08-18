/** Platform surface: storage, profile and progression. */
export { MemoryStore, defaultStore, readJson, writeJson } from "./storage";
export type { KeyValueStore } from "./storage";
export {
  ProfileStore, defaultProfile, normalise, modsFrom, MATCH_MYCEL, MATCH_PHEROMONE,
} from "./profile";
export type { ChamberId, Equipped, Profile, Research, Stats } from "./profile";
export {
  CHAMBERS, RESEARCH_TRACKS, RESEARCH_TOTAL_MAX, SPECIES_NOTES, SPECIES_ORDER, SPECIES_UNLOCK,
} from "./catalogue";
export type { ChamberDef, ResearchDef, ResearchTrack } from "./catalogue";
export {
  ROAD_CHAPTER, ROAD_CHAPTERS, ROAD_MAX, ROAD_STEP, freeReward, isPassKey, passReward,
  rewardFor, rewardText, roadKey, roadStops, roadTrophies,
} from "./road";
export type { RoadReward, RoadStop, RoadTrack } from "./road";
