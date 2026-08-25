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

**Always end a deploy with the link.** Every time you push to `main` and the build goes
out, give him https://ilebaca.github.io/zombie-ants/ in the reply — he opens it on a phone
and should never have to ask for it or scroll back to find it. Say which build went out
(Settings shows the same stamp), so a cached page is obvious.

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
     venom/fire that severs a colony deactivates the far part at once. `startTurn` prunes
     trails and rebuilds supply lines right after `tickEffects` for exactly this reason.

3. **A leaf wall blocks everything, tunnelling included.** `blockedByEnemyLeaf` stops every
   move, attack and travel onto an enemy wall; `tunnelTargets` refuses to surface there too.
   A gallery is a way past the ARMY in front of a wall, not a loophole in the wall. Your own
   wall is still ground you may surface on.

4. **Veins have no defence.** Attacking an enemy vein captures it instantly — no combat, no
   losses. It becomes a stable. **Venom destroys one outright** — a vein holds no garrison,
   so the damage arithmetic can never bite it, and it has to be a special case or the
   barrage falls straight through the thing most worth hitting.

5. **Dangling veins prune.** A vein needs ≥2 same-owner colony neighbours. When it loses an
   anchor the trail is destroyed back to the nearest captured tile. Junctions survive: only
   the genuinely dead branch prunes.

6. **Veins are infrastructure, not tiles.** They produce nothing, cannot be a Rally target,
   and are skipped by Fortify. Troops landing on a vein promote it to a stable.

7. **The Hive is a contest, not a tap.** Only the QUEEN — the middle tile — grants the
   surge; taking a guard just takes a tile. Taking her kills her: all five tiles and the
   troops on them become the captor's, and the surge runs for the map's buff length. When it
   lapses the tiles go back to bare ground and the queen is GONE for `HIVE_COOLDOWN` turns
   (4) before growing back one level stronger. That gap is deliberate — without it the
   colony that just rode a surge walks straight onto a fresh queen. The GDD describes the
   respawn but sets no gap, so the number is a design decision, not a port.
   - **While she is dead there is nothing there.** Her tiles are ordinary ground: no
     garrison, no fight, and no surge for stepping on them. They still LOOK like hive tiles,
     which is why the combat path has to ask `queenIsTakeable` rather than checking the terrain
     — otherwise attacking the empty middle tile beat a garrison of zero and handed out a
     full surge from a corpse.
   - **She must always come back harder.** The level MULTIPLIES the whole garrison
     (`HIVE_LEVEL_GROWTH`) and `awokeTurn` survives a respawn, so the growth clock runs from
     the hive's first waking for the whole match. With a flat per-level bonus and a clock
     that restarted, a long-ignored level-1 queen outclassed the level-2 queen who replaced
     her — capturing the Hive made the Hive easier.
   - **The surge is a COLONY effect, so it has to look like one.** The wave that marks it
     leaves the queen and washes out across every tile the holder owns, each lighting as the
     front reaches its distance from her. Lighting only the five hive tiles said the
     opposite — that whatever was happening was happening over there, on the ground she used
     to sit on. The front travels at a constant tiles-per-second and the gap behind it is
     measured in tiles too, so a four-tile colony and a forty-tile one look the same; a
     fixed period would crawl early and streak across the board late.
   - **The Hive eats what is left standing on it.** Troops on the five tiles when the surge
     lapses, and troops camped on the bare ground when she returns, are banked
     (`hive.banked`) and come back as part of the next garrison, split in proportion to what
     each tile is already worth. Deleting them was a garrison the player had paid for
     vanishing with no explanation, and camping the grave now feeds her rather than denying
     the respawn.

8. **Losing your nest loses the match** — immediately, regardless of how much else you hold.
   Capturing the enemy nest wins it the same way. **There is no turn limit.** The clock used
   to run out and hand the match to whoever held more ground, which decided games nobody had
   won — a player ahead on territory could stop playing, and one behind had no route back
   however the position stood. `limits.turnLimit` survives as the length a match is EXPECTED
   to run: it paces nothing by itself, the AI prices income against it, and the measurement
   tools adjudicate there so their numbers stay comparable. It is not a rule of the game, and
   two AIs that never crack a nest will play forever without one — which is why `arena.ts`
   stops the match itself rather than waiting for the engine to.

