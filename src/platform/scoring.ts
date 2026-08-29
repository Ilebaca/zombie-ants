/**
 * WHAT A MATCH DID, turned into progress.
 *
 * It reads engine EVENTS and writes the profile, which makes it progression rather than
 * interface — it lived on the app shell only because that is where the events arrive. The
 * engine still knows nothing about quests, and opening the quest screen can never award
 * anything by itself (CLAUDE.md §12).
 */
import type { EngineEvent } from "../engine";
import type { ProfileStore } from "./profile";

/**
 * Turn a batch of engine events into progress: today's quest, and the career total.
 *
 * Both come off the same count, and they are counted HERE rather than at two call sites so
 * one tested function owns the translation — a quest that credits a capture the profile
 * does not is a pair of numbers that disagree with each other on screen.
 *
 * Only the player's own captures count — the AI taking a tile is not progress — and the
 * whole batch is folded into one call so a Spread that claims six tiles does not write six
 * times. Exported so the translation is testable without a running match.
 */
export function scoreQuestEvents(profile: ProfileStore, events: readonly EngineEvent[]): void {
  let captured = 0;
  for (const e of events) if (e.type === "capture" && e.owner === "you") captured++;
  if (!captured) return;
  profile.questProgress("conquered", captured);
  profile.recordCaptures(captured);
}
