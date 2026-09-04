/** Platform surface: storage, profile and progression. */
export { BUILD } from "./build";
export { takeNewerBuild } from "./freshness";
export { MemoryStore, defaultStore, readJson, writeJson } from "./storage";
export type { KeyValueStore } from "./storage";
export {
  PROFILE_KEY, ProfileStore, defaultProfile, normalise, modsFrom, matchXp, DAILY_GIFT,
  MATCH_MYCEL, TOUR_VERSION,
} from "./profile";
export type {
  ChamberId, Equipped, GranaryState, HatchPrize, Profile, Research, Stats,
} from "./profile";
export {
  NEWS, agoOf, newsFeed, newsLatestAt, unreadNews,
} from "./news";
export type { NewsArt, NewsPost, NewsTag } from "./news";
export {
  FRIEND_MAX, FRIEND_RESULTS, LocalFriendService, directory, personId, seedRequests,
} from "./friends";
export type { Friend, FriendService, Person } from "./friends";
export { DUELS_MAX, DUEL_WAIT_MS, LocalDuels, inviteFrom, inviteId, seedInvites } from "./duels";
export type { DuelInvite, DuelService } from "./duels";
export {
  FAQ, LocalSupportGateway, SUPPORT_EMAIL, TICKET_KINDS, TICKET_MAX, mailLink,
} from "./support";
export type { FaqEntry, SupportGateway, Ticket, TicketKind } from "./support";
export {
  CHAMBERS, DEFAULT_SPECIES, RESEARCH_TRACKS, RESEARCH_TOTAL_MAX, SPECIES_NOTES, SPECIES_ORDER,
  SPECIES_UNLOCK, TIERS, tierOf,
} from "./catalogue";
export type { ChamberDef, ResearchDef, ResearchTrack, Tier } from "./catalogue";
export {
  ROAD_CHAPTERS, ROAD_CHAPTER_STOPS, ROAD_FIRST, ROAD_GROWTH, ROAD_LAST, ROAD_STOPS,
  chapterOf, freeReward, isPassKey, passReward, rewardFor, rewardText, roadColony, roadKey,
  roadStops, stopColony, stopReached,
} from "./road";
export {
  COLONY_FLOOR, COLONY_LOSS_SHARE, COLONY_START, COLONY_TAPER, COLONY_WIN, compact, exact,
  grownColony, losses, winnings,
} from "./colony";
export type { RoadReward, RoadStop, RoadTrack } from "./road";
export { RIVAL_NAMES } from "./rival";
export {
  BOTS_PER_CHAPTER, LocalMatchmaker, SEARCH_MS, botsForChapter,
} from "./matchmaking";
export type { Matchmaker, Opponent } from "./matchmaking";
export {
  GRANARY_LEVELS, GRANARY_MAX, GRANARY_MAX_LID, granaryFillsIn, granaryFull, granaryLevel,
  granaryNext, granaryRate, granaryStored,
} from "./granary";
export type { GranaryLevel } from "./granary";
export { SilentFeedback, WebFeedback, makeFeedback } from "./feedback";
export type { Cue, Feedback, Track } from "./feedback";
export {
  FUSE_COST, FUSE_DEALS, FUSE_FUEL, LARVA_MYCEL, fuseDeal, nextTier,
} from "./exchange";
export { LEGACY_ID, LocalAccounts, cleanName, keyFor } from "./accounts";
export {
  askToPersist, installSteps, isInstalled, isIos, saveRisk, storageIsDurable,
} from "./persistence";
export type { SaveRisk } from "./persistence";
export type { Account, AccountService } from "./accounts";
export { scoreQuestEvents } from "./scoring";
export { DemoGateway, SHOP_PRODUCTS, productById } from "./purchases";
export type { Grant, Product, ProductKind, PurchaseGateway, PurchaseResult } from "./purchases";
export {
  QUESTS_PER_DAY, QUEST_POOL, QUEST_SWEEP_BONUS, dayIndex, isClaimable, isComplete,
  levelProgress, levelReward, msUntilRollover, questDef, rollQuests, unclaimedLevels, xpForLevel,
} from "./quests";
export type { LevelProgress, QuestDef, QuestKind, QuestReward, QuestState } from "./quests";
export { LocalResults, verify } from "./results";
export type { MatchOutcome, RecordedResult, ResultsService } from "./results";
export { HISTORY_MAX, RECORD_MAX_MOVES, addToHistory, canReplay, fitRecord, outcomeOf } from "./history";
export type { MatchLog } from "./history";
export { BACKUP_TAG, BACKUP_VERSION, checksum, exportProfile, importProfile } from "./backup";
export type { ImportFailure, ImportResult } from "./backup";
export {
  ATK_CAP, DEF_CAP, HATCH_COST, LUCK_CAP, TRAITS, TRAITS_CHAPTER, TRAIT_SLOTS, TRAIT_TIER,
  TRAIT_TIERS, WIN_LARVA, combine, effectFigure, effectText, fitsScope, itemDef, markOf,
  rollDrop, rollTier, rollTrait, scopeName, tierOdds, totalsOf, traitDef, traitsFor,
  SLOT_STEP, slotChapter, slotOpen, slotsOpen,
} from "./traits";
export { SKIN_TIERS, lockedLooks, rollSkin, skinProgress, skinTier } from "./skins";
export type {
  Drop, TraitDef, TraitItem, TraitKind, TraitScope, TraitTier, TraitTierDef, TraitTotals,
} from "./traits";