9. **A tile always keeps a floor of 1 soldier** (5 on a tunnel mouth). You can never empty one.

10. **The AI gets no anthill upgrades and no research.** It competes on decision quality only,
   so player progression never becomes mandatory.

## 4a. The AI

`src/ai/` is three files: `evaluate.ts` (what a position is worth), `moves.ts` (what can be
played), `search.ts` (alpha-beta over the two). It consumes the engine and nothing else.

**The three difficulties are three different players, not one player at three depths.** Easy
searches one ply on a deliberately blind evaluation and cannot reinforce, so it never masses
an army and never sees a tile hanging — the mistakes a beginner makes. Normal searches three
plies with the full evaluation. Hard deepens iteratively to eight with quiescence, the whole
action set, and its ability chosen by search.

**Strength is measured, never assumed.** `npm run ladder [games] [map] [speed]` plays the
levels against each other; `npm run arena <a> <b> [games]` plays two; `tools/eval-ab.ts`
sweeps one evaluation weight. `speed` divides every level's node budget by the same factor
so a ladder runs in minutes — it changes how deep everyone gets, not who should win.

**A mirror match is not a coin flip.** Combat is deterministic and so are the AIs, so the
same difficulty against itself with the same species has essentially ONE outcome per side
assignment — the seed only shifts ability scatter. Four of six species hand the first player
every game on the small board; two hand it to the second. That is determinism, not a
balance measurement, and it says nothing about whether the game is fair for a human.
`tools/fairness.ts` reports it per species so the shape is visible.

**Two evenly matched AIs cannot be told apart by a short match.** `match()` alternates
sides to cancel the first-move advantage (§8), which works — but when the two are close,
side decides every game, so A wins the eight where it is on the good side and loses the
other eight. The result is exactly 50% every single time, which looks like a precise
measurement and is the opposite of one. A run that returns the same score for several
different configurations is reporting "too close to call", not "identical". Widen the gap
or play many more games.

**The tools budget by nodes, the game budgets by the clock.** That difference is deliberate
and matters. Shipped, a wall-clock budget is right: a slow phone thinks less rather than
stuttering. Measuring, it is useless — a busy machine also thinks less, so a ladder run off
a clock measures the load on the box as much as the AI, and two runs are not comparable.
Several early readings in this file's history were contaminated exactly that way.

Things self-play has already settled. Do not undo them without re-running the ladder:

- **A pass of iterative deepening that ran out of time must be thrown away.** When the
  budget latches mid-pass, every node still to visit returns a static evaluation instead of
  searching, so that pass's numbers are a mixture of real values and stand-ins and are not
  comparable to each other. Adopting them discarded a complete, trustworthy answer from the
  depth below for a truncated one — a completed depth 3 reinforcing a queen about to fall,
  a truncated depth 5 marching the garrison off across the board.
- **The search must hand the turn over, not just apply the move.** For a long time it
  applied an action and recursed without calling `endTurn`, so nothing that happens BETWEEN
  turns happened in the tree: no production, no effects ticking, no cooldowns counting down,
  no hive clock, no turn limit. Every ply took the imagined game further from the real one,
  so more search made the AI play WORSE — it was optimising a position that could not occur.
  Fixing it took `hard` from 50% against `normal` to 85%, and `normal` from 88% against
  `easy` to 100%. It costs a production pass per node and is worth every bit of it.
- **An evaluation that only counts what a player HAS makes deeper search worse.** The
  original one did, and `hard` scored 35% against `normal` — the ladder was inverted at the
  top and every unit test passed. Search optimises whatever it is given; a function that
  cannot see danger walks a stack into a losing fight because the position looks fine one
  ply before the punishment. The `hanging` term (what the opponent can capture next move,
  which deterministic combat makes exact arithmetic) is what fixed it.
- **Quiescence is not optional.** Stop the search on a capture and the recapture is
  invisible. In a game this capture-dense that single blind spot is worth more than several
  plies of depth.
- **Rally is a trap.** Allowed whenever the pooled fist beat something, it scored **10%**
  against the same AI without it. It leaves every other tile at its one-soldier floor and a
  fist can only be in one place. It is generated for exactly two cases: the fist takes the
  enemy queen (there is no next turn to be punished in) and the AI's own queen falls
  otherwise. Widening that gate is how this regresses.
