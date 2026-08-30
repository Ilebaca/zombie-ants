/**
 * FRIENDS: the list, and the seam a server will slot into.
 *
 * Nobody is really out there — there is no server (roadmap step 6) — so the DIRECTORY is
 * generated and requests never leave the device. The shape is the real one, though, which
 * is the whole point of building it now: `FriendService` is an interface with two methods,
 * `LocalFriendService` is the offline one, and swapping in a real client is a new class and
 * one line in `App`. That is the same seam `Matchmaker` and `PurchaseGateway` use.
 *
 * The state lives on the profile rather than here, for the same reason the granary's clock
 * does: this file is arithmetic and names, and `ProfileStore` is the only thing that writes.
 */
import type { SpeciesId } from "../engine";
import { SPECIES } from "../engine";
import { RIVAL_NAMES } from "./rival";
import { COLONY_START } from "./colony";

/** A colony you know, or one you have found. The same record either way. */
export interface Person {
  /** Stable id. Ours are derived from the name, so the directory never renumbers. */
  id: string;
  name: string;
  colony: number;
  species: SpeciesId;
}

/** A person on your list, with the day you added them. */
export interface Friend extends Person {
  since: number;
}

export interface FriendService {
  /** Colonies whose name contains `query`. Empty query returns suggestions. */
  search(query: string): Promise<Person[]>;
}

/** How many the search will hand back at once — a page, not a phone book. */
export const FRIEND_RESULTS = 12;

/** A colony can hold this many friends. A cap is a design decision, not a limitation. */
export const FRIEND_MAX = 50;

/** Non-premium only: a stranger in the directory is a player, not a shop window. */
const DIRECTORY_SPECIES = (Object.keys(SPECIES) as SpeciesId[])
  .filter((id) => !SPECIES[id].premium);

/** A tiny deterministic generator, so the directory is the same every time it is read. */
function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A stable id for a generated colony — the name is unique in the directory. */
export const personId = (name: string): string => `p:${name.toLowerCase()}`;

/**
 * The whole directory: every name in the pool, at several sizes.
 *
 * Generated rather than typed out for the same reason the bot rosters are (matchmaking.ts)
 * — a table of a few hundred names is a few hundred chances to leave one stale — and
 * seeded on the entry's own index so a colony's size does not change under the player
 * between one search and the next.
 */
export function directory(): Person[] {
  const out: Person[] = [];
  RIVAL_NAMES.forEach((base, i) => {
    for (let k = 0; k < 6; k++) {
      const rnd = seeded(i * 977 + k * 31 + 7);
      const name = `${base}${((i * 13 + k * 29) % 89) + 11}`;
      // Spread across the orders of magnitude a career actually covers, so a player finds
      // colonies both above and below their own whatever size they are.
      const scale = 10 ** (rnd() * 4.6);
      out.push({
        id: personId(name),
        name,
        colony: Math.max(COLONY_START, Math.round(COLONY_START * scale)),
        species: DIRECTORY_SPECIES[(i + k) % DIRECTORY_SPECIES.length] as SpeciesId,
      });
    }
  });
  return out;
}

export class LocalFriendService implements FriendService {
  private all: Person[] | null = null;

  /**
   * Case-insensitive, matched anywhere in the name — a player types three letters they
   * half-remember, not a prefix. An empty query returns the biggest colonies instead of
   * nothing, so the screen has something to show before anything is typed.
   */
  search(query: string): Promise<Person[]> {
    this.all ??= directory();
    const q = query.trim().toLowerCase();
    const hits = q
      ? this.all.filter((p) => p.name.toLowerCase().includes(q))
      : [...this.all].sort((a, b) => b.colony - a.colony);
    return Promise.resolve(hits.slice(0, FRIEND_RESULTS));
  }
}

/**
 * The two requests a new colony arrives to.
 *
 * There is no server, so nothing can ever arrive on its own — and a screen whose accept
 * and decline buttons no player will ever see is a screen nobody can tell is finished.
 * These are seeded from the directory and are the same two for everyone, which is the same
 * honest fiction the ladder's rivals and the matchmaker's bots are.
 */
export function seedRequests(): Person[] {
  const all = directory();
  return [all[17], all[54]].filter((p): p is Person => !!p);
}
