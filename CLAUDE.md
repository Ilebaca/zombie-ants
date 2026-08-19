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
  It is the behavioural **and visual** source of truth: `src/ui/game.css` is a VERBATIM copy
  of its `<style>` block, and the screens emit its DOM (same ids, same class names) so those
  rules apply unchanged. A test compares the two files line by line — see §12.

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
src/engine/    PURE game rules. No DOM, no canvas, no animation, no I/O, and no randomness
               beyond the seeded generator on GameState (§4.1) — never Math.random().
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

1. **Combat is fully deterministic. `fight()` contains no randomness and never may.**
   Same attack vs. same defence always gives the identical result. Players count it out
   before committing. Never add randomness to combat resolution.

   Two abilities *are* scatter effects by design: where Venom Rain's barrage lands, and
   which fresh leaf Fungal Garden makes permanent. They draw from a **seeded generator on
   `GameState.rng`** — never `Math.random()` — and it is snapshot/restored with the board.
   So the engine stays reproducible: same seed + same moves replays identically, AI search
   cannot leak scatter into the real match, and server-side replay stays free.

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
- **Never measure the canvas against a zero-sized container.** `Layout.measure` writes the
  result to `canvas.style`, and an inline `width: 0px` outranks the stylesheet's `100%`. One
  early measurement (before first layout, or while the tab isn't compositing) pinned the board
  at 0×0 permanently — the container never resized again, so the ResizeObserver never re-fired.
  The renderer now skips zero measurements and retries on the next frame.
- **An ability that returns `[]` did not fire.** `activateAbility` returns no events when it
  had no legal target, and the cooldown must stay unspent — otherwise a mistimed tap burns
  six turns for nothing.
- **A leaf cast only walls ground that has no leaf on it yet.** Casting twice in a row does
  nothing the second time; the walls have to wither first. A test that ignores this looks
  like a broken permanent-leaf cap.
- **`checkWipe` runs after an ability too.** A test board with no enemy tiles ends the match
  on the first cast, and every later assertion silently tests nothing.
- **Reveal progress must never live on a tile.** The legacy build stored `t.rv`/`t.rvDir` on
  the tile, which put view state inside the engine where snapshot/restore would copy it. It
  lives in `RevealTracker`, keyed by coordinate.

## 6. Testing

`npm test` runs Vitest. **Run it before saying a change works.**

Tests run in Node by default; anything under `src/ui/` gets jsdom (`environmentMatchGlobs`
in `vite.config.ts`), so a meta screen can be built, clicked and asserted on. jsdom has no
canvas — `getContext` is stubbed to return null in those tests, which doubles as proof the
screens survive a context they cannot draw into.

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

1. Engine port + tests ✅ (all nine abilities implemented)
2. Canvas renderer driven by engine events ✅
3. Meta UI ✅ — every legacy screen is ported except two: **lucky hatch** and the
   (unreachable in legacy) profile card. Built: home with its top bar and five-tab
   bottom nav, the three setup steps, Anthill, Antarium + per-species page, Colony/quests
   with the XP spine, Trophy Road, Challenges, daily challenge, Leaderboard, Settings, the
   slide-in menu, How to play, and the result card.
   The shop is built and sells through `platform/purchases.ts`: a `PurchaseGateway`
   interface with a `DemoGateway` that grants without charging. Swapping in RevenueCat is
   one new implementation of that interface — the screen and the grant code do not change.
   It deliberately sells only what the game can spend (mycelium, pheromone, the Trophy Pass,
   the premium colony); the lucky hatch needs the larva currency and a cosmetics pool,
   neither of which exists yet, which is why larva rewards are paid in pheromone (§10).
4. Capacitor wrap → Android build
5. RevenueCat in-app purchases — implement `PurchaseGateway` against it and hand it to
   `App`; nothing else moves. Needs, from Milan: a Play Console account, the products
   created there with these ids (`platform/purchases.ts`), and a RevenueCat key.
6. Play Console release

Later, server-backed: async PvP, ranked ladder, seasons, replays. Determinism makes
server-side verification and replays nearly free — keep it that way.

**Remaining gap: the shop.** Everything else in the meta layer is built. The species picker
now enforces `profile.unlocked` (locked colonies stay visible so the player can see the
goal), because the Antarium can sell them.

The progression layer sits in three files, and none of them is reachable from the engine:
- `platform/catalogue.ts` — prices and player-facing copy. The engine still owns what a
  chamber or research level *does*; this owns what it costs and what it says.
- `platform/road.ts` — Trophy Road reward table, pure functions of a trophy count.
- `platform/quests.ts` — the daily pool and a day-seeded roll.

Currencies have separate jobs: **mycelium** buys chambers and species, **pheromone** buys
research. Every purchase goes through a `ProfileStore` method that returns `false` rather
than throwing when the player cannot afford it, so a screen can tap optimistically and
nothing ever goes half-spent.

## 10. Staying identical to the legacy build

The ported UI drifted badly once already: 442 of the legacy stylesheet's rules were missing
and 156 more differed, and every meta screen had invented markup. The fix was to stop
hand-porting. **`src/ui/game.css` is a straight copy of the legacy `<style>` block** and
`src/ui/__tests__/css-parity.test.ts` fails the suite if the two files diverge by a single
line. Change a rule in one, change it in the other.

Because the stylesheet selects by id (`#home`'s artwork, the bottom-nav padding shared by
`#antarium`/`#anthill`/…) and by class, **those strings are styling, not labels.** Renaming
`.hillwrap` does not rename anything; it unstyles the screen.

How to check a screen really matches, without being able to see it:

1. Serve both (`npm run dev`; the legacy file is at `/legacy/zombie-ants-pro.html`).
2. Walk each build to the same screen **through its own UI** — jumping straight to a screen
   skips side effects, e.g. the species picker is what recolours `--you`.
3. Dump a normalised DOM shape (tag + id + sorted classes + leaf text) for both and diff.
   That names the exact element that differs, which a screenshot cannot.
4. Then pixel-diff the screenshots (pixelmatch) to catch spacing the DOM cannot show. Most
   remaining differences turn out to be one inline style: the legacy build sets a few
   margins inline (`secthead`), and those do not live in the stylesheet.

### Deliberate deviations

These differ from the legacy build **on purpose**. Anything else that differs is a bug.

- **Larva.** The lucky-hatch currency is not ported, so rewards paid in larva pay pheromone
  instead (50 each). Affects the Trophy Road tables, two quests and the trophy-strip icon.
- **Daily quest roll.** Legacy rolls with `Math.random` and stores the result; this build
  derives the day's three from the day number (§11), so a reload cannot reroll.
- **Formation thumbnails.** Legacy draws them once at boot and never redraws, so they keep
  the default orange after the species picker recolours the palette. This build redraws
  them, so they match the rest of the screen.
- **`RESEARCH LV NaN`.** The legacy species page reads a field that does not exist. Ours
  counts the levels properly.
- **Leaderboard "You".** Legacy shows a hardcoded 999 points; ours shows real trophies.
- **Venom Rain's description** says "10 troops/turn" in the legacy build, but both engines
  do 7. The text was copied verbatim, so the number is wrong in both — worth deciding.

## 11. Verifying visual work

You cannot see the screen, so "it renders" is not something to assert from reading code.
Two things that do work:

- **Recording-context tests** (`src/render/__tests__/`). A fake `CanvasRenderingContext2D`
  records draw calls, so the *structure* of a frame is testable: veins draw bars not filled
  cells, cut-off tiles grey out, counts hide during the win flood. Mutation-check new
  assertions — a recorder test that passes against broken code is worse than none.
- **jsdom screen tests** (`src/ui/__tests__/meta.test.ts`). The progression screens are
  driven the way a player drives them: tap a buy button, assert the profile changed and the
  card re-rendered. Mutation-check these the same way — break the code on purpose and make
  sure the test notices.
- **Driving the dev server** via the browser tools: dispatch synthetic `pointerdown`s at
  computed cell centres and read the HUD back. That verified input → engine → HUD → AI turn.
  Playwright is not a project dependency; install it in a scratch directory and point it at
  the preinstalled Chromium rather than adding tooling Milan would have to run.
  Note the preview pane may be hidden, in which case `requestAnimationFrame` never fires and
  the canvas stays blank — that is not a rendering bug, so check `document.hidden` first.

Neither proves it *looks* right. Say plainly that Milan needs to check anything visual.

## 12. Progression & storage

`src/platform/` owns everything persistent. The engine never imports it — that separation is
what keeps AI search from writing stats or currencies (§5).

- `KeyValueStore` is an interface. Web uses `localStorage`; the Capacitor build can swap in
  Preferences without touching profile code. Every write is wrapped — private browsing and
  quota errors must never crash a match.
- `ProfileStore.get()` returns a normalised profile. **`normalise()` is the trust boundary:**
  saves outlive code, so anything malformed degrades to a default rather than producing a
  `NaN` chamber level that would silently distort combat maths. Levels are clamped to their
  caps, and a save stripped of every species is repopulated — the player must always have
  something to field.
- **`normalise()` fallbacks are the default profile's values, never bare zeros.** A new save
  has no `mycel` field at all, and falling back to 0 silently cancelled the starting grant.
- Daily quests roll from the **day number**, not from stored randomness, so a reload mid-day
  returns the same three. Progress is written by the app shell from engine events it
  receives through `MatchScreen`'s `onEvents` — the engine knows nothing about quests, and
  opening the quest screen can never award anything by itself.
- `ProfileStore.modsFor(species)` is the only source of `PlayerMods`. It returns the player's
  chambers + that species' research, and **always hands the AI the neutral set** (§4.8).
  Pass the same mods object to the match's `ActionContext`, or research shows up in the
  income readout while doing nothing in a fight.