- **Travel and rally are root-only.** Enumerating travel targets is a flood-fill from every
  tile that can act; doing it at every node cost more than a hundredfold for a fraction of a
  ply. The AI plays them, it just does not model the opponent playing them deep in a line.
- **Budgets are wall-clock as well as node count**, so a slow phone thinks less rather than
  stuttering. The clock is read on a counter every 512 nodes, not on a bitmask — a bitmask
  only lands on the sample point by luck and the search sails past its deadline.
- **A colony graph's articulation points are not a good fragility signal**, and scaling the
  tile term up as the turn limit nears is not a good urgency signal. Both were tried, both
  cost double-digit win rate, and both are commented at the point where they were removed.
- **Veins are priced at a quarter of a tile**, because they produce nothing and prune when
  they lose an anchor. Counting one as a whole tile taught the AI to prefer a four-tile
  travel — four veins — over an adjacent resource.

Measured ladder (24 games each, sides and species swapped, node-budgeted): hard beats
normal **96%**, hard beats easy **100%**, normal beats easy **100%**. Before any of this
work, hard scored **35%** against normal — the ladder was inverted at the top.

**The search runs in a Web Worker** (`ai/worker.ts`, driven by `ai/thinker.ts`). Hard thinks
for about a third of a second and it does it synchronously, so on the main thread every AI
turn froze the page — measured in the browser at a **377 ms** worst frame gap, dropping to
**45 ms** through the worker. That was invisible while the board was still; the marching ants
made it the most obvious thing in the game, landing exactly as the player's move finished
filling in. Nothing about the search changed to move it: the engine is pure and seeded, so a
copy of the board searched elsewhere reaches the same answer, and the mutated copy is adopted
whole (`adopt`, which is `restore(live, snapshot(next))`). A platform with no Worker thinks
inline, exactly as before — that is also every test, since jsdom has none. A reply that
arrives after the match ended is DROPPED rather than adopted, or a surrender would be undone
by it — and `think` works on a COPY either way, so the caller decides both whether to take
the answer and WHEN. The when matters: the answer usually arrives well before the AI is due
to move, and adopting it on arrival put the finished move on the board a beat before the
reveal that was supposed to be showing it happen. The destination flashed, then animated
into. It is adopted in the same tick as the events are consumed (`playAI`), and
`src/ui/__tests__/match.test.ts` drives the real screen on a fake clock to hold that.

**Depth is the only dial that separates hard from normal.** Everything else that makes the
AI play well — pricing income by what it will still pay out, rating a travel by its reach,
cutting a vein by how much it severs, treating a takeable queen as near-terminal — is
correct play and belongs in both, so improving the AI tends to CLOSE the ladder rather than
widen it. Taking a capability away from normal to reopen it does not work: without long
travel it scored 44% against easy, which is worse than easy rather than merely worse than
hard. Two plies against eight is what gives hard 96% while normal still beats easy 100%.

