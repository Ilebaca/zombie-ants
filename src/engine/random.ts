/**
 * Seeded, deterministic randomness.
 *
 * Two abilities are scatter effects by design: Venom Rain sprays the board, and Fungal
 * Garden picks which fresh leaf becomes permanent. The legacy build used `Math.random()`,
 * which would have broken three things here — AI search (evaluating a move would give a
 * different answer each time it was tried), replays, and future server-side verification.
 *
 * So the generator lives *in* GameState and is snapshot/restored with everything else.
 * Same seed plus same moves always replays identically.
 *
 * COMBAT NEVER TOUCHES THIS. `fight()` is and stays pure arithmetic (CLAUDE.md §4.1) —
 * this is only ever consulted for where an ability scatters, never for who wins a fight.
 */

/** mulberry32 — small, fast, good enough for scatter, and trivially serialisable. */
export function nextRandom(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6D2B79F5) | 0;
  let t = Math.imul(holder.rng ^ (holder.rng >>> 15), 1 | holder.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * A standalone generator: give it a seed, get a function that yields the next number.
 *
 * `nextRandom` above is for the BOARD, whose seed is a field on the state so it can be
 * snapshot and restored. Everything else that needs a repeatable sequence — where the
 * scenery is placed, which colonies a chapter fields, which note a bar of music plays —
 * wants a closure over its own seed instead, and there were five hand-written copies of
 * this LCG scattered through `platform/` and `render/` doing exactly that.
 *
 * Two of the five started at `seed >>> 0` and three at `(seed >>> 0) || 1`, so a seed of
 * zero produced two different sequences depending on which copy you happened to be
 * looking at — the kind of difference nothing ever fails on and nobody can see. One
 * function, and zero is folded to one: a state of zero is the one value this generator
 * cannot climb out of quickly.
 */
export function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Integer in [0, max). */
export function nextInt(holder: { rng: number }, max: number): number {
  return Math.floor(nextRandom(holder) * max);
}

/** In-place Fisher-Yates using the seeded stream. */
export function shuffle<T>(holder: { rng: number }, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1);
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
  return items;
}

/** Turn any string into a seed, so a match can be keyed by a shareable code. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
