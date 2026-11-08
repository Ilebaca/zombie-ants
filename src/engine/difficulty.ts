/** Difficulty identifiers shared by settings, saved matches and AI workers. */
export const DIFFICULTIES = ["easy", "normal", "hard", "impossible"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