**Almost every AI match is decided on tile count, not by a kill.** Of sixteen hard-vs-easy
games none ended by capturing a queen; of sixteen hard-vs-normal, two did. So a nest capture
is rare rather than impossible — roughly one game in eight between evenly-matched sides, and
none at all against an opponent that sprawls. A nest carries +6 flat defence and both sides
reinforce theirs competently, so cracking one needs a fist the AI usually has better uses
for. Two things follow. Matches nearly always run their full length, which is a pacing fact
worth knowing before tuning anything; and because the result comes down to territory, a
greedy land-grab is a respectable strategy — which is how `easy` steals games off `hard`.
Whether the nest should be more crackable is a design decision (§4.6 is deliberate) — do not
tune it away silently.

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
- **Flee is a rout, not a teleport.** The walk ported from the legacy build stepped
  DIAGONALLY (the one movement this game never makes), ran straight through rocks, leaf
  walls and the caster's own tiles, and asked "am I clear yet?" of the caster's whole
  colony — so one outpost past the runner dragged a garrison seven tiles out of a
  three-tile ability. It now runs along ONE axis, fixed before the run (recomputing it each
  step sends the runner oscillating between two of the caster's tiles), stops at the first
  tile it cannot enter, and never runs further than the reach. It also refuses to land on a
  wild garrison, which used to leave a tile owned by the fleeing colony with a neutral
  garrison still on it — a state the game has no other way to produce.
- **A `fled` event that nothing animates looks like a bug.** The renderer had no case for
  it, so garrisons vanished off one tile and appeared on another with no streak and no
  fill. `claimed` on the event says whether the runner took new ground, so a merge into the
  colony's own tile does not re-fill it (same trap as travel).
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
- **A travel only fills the ground it actually CLAIMS.** A long send crosses tiles the
  player already owns; re-revealing those made the colony look rebuilt from scratch every
  time anything walked over it. `travel()` emits one `veinLaid` per step it claims, so the
  animator reveals exactly that set — and each keeps its true slot along the path, so the
  front still crosses owned ground at the same rate, with nothing to light up there.
- **A travel's trail is emitted BEFORE the travel event.** `travel()` pushes one `veinLaid`
  per step and only then the `travel` itself. The animator used to react to the travel when
  it arrived, which was too late: every vein had already opened its own one-tile reveal, all
  starting on the same frame, so a four-tile send flashed its whole trail in at once instead
  of filling tile by tile. `animate()` now pre-scans the batch for travel paths before
  walking it. Any new event that participates in a group has the same hazard — scan first.
- **Scenery is baked once, not drawn per frame.** The undergrowth around the playfield
  (`render/terrain.ts`) is a still life — rocks, logs, ferns — and redrawing it sixty times
  a second was by far the most expensive thing on the frame. It renders to an offscreen
  canvas keyed on size and grid origin, and blits. Placement is seeded, never `Math.random`
  at draw time, or the scenery reshuffles itself on every resize.
- **A colony's INNER corners need their own pass.** `capturedCorners` suppresses a corner
  radius wherever a same-owner neighbour touches, which is what fuses the cells into one
  slab — but three cells wrapped round an empty one leave a sharp reflex vertex that no
  per-cell radius can reach. Rounding it ADDS material (a fillet in the notch) rather than
  cutting a corner off, so it is a separate shape drawn after the cells, on both the face
  and the under-band. It only fillets into open ground: an enemy cell, a vein or a rock has
  something drawn there already.
- **Veins get a spine, not an outline.** The tile draws a vein as a bar through its middle,
  so `territoryLoops` excludes veins and `veinTrails` traces the middle of the bar instead.
  Outlining a one-tile-wide trail turns a line into a tube whose two dashed sides march
  against each other. The spine is chained into as few polylines as possible for the same
  reason the outline is traced into loops, and the walk carries STRAIGHT on through a
  junction — turn there and a straight run gets chopped up and rounded where the bar
  underneath goes straight.
- **Two cells touching only at a CORNER are not connected.** Four boundary edges arrive at
  that one point and either pairing joins up, so the naive walk fuses them into a single
  figure-eight and the dashes run between the two as though there were ground there. Taking
  the sharpest RIGHT turn at every junction keeps them apart, because the trace is wound
  clockwise per cell. Everywhere else there is only one edge to take, so the rule is free.
- **A destroyed tile has to outlive the engine.** The rules clear it the instant it dies, so
  without the `crumble` effect a venom hit that eats a four-tile trail leaves no trace at
  all — the biggest thing that can happen on a turn, invisible. The effect draws over ground
  the engine has already cleared, which gives the tile its stay of execution without any
  view state living on the tile (§5, reveal).
- **The board redraws every frame, so per-frame work is real work.** The trace behind the
  ants (outline, vein spines, inner corners) is cached on a cheap integer signature of the
  grid and only rebuilt when a tile changes hands or lands — it was rebuilding a few thousand
  short-lived objects a second for an answer that was almost always identical. Every loop is
  a SUBPATH of one path stroked once, rather than a stroke each: a colony threaded with its
  own veins traces a couple of dozen rings, and a dashed stroke is the most expensive call on
  the board. Collinear points are dropped before stroking — the tracer emits one per grid
  corner, and an arc through a collinear corner is a straight line.
- **The outline must be traced against the REVEAL, not the engine.** A tile is the player's
  the instant the move resolves, but it fills in over the next quarter-second — so tracing
  off engine state alone snapped the whole boundary out to the far end of a long send while
  the troops were still on tile one. `territoryLoops`/`veinTrails` take a "has this tile
  landed?" predicate and `drawTrails` supplies it from `RevealTracker`.
- **Nothing but the trail may draw a dashed border.** Leaf after-armour used to, in the
  owner's colour, and Fungal Growth armours every frontline tile at once — so one cast
  filled the board with dashed rings that read as broken colony outlines. It is a corner
  shield on a light plate now. Any new per-tile marker has the same trap.
- **The marching ants need closed LOOPS, not edges.** `render/trails.ts` traces each
  colony's boundary into real loops so one dash offset carries the whole way round. Stroking
  each boundary edge separately is far simpler and looks wrong: every edge restarts the dash
  pattern, so the marks sit still at corners and march in contradictory directions.
- **Reveal progress must never live on a tile.** The legacy build stored `t.rv`/`t.rvDir` on
  the tile, which put view state inside the engine where snapshot/restore would copy it. It
  lives in `RevealTracker`, keyed by coordinate.

## 5a. Invariants

`src/engine/__tests__/invariants.test.ts` plays real games and checks the WHOLE board after
every ability, move and hand-over: no owned tile without a structure or below the one-soldier
floor, no owned tile still holding a wild garrison, no vein standing on fewer than two
anchors, no stale supply-line cache, no surge without an owner. Every rule in §4 has its own
test on a board built to exercise it; this is the other half, and it is how four bugs nobody
was looking for turned up at once:

- an ability that cleared a trail's anchor did not prune, so the loose veins stood until
  somebody happened to move — §4.5 firing a turn late. `activateAbility` finishes the way an
  action does now. The §5 warning is about pruning DURING the flee walk, not after it.
- `promote` only recognised "ground" and "resource", so claiming a dead queen's tile (hive
  terrain, no garrison, §4.7) gave a tile with an owner and NO structure — a shape that
  anchors no vein, is not "captured" for the corner logic, and produces nothing.
