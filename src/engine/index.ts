/** Public engine surface. Nothing outside src/engine may reach past this file. */
export * from "./types";
export * from "./config";
export * from "./species";
export * from "./skins";
export * from "./board";
export * from "./combat";
export * from "./connectivity";
export * from "./production";
export * from "./effects";
export * from "./random";
export * from "./abilities";
export * from "./hive";
export * from "./actions";
export * from "./state";
export * from "./tutorial";

export {
  applyMove, openingBoard, replayMatch,
} from "./protocol";
export type {
  MatchRecord, MatchSetup, Move, MoveResult, Refusal, Replay,
} from "./protocol";
