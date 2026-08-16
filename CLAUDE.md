# Zombie Ants — project guide

Read this before doing anything. It is the memory this project has across sessions.

---

## 1. The project

**Zombie Ants** is a mobile-first, turn-based territory strategy game. Two ant colonies fight
for a square grid. At the centre sleeps **the Hive** — a wild queen infected with
*Ophiocordyceps*, the real parasitic fungus. Capture her for a growth surge; lose your own
queen and the match is over.

Grounded in real ant biology: nine real species whose real behaviours are their abilities.

- Repo: `ilebaca/zombie-ants`
- Design spec: `docs/GDD.html` — accurate to the shipped rules, use it as the reference
- Legacy build: `legacy/zombie-ants-pro.html` — the original single-file game, still playable.
  It is the behavioural source of truth for anything this codebase has not ported yet.

## 2. Who you are working with

Milan — **not a developer**. He directs the design, reviews the result, and sends short
corrections. He does not read long explanations and does not want to run complex tooling.

**How to work with him:**
- **Keep answers very short.** A few lines. No walls of text, no essays of caveats.
- He will describe problems in plain language ("veins look wrong", "AI is too passive").
  Translate that into the technical cause yourself; don't ask him to diagnose.
- Do the work, verify it, report briefly. Don't hand him tasks he can't do.
- Be honest when something is a real trade-off or when you are unsure. Don't oversell.

**He cannot see your code and you cannot see the screen.** He is your eyes for anything
visual; you are his hands for anything technical. So: run tests before claiming something
works, and when a change is visual, say plainly that he needs to check it.

## 3. Architecture — the one rule that matters

```
src/engine/    PURE game rules. No DOM, no canvas, no animation, no randomness, no I/O.
src/ai/        Search + evaluation. Consumes the engine only.
src/render/    Canvas board. Consumes engine EVENTS and draws them.
src/ui/        Meta screens (home, trophy road, anthill, shop...).
src/platform/  Storage, Capacitor, purchases.
```

**The engine never triggers animation.** Actions return an `EngineEvent[]` describing what
happened; the renderer decides how to dramatise it. This is not stylistic — it is why the AI
can simulate thousands of futures safely, and why animation work can never break game rules.

The original build tangled these (rules called `beginReveal()`/`fxPop()` directly), which
forced a global `G.searching` flag to suppress effects during AI search. **Do not reintroduce
that pattern.**

Dependency direction is one-way: `ui → render → ai → engine`. The engine imports nothing.

## 4. Hard game rules — do not "improve" these

These were each decided deliberately, several after bugs. Changing one silently breaks the game.

1. **Combat is fully deterministic. There is no RNG anywhere in the engine.**
   Same attack vs. same defence always gives the identical result. Players count it out
   before committing. Never add randomness to combat resolution.

2. **Connectivity is nest-anchored.** A tile is active only if a chain of same-owner tiles
   (captured tiles *or* veins) links it back to that player's nest. Anything detached from
   the queen produces nothing and earns no income.
   - Tunnel galleries are their own roots — they can never be cut off.
   - Hive tiles are never considered cut off.
   - Recompute connectivity after every action **and immediately after effects tick**, so
     venom/fire that severs a colony deactivates the far part at once.

3. **Veins have no defence.** Attacking an enemy vein captures it instantly — no combat, no
   losses. It becomes a stable.

4. **Dangling veins prune.** A vein needs ≥2 same-owner colony neighbours. When it loses an
   anchor the trail is destroyed back to the nearest captured tile. Junctions survive: only
   the genuinely dead branch prunes.

5. **Veins are infrastructure, not tiles.** They produce nothing, cannot be a Rally target,
   and are skipped by Fortify. Troops landing on a vein promote it to a stable.

6. **Losing your nest loses the match** — immediately, regardless of how much else you hold.
   Capturing the enemy nest wins it the same way.

7. **A tile always keeps a floor of 1 soldier** (5 on a tunnel mouth). You can never empty one.

8. **The AI gets no anthill upgrades and no research.** It competes on decision quality only,
   so player progression never becomes mandatory.

## 5. Gotchas — bugs already paid for once

Each of these cost a debugging round. Do not repeat them.

- **Captured nests must stay `struct: "nest"`.** A refactor relabelled them `"stable"` on
  capture, which ran *before* the win check — so capturing the enemy nest stopped ending the
  game. Capture the "was this a nest?" flag *before* mutating the tile.
- **Captured hive tiles must become stables.** They were briefly made veins, and the vein
  pruner then deleted them — a won fight looked like a loss, and captured hive tiles were
  unselectable.
- **Never prune veins on Flee.** Flee relocates mobile garrisons only. Pruning during flee
  destroyed trails and detached units. Flee must not break structure at all.
- **Flee cannot push:** veins, tunnels, resources, hive queen/guards, blocked tiles.
- **Feeding Swarm must snapshot its targets at cast time.** Resolving while mutating let
  newly captured tiles seed new targets and it cascaded across the whole map.
- **Permanent leaves are a running total, not per-cast.** Cap is the total the player may ever
  hold (1/2/3 by research level); each cast promotes at most **one** new leaf.
- **Removing an upgrade from the catalogue is not enough** — remove its *effect* too. A deleted
  "Tunnel Network" chamber kept pre-digging bonus starting tiles from stale save data.
- **Starting position is always exactly 5 tiles.** If it isn't, something is applying a
  legacy bonus.
- **Search must not mutate the profile.** Simulation writes no stats, currencies or storage.

## 6. Testing

`npm test` runs Vitest. **Run it before saying a change works.**

The engine is pure, so tests are cheap: build a board, apply an action, assert the result.
Every rule in §4 and every gotcha in §5 should have a test. When you fix a bug, add the test
that would have caught it — that is how this list stops growing.

Do not claim a visual change is correct. You cannot see it. Say it needs checking.

## 7. Conventions

- TypeScript, `strict: true`. Model tile states as unions (`"nest" | "stable" | "vein"`), not
  strings — most past bugs were state-shape errors a type would have caught.
- Prefer pure functions over mutation where practical; where the engine does mutate state, it
  does so through explicit action functions that also return events.
- Small named functions over clever one-liners. Milan reads this code occasionally.
- Comment the *why*, not the *what*, especially for the rules in §4.
- Keep commits small and focused; the ability to roll back one change matters here.

## 8. Balance snapshot

Tuned by AI-vs-AI play; **not yet validated by human playtesting** — treat numbers as
provisional and say so if asked.

- Production/turn: nest 2, stable 1, resource stable 3 (up to 6 with Fungal Cultivation)
- Flat defence: nest +6, stable +1, resource stable +2, wild guard +1, vein 0, hive 0
- Species multipliers span 0.70–1.25 — deliberately narrow. Species change *how* you win.
- Trophies: +30 win / −15 loss, floored at 0
- Maps: Skirmish 7×7 (wake 10, limit 32), Corridor 9×9 (14/45), Gauntlet 13×13 (18/80)

## 9. Roadmap

1. Finish the engine port + tests (in progress)
2. Canvas renderer driven by engine events
3. Meta UI screens ported from the legacy build
4. Capacitor wrap → Android build
5. RevenueCat in-app purchases (the legacy `buyPass()`/shop grants are the integration points)
6. Play Console release

Later, server-backed: async PvP, ranked ladder, seasons, replays. Determinism makes
server-side verification and replays nearly free — keep it that way.