- the supply-line cache went stale whenever the hive handed its five tiles back, because
  `startTurn` rebuilt before `hiveTick` rather than after it.
- a colony's own Wildfire burned the hive tiles IT was holding, because the branch that
  softens the neutral hive recognised them by terrain alone. Straight past the one-soldier
  floor to zero.

The lesson worth keeping: three of the four were the hive's terrain outliving its ownership.
Anything that asks "is this a hive tile?" almost always means "is this the NEUTRAL hive?".

**Settings shows the build it is running** (`src/platform/build.ts`, stamped by
`vite.config.ts` from the commit). Milan tests the deployed build on a phone, where a stale
cached page and a real bug look identical from the outside; reading the commit off the
screen settles which one it is in one line.

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
- **Moving first is worth roughly two to one.** Same difficulty, same species, both sides:
  the bottom-left corner (the player's) wins about 8 of 12 on the small board. The maps
  are 180°-symmetric and tested to be — so this is the move order, not the ground. Whether
  to compensate the second player is an open design question; note that the AI always plays
  second, so every match a player sees is one the AI starts behind in.
- Trophies: +30 win / −15 loss, floored at 0
- Maps: Skirmish 7×7 (wake 10, expected 32), Corridor 9×9 (14/45), Gauntlet 13×13 (18/80).
  The turn figure is an expectation, not a limit — nothing happens when it passes (§4.8).

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

A new player starts with nothing — no mycelium, no pheromone, no trophies. The legacy
build's 120-mycelium welcome grant is deliberately gone: it bought the first chamber
before the player knew what a chamber was.

Currencies have separate jobs: **mycelium** buys chambers and species, **pheromone** buys
research. Every purchase goes through a `ProfileStore` method that returns `false` rather
than throwing when the player cannot afford it, so a screen can tap optimistically and
nothing ever goes half-spent.

## 9a. The deck

The five bottom-bar screens — Shop, Anthill, Home, Antarium, Challenges — are not five
screens the router swaps between. They are one strip (`src/ui/deck.ts`) that the player
drags, with Home in the middle so everything is one swipe away, and the bar itself lives
OUTSIDE the strip so it never moves. Everything else — the setup flow, the drawer's
screens, the species page — is still a page shown on top, and hides the deck while it is up.

- **The deck is a transform, not a scroll container.** Native `scroll-snap` looked right
  until a screen with a scrolling panel was under the finger: the panel claimed the gesture
  and the deck stopped moving entirely. `touch-action` cannot fix that — it is computed
  down the whole hit-test chain, so `pan-y` on the panel to keep its list scrolling also
  forbids its ANCESTOR from panning sideways. Owning the gesture is the only way to have
  both, so the drag is claimed only once it is clearly horizontal and the list keeps
  everything else.
- **`preventDefault` on a non-passive `touchmove` is what stops the browser stealing it.**
  With only `touch-action: pan-y` on the rail, Chromium still took a swipe that began near
  the left edge, cancelled the pointer stream mid-drag, and navigated the app away to a
  blank page. `overscroll-behavior-x: none` on the root is needed too, and neither alone
  was enough.
- **A `pointercancel` is not a finished drag.** It arrives with no useful position
  (Chromium reports 0), so treating it like a `pointerup` read as a full-width swipe in the
  wrong direction and jumped a screen. It snaps back instead.
- **The screen the deck arrives on is REBUILT.** These screens read the profile: spend
  mycelium in the shop and the anthill two panels over is showing a stale balance. That is
  the same rule the router had — rebuild on entry — applied to a strip.

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

- **No drop shadows, and one 3D object.** Every panel, button and chip in the legacy build
  sits on a hard ledge (`0 4px 0`) and presses by dropping onto it. Stacked down a screen
  they read as a pile of objects rather than one surface, so `src/ui/skin.css` ends with a
  rule that clears every `box-shadow` and `text-shadow` in the app. The PLAY button keeps
  its solid ledge — it is the one control the home screen exists to offer. Two things had
  to be redrawn because they were built OUT of shadows rather than merely wearing one: the
  tour's spotlight ring (a border now) and the selected-colony marks (outlines).

These differ from the legacy build **on purpose**. Anything else that differs is a bug.

- **No emoji in the chrome.** The legacy build draws every tab, currency, chamber, quest and
  product with an emoji. That is the single loudest "unconsidered" signal an interface can
  carry: a cart, a plant pot, a dartboard and a house in one row of tabs, each from a
  different illustrator, at a different weight, rendered differently on every platform.
  `src/ui/icons.ts` is one family of solid marks on a 24 grid drawn in `currentColor`, and
  the chrome uses those. `Product.icon`, `Chamber.icon`, `Quest.icon` and the rest now name a
  mark rather than carrying a glyph — a test that greps for an emoji has to be updated with
  them. What emoji remain are ILLUSTRATION (the ant portraits), where a big coloured picture
  is the point.
- **Currency in words, not glyphs.** "60 🍄" became "60 mycelium". A reward line is read, not
  scanned, and the glyph was the only thing telling two currencies apart.

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

## 10a. The guided tour

`src/ui/tour.ts` is the first-run walkthrough, and it is one component doing both halves:
twelve steps across the meta screens — the currencies, the trophy road, the bar, each of the
four other deck screens in turn, then one step per setup choice — ending on the button that
starts a match, and thirteen more inside it, which walk the player through every action the
game has: select, move onto empty ground, attack, the long send, rally, the species ability,
cracking a hive guard, taking the queen, and ending the turn.

**The match tour is played on an ARRANGED board** (`src/engine/tutorial.ts`). A first match
played straight cannot teach the game: the Hive sleeps for ten turns, the enemy is a dozen
tiles away, and five tiles of three soldiers cannot crack anything, so the walkthrough could
only ever demonstrate "move onto empty ground". `arrangeTutorial` puts a spearhead beside the
Hive with soldiers enough to take a guard AND the queen behind her, a supply line holding it
to the colony, and an enemy outpost within reach — on whatever map the player picked, so it
never contradicts their choice. It changes no rules; it decides where things START, the way a
formation does. `src/engine/__tests__/tutorial.test.ts` plays the whole walkthrough on every
map and each ability shape, because a step asking for something the board cannot deliver
leaves the tutorial stuck with nothing but Skip.

- **The spearhead is the one stack that can crack the queen**, so every earlier step works
  around it: `moveSource`, `assaultSource` and `travelSource` all exclude it, and the rally
  step gathers ONTO it. An early step that spends it strands the last two.
- **A signal is delivered on a microtask, not inside the batch.** A step's `enter` picks a
  tile up for the player, and the step opens the moment the previous deed resolves — in the
  middle of the handler that resolved it. `onAbility` clears the selection after consuming
  its events, and a rally puts the mode back the same way, so a step opened inside the batch
  had the tile taken straight back out of its hand.

The app owns the `Tour` and hands the same instance to `MatchScreen`, so there is never a
second overlay and the meta walk runs straight into the match one.

- **The dark IS the gate.** Four panels cover the screen with a hole between them, so the
  only tap that can land is the one being taught — nothing else needs disabling, because a
  panel swallows the tap before it reaches what is underneath. A hole punched with a
  `box-shadow` or a `clip-path` looks identical and still eats the tap in the middle, which
  is the one thing it must not do.
- **Targets are looked up on every measure, never captured.** `show()` REBUILDS a screen on
  entry, so an element grabbed when the step list was written is a detached node by the time
  the step opens. The overlay re-measures on a 90 ms timer for the same reason: a step can
  be waiting for a screen that does not exist yet, the board resizes, and polling covers all
  of it without every screen having to know the tour exists.
- **A step can move the app.** `enter` fires as the step opens — that is how the tour walks
  the deck to the screen it is about to explain, without the deck knowing the tour exists.
- **A lit tab nobody can see teaches nothing.** The deck steps light the SCREEN, and the bar
  is `lift`ed — raised above the dark and made inert for that step — so the tab for the
  screen being explained can be seen lit under it. One hole, one raised element; a second
  hole would need a second set of panels.
- **A setup step lights the whole box, not the button.** Lighting only "Next →" asked the
  player to "pick the one you want" with the picker itself in the dark. They end on `signal`
  — the router says when the screen actually changed — so every control on the screen stays
  live under the tour without a tap on a card marching the step on.
- **"Look at this screen" is a step type of its own.** Four steps show a whole screen rather
  than point at a control, so the hole has to be big enough to READ — and a tap inside it
  would navigate out from under the tour. `block` puts a pane of clear glass over the hole:
  visible, inert.
- **A step ends the way it says it does.** `tap` (the player taps the lit thing), `next` (a
  button in the bubble) or `signal` — the app confirms the deed afterwards. The match's
  "move into that tile" step is a `signal`, so a tap the engine refused leaves the step
  standing rather than marching the tutorial on without the player.
- **A tap in the dark POINTS.** It used to do nothing at all, which is indistinguishable
  from a broken button — and that is exactly how it came back: "I hit Play and nothing
  happens". The ring and the bubble pulse instead, so a blocked tap reads as the tour
  holding the interface until it gets what it asked for.
- **A `tap` advances on the NEXT tick**, because the app's own handler is behind the tour's
  in the capture phase and may navigate. By then the tour may have moved on — the last meta
  step starts a match, and the match starts a tour of its own — so the timeout re-checks
  that the step it was fired for is still the one showing.
- **The tour pauses the match.** `startTour` stops the turn clock, `startTimer` refuses to
  run while a step is up, and a move made during the walk does NOT hand the turn over — the
  player taps End turn on the last step. Reading a step must never cost the turn.
- **It shows once, and "once" is VERSIONED.** `profile.tourSeen` holds the tour version the
  player has walked, and it is written when the last step finishes AND when Skip is pressed;
  every step carries Skip. Settings → Tutorial → Replay is the other way back.
  The old flag it replaced, `tutorialDone`, is deliberately not read: it recorded three
  coaching toasts that no longer exist, so honouring it hid the real walkthrough from every
  player who had ever started a match — which is how it was found, on the live build. A tour
  that changes materially gets `TOUR_VERSION` bumped and is shown once more.

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
  has no `mycel` field at all, and falling back to 0 once silently cancelled the starting
  grant. There is no grant any more — **a new colony starts on zero of everything**, and
  earns its first chamber from a match — so the rule is held by a test that compares
  `normalise({})` to `defaultProfile()` field by field rather than by the balance itself.
- Daily quests roll from the **day number**, not from stored randomness, so a reload mid-day
  returns the same three. Progress is written by the app shell from engine events it
  receives through `MatchScreen`'s `onEvents` — the engine knows nothing about quests, and
  opening the quest screen can never award anything by itself.
- `ProfileStore.modsFor(species)` is the only source of `PlayerMods`. It returns the player's
  chambers + that species' research, and **always hands the AI the neutral set** (§4.8).
  Pass the same mods object to the match's `ActionContext`, or research shows up in the
  income readout while doing nothing in a fight.
