/** Difficulty identifiers shared by settings, saved matches and AI workers. */
export const DIFFICULTIES = ["easy", "normal", "hard", "impossible"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Frozen at matchmaking and saved with the opening, independent of later balance changes. */
export interface AdaptiveControl {
  version: 1;
  chapter: number;
  /** 0..1: tactical awareness, move quality and bounded lookahead. */
  skill: number;
}
