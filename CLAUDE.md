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
src/ui/        Screens. `app.ts` is the shell and router ONLY: the setup flow is
               `setup.ts`, the result card is `result.ts`, the match is `match.ts`, and
               every meta screen is its own file. It was a 1,200-line file that did all
               four, which is the shape every one of these files is kept out of.
src/platform/  Storage, Capacitor, purchases.
```

**And the layering is ENFORCED, not remembered.** `eslint.config.js` carries a
`no-restricted-imports` rule per layer, so an import across a boundary fails `npm run lint`
— which CI runs before the tests. It also forbids `Math.random` inside `src/engine/`. Both
were held by review alone for months; a design rule nothing checks is a design rule that
erodes. `npm run check` is typecheck + lint + tests, and is what the deploy gates on.

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
   losses. It becomes a stable. **Anything that deals damage destroys one outright** — a vein
   holds no garrison, so a percentage of it is a percentage of nothing, and without a special
   case the hit falls straight through the thing most worth hitting. That is one function,
   `strike()` in `effects.ts`, and every damaging ability goes through it: venom, wildfire and
   the Army Ant's bite. Each of them had its own arithmetic somewhere else in the file once,
   which is exactly how veins ended up immune to two of the three.
   - **And damage does not ask whose tile it is.** A wild garrison and the NEUTRAL hive take
     it the same way a colony does. `strike` never stops at one either: a rounding rule that
     could not take the last soldier left wild guards and hive tiles sitting at 1 for ever.
     The one-soldier floor (§4.9) is about what you may SPEND, not about what can be killed.
   - Emptying the queen does not hand her over: the surge is a contest that has to be walked
     into (§4.7), so an ability may soften her and never claim her.

5. **Dangling veins prune, and so do stranded ones.** Two rules, because one was not
   enough. A vein needs ≥2 same-owner colony neighbours: when it loses an anchor the trail
   is destroyed back to the nearest captured tile, junctions surviving because they keep
   two or more. But that rule is LOCAL, and a closed ring satisfies it for ever — every
   vein in a loop has two vein neighbours. A barrage that severed the trail holding one
   left it standing permanently: ground that produced nothing, defended nothing, and had to
   be cleared a tile at a time. So a vein must also be able to REACH a captured tile of its
   own colony through same-owner tiles. A trail always can, because a trail ends at one; a
   floating loop never can. Only a stable or a nest counts as ground — start the walk from
   veins as well and a loop holds itself up again.

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

10. **An ability is a free extra action — except one that spends the turn.** Tunnelling lands
   five workers anywhere on the board, which IS the move: a digging colony that could plant a
   beachhead behind the line and then still play its turn got two actions where every other
   species gets one. `abilitySpendsTurn()` in the engine owns the rule so the screen and the
   AI cannot disagree about it — `aiTurn` used to cast and march in the same turn.

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

**The suite's ladder tripwire must not block the thread for a minute.** The search is
synchronous, so while a self-play game runs the test worker cannot answer the reporter —
and vitest's RPC gives up at sixty seconds, which failed a whole CI run with all 608 tests
passing. Two games at a sixteenth of the node budget is the same verdict as a sixth (hard
takes both games either way) in a third of the time, and the games hand the loop back
between them. Anything added here that runs a minute of straight computation has the same
trap.

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
- **The opening is a VIEW too.** A match begins high above the board: the clearing sits
  small in a frame of undergrowth, the floor grows up to the lens and locks, and only then
  do the two colonies grow out of their nests (`render/intro.ts`). Like the finale it is one
  transform around the frame — the board underneath is the one the engine built, and the
  layout is untouched, or a tap would land on the wrong cell.
  - **The frame has to be FULL, and it is ONE plate that fills it.** The scenery used to be
    baked to the edges of the canvas and no further, so the moment the camera pulled back
    there was a border of nothing around it — and the bushes that filled that border were a
    different background from the rocks and sticks underneath, which is exactly how it was
    reported: "different backgrounds, some rocks and sticks are moved". `terrainBleed`
    (terrain.ts) sizes the bake off the height the camera STARTS at, so the same ground
    covers the frame from the first frame of the descent to the last. Extended, never
    stretched: the overhang is more ground carrying more scenery at the same density, and
    the counts scale with the area for exactly that reason.
  - **The bushes are foliage to come down past, not the fill.** They are drawn INSIDE the
    camera so they belong to the ground, biased toward the rim and leaning over it.
  - **They get out of the way by MOVING, never by fading.** A bush that dissolves says the
    picture is changing; one that slides out of frame says the camera is coming down past
    it. Each is given its exit direction and the exact distance to clear the frame AT
    PLACEMENT, because the surround stops being drawn the instant the camera lands and
    anything still inside the picture then pops out of existence. The corners hold the
    frame longest by GEOMETRY — a diagonal is the longer way out — not by a timing of
    their own: a corner is off the playfield, and forest carrying on past it reads better
    than a curtain whipping away.
  - **One movement, ONE curve.** The ring opening and the floor growing are the same camera,
    so they start together, end together and are shaped the same (`descent`). They were not:
    the floor eased OUT while the ring eased IN, held back so it would keep the frame full
    late, and it read as two things happening at once rather than one lens coming down.
    Opening early would have cost the rim its cover, which is why the ground plate had to
    grow: it is what hides the rim now, at every height, so the ring is free to move with
    the camera. `intro.test.ts` holds the plate against what the lens can see at the top of
    the descent.
  - **The lock has to be STILL.** There was a hair of overshoot on the scale, meant to read
    as a camera locking on. It did the opposite: the bump returned to zero at the end but
    its SLOPE did not, so the last drawn frame was still moving and the next one, with the
    camera gone entirely, was not — a jolt on the one frame the whole descent is aiming at.
    The ease now arrives with zero speed.
  - **Not far out.** Past about a third the clearing stops being the subject and becomes a
    stamp in a screen of undergrowth, and the zoom stops reading as a camera coming down and
    starts reading as a picture being scaled.
  - **The colonies ARRIVE from somewhere.** Before either grows out of its nest, a vein
    runs in from off the frame and reaches it — the same bar a trail on the board is drawn
    as, in that colony's own colour, so the five tiles in the corner read as a detachment
    of something carrying on past the clearing rather than a colony that begins and ends
    there. It lands on the frame the camera does, which is the frame the colonies start
    growing on, so one thing hands over to the next. Two rules make it read:
    ORTHOGONAL, never diagonal — nothing in this game moves diagonally and no vein on the
    board is drawn that way, so an angled line from a corner would be the one mark on
    screen not obeying the grid. And its TAIL sits on the frame the camera opens on while
    its FRONT starts on the frame the camera lands on: measured from the outer frame at
    both ends, the front spends most of the descent outside the canvas and the line shows
    as two pixels of nub at the rim until the last moment. It fades over the last of the
    fill, because the board the engine built has no tile out there and a mark that
    outlives the opening is a lie about the position.
  - **The colonies are scheduled at the START and set off at the landing.** `RevealTracker.
    begin` takes a future `at` for exactly this: registering the tiles immediately is what
    makes them draw UNFILLED during the descent. Beginning the reveal on arrival instead
    left them sitting finished on the floor the whole way down and then blinking out.
  - **Nothing may RESIZE at the hand-over.** The ability button's label is one line in the
    markup and two once it names the ability and its cooldown, so filling it in at the first
    turn grew the footer five pixels, shrank the canvas, fired the ResizeObserver,
    re-measured the board and re-baked the scenery — a blink exactly as the opening handed
    over, with different ground on the other side of it. `start()` dresses the HUD BEFORE
    `playIntro()`. Anything else that writes into the chrome has the same trap.
  - **And the scenery must survive a resize anyway.** Every prop is placed from its OWN
    seeded generator, keyed on its index: with one shared sequence a prop rejected for
    landing on the board consumed a different number of draws than one that was kept, so a
    few pixels of relayout reshuffled every prop after the first difference. Counts are
    given per SCREENFUL and scaled by the plate's FREE ground, not its area — props never
    land on the playfield, which is a large hole in the canvas and barely a dent in the
    plate, so scaling by area emptied the ring around the tiles.
  - **Every control skips it**, canvas and footer alike. The footer is DOM and stays live
    under the animation — End turn during the descent handed the first turn over before the
    match had visibly started — and sitting through the same descent every match is the
    fastest way to make an animation hated.

- **The finale is a VIEW, not a set of moves.** When a match is decided the winner's colour
  sweeps out from their nest and consumes the whole board — enemy ground, veins, wild
  garrisons, the Hive and the rocks — before the result card comes up (`render/flood.ts`).
  It draws OVER the board and never touches it, which is the only way it can work: the card
  reports the armies and the ground as they actually stood when the queen fell, and that is
  what the player was playing for. Three things it cost to get right:
  - **Stopping at the rocks left four grey holes** in the finished board, which read as the
    colour failing to paint rather than as a colony overrunning the map. Everything goes.
  - **The slab needs its own under-band.** A colony's band hangs BELOW its cells, so without
    one the wash left a sliver of the loser's colour along the bottom edge of the board.
  - **"No numbers" means all of them.** Only the colonies' own counts were gated on
    `hideCounts`; a wild garrison's shield and the Hive's guard sat there through the whole
    finale. The colonies' dashed outlines dissolve over the first third of the wash rather
    than popping out on the winning frame.
  - **It starts from the winner's OWN base, and the renderer has to say where that is.**
    A match is usually won by TAKING the loser's nest, and at that moment the winner owns
    two — so searching the board for "their nest" returns whichever comes first in grid
    order, and the colour washed out from the ground that had just fallen. `BoardRenderer`
    snapshots both nests while the board is still untouched (`rememberHomes`) and passes
    the winner's to `planFlood`; the search is only a fallback for a board with no history.
  `MatchScreen.finish()` holds the card back for the wash and latches, because it is
  reachable from a queen falling, a surrender and a challenge objective — and `destroy()`
  cancels the pending card, so a screen torn down mid-wash never hands one out.

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
- **A rule hung on the wrong class does nothing where it was meant to and something
  where it was not.** The home artwork's vignette was written as `.hillwrap::after` — and
  `.hillwrap` is the ANTHILL's scroller. So it darkened the top and bottom of the chamber
  list for months and never touched the screen it was for, which had its own `#home::after`
  added later. Both screens looked "slightly off" and neither looked broken.

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

**The Profile is the career, and the room for a collection** (`src/ui/profile.ts`). The
avatar used to open the Colony screen — a level badge and today's three quests — so the one
place a player goes to look at THEMSELVES showed a to-do list, while every number the game
kept about their career sat in the save and on no screen at all. Who, then what has
happened, then what has been collected; the last is a list of doors (colonies, chambers,
research, each a count with a bar and a way in), so another thing to collect is another row.
- **Every class on it is prefixed `pf-`, and that is not tidiness.** The legacy stylesheet
  already owns `.pname` — the name INPUT, a bordered text field — so borrowing it drew a box
  round the player's name; and `.qbar` carries a height only inside `.qhero`, so the XP bar
  came out as a track with none. Both were silent (§10: those strings are styling).
- **The career is counted from what a match DID.** `recordResult` takes the turns, the
  clock, the queens and whether the win was a nest capture; `scoreQuestEvents` credits the
  quest AND the career total off one count, in one tested function, because a quest that
  credits a capture the profile does not is two numbers disagreeing on screen. The fastest
  win ignores a loss and an untimed match — a zero would win every comparison for ever.

**THE PICKERS SHOW THE GAME, NOT A DIAGRAM OF IT** (`ui/setup.ts`). The map picker was
three cards with a thumbnail of coloured squares and the formation picker was five rounded
squares on a 72px canvas. Both are `render/snapshot.ts` over a REAL `GameState` now — the
same drawing code the board uses — so the gems, rocks, water, the Hive and both colonies
are where they will actually be, and a change to how a nest is drawn reaches the pickers on
the same commit.
- **The map picker IS the map.** Full screen, everything floating on it, and choosing is
  dragging from one to the next — the same `Deck` the home screens ride, because the
  gesture handling there is the expensive part (§9a) and this is the same object. It takes
  a class and id so it can be styled apart from the home strip.
- **FIT, not cover.** Sizing the tile off the longer side filled the screen with the middle
  of a 13×13 board, which is a texture rather than a map. Fitted to the narrow side, all of
  it is there — and a bigger map honestly draws smaller tiles.
- **A preview needs soil around it** (`padTiles`). The clearing is a feathered radial, and
  a canvas cropped to the board cuts that gradient off mid-fade — a visible line straight
  across the picture.
- **A formation preview is the formation ONLY.** A real map puts the Hive in the middle and
  wild garrisons about; twelve two-inch cards with all of that behind them are twelve
  pictures of the map. Everything that is not the player's own colony is razed first.
- **A card in a grid sizes its own canvas** (`fluid`). `drawSnapshot` writes the exact
  pixel size inline, which is right for a figure and wrong in a grid: `max-width: 100%`
  squeezed the width while the inline height stood, and a square picture came out tall.

**HOW TO PLAY IS A MANUAL** (`src/ui/rules.ts`). It was seven lines of prose, which cannot
carry a game with deterministic combat a player is meant to count out, supply lines that
freeze a colony that ignores them, veins with rules of their own and a Hive on a clock.
Ten numbered sections now, with a picture beside the rules that need one.
- **It does NOT explain the abilities.** Each colony's ability is written on its own page
  in the Antarium, where the player is choosing one — writing it twice is two places to
  keep in step, and the manual is about the rules everyone plays by.
- **The pictures are NOT screenshots.** Each is a real `GameState` drawn by the board's own
  code (`render/snapshot.ts`), so a change to how a vein or a wild garrison is drawn reaches
  the manual on the same commit, and no figure can illustrate a rule the engine no longer
  has. There is no image file to keep in step.
- **The numbers are read from `engine/config.ts`**, never typed out — production, flat
  defence, the one-soldier floor, travel range, when the Hive wakes. A balance change cannot
  leave the manual quietly lying about the game, and a test holds the phrasing against the
  constants.
- **The Hive figure is TICKED, not drawn.** `hiveTick` sets her garrison, so the picture
  shows the numbers the engine would actually put there.
- **A figure's window is an ORIGIN, not a crop of the drawing.** Every tile is still drawn
  and the ones outside land off the canvas, which is what keeps a colony's fillets and
  trails correct at the edge of the picture.
- **The hive terrain is cleared from every figure that is not about it.** It sits in the
  middle of every map, which is inside most of these windows.

**CHALLENGES ARE A LADDER, AND BEATING ONE IS REMEMBERED** (`src/ui/challenges.ts`). Five
identical cards — a title, a run-on grey sentence, a green Play button — and nothing
recorded a win, so the forty-mycelium reward paid again on EVERY replay of the easiest
position in the game, and the screen had no reason to be opened twice.
- **A challenge is beaten once.** `profile.challenges` holds the ids and
  `ProfileStore.beatChallenge` returns false when it was already there; the reward hangs
  off that return, which is the only thing making it pay once. Keyed by ID, never by index
  — reordering the table would otherwise re-award or re-lock every one of them (§8a's rung
  lesson).
- **The daily is the repeatable half**, stamped by DAY rather than listed, because it is
  meant to come back. Beating it also beats the position it drew, so the ladder moves.
- **Each rung opens when the one before it falls, and the lock is NAMED.** "Beat Hold the
  Line first" says what to do; a padlock says only that you cannot. A win out of order (a
  daily can draw any of them) counts as beaten without opening the ones below it.
- **The cards carried a drawn preview and it was REMOVED.** At the size a list row allows,
  a corner of the board says only "this is the game", which every other card says too. The
  map, the colony and the difficulty are what tell one challenge from another, so those are
  what a card carries. (`drawSnapshot`'s `hideCounts` was added for those previews and is
  kept — a thumbnail anywhere else wants it.)
- **Where, who and what-to-do are three different KINDS of fact.** They were one grey
  sentence, which is most of why every card looked the same: the map and the colony are
  chips now and the objective is the line that gets read.
- **The daily screen has a second half.** It was one card floating in an empty page; it
  carries the ladder's progress and the way into it, because the daily draws its position
  from there.

**A COLONY'S PAGE IS ABOUT RESEARCH** (`src/ui/species.ts`, split out of `antarium.ts`).
It was four grey cards of the same shape — a hero box, a "combat profile", the research
list, then the trait, the field notes and the ability in three more boxes — and it was the
last screen in the app still wearing the legacy skeleton. A deliberate deviation now (§10).
- **Research leads, and states NOW against NEXT.** It is what the screen is for, and a
  price beside "+5% attack per level" never says which level you are on or what the next
  one buys. It reuses the Anthill's comparison rows, so the two screens read as one app.
- **`ResearchDef.at(level, species)` spells out what a level actually gives.** The
  reservoir does FOUR things — potency, +1 turn or tile at level 3, −1 turn of cooldown at
  max, and Leafcutter's permanent leaves — and the old one-line summary named one of them
  while printing the leaf clause on every colony's page. The species argument is what keeps
  a sentence about leaf walls off the Fire Ant.
- **The stat bars are measured against the OTHER COLONIES**, read off `SPECIES` so a
  balance change moves the track on the same commit. They were drawn against a made-up
  ceiling of 1.7, so 0.90 filled half a bar and said nothing. The researched length is
  drawn FIRST with the colony's own strength on top of it, so what shows past the end of
  the base is exactly what the player added.
- **The cooldown is stated once.** It was in the stat block, in a note beneath it and in
  the ability card's header — and in one of those it read "7t → 7t", which is what an
  unchanged number looks like printed with an arrow: only a maxed reservoir shortens one.
- **The "Customize" tab is gone.** It sold skins from the lucky hatch, which is not built,
  so it was a tab that could only ever raise a toast — the same thing Settings' Sound
  switch was.

**THE THREE DRAWER SCREENS ARE BUILT** — News, Friends and Support were "Coming soon"
panels, which is what the legacy build ships. Each is an offline implementation behind an
interface, the same seam `Matchmaker` and `PurchaseGateway` use, so a server is a new class
and one line in `App`.
- **News** (`platform/news.ts`, `ui/news.ts`) is a table in the app rather than something
  fetched, which is honest rather than a placeholder: a build ships with the notes for what
  is in it. **Every post's picture is DRAWN** — a real `GameState` through
  `render/snapshot.ts`, or the mark of the screen the post is about on a plate of that
  screen's colour. There is no image file to keep in step and no screenshot that can go
  stale, the same rule the manual and the pickers follow. Posts open where they sit; the
  newest stands open, because a feed that opens collapsed has said nothing. Opening the
  screen marks it read — the badge is about posts not SEEN — and the count rides the
  drawer's News entry, which is the only route to it.
- **Friends** (`platform/friends.ts`, `ui/friends.ts`) is three tabs, because stacking them
  buries the requests — the one part waiting on the player — under a list that only grows.
  The directory is generated from `RIVAL_NAMES` and seeded per entry, so a colony's size
  does not move between searches. **A new colony arrives to two requests**: nothing can ever
  arrive on its own without a server, and accept/decline nobody can reach is a screen nobody
  can tell is finished. Adding somebody who has already asked YOU accepts instead of sending
  one back — two people tapping Add should end up friends, not with a request each. Removing
  asks twice on the same button, as Settings' reset does.
- **Support** (`platform/support.ts`, `ui/support.ts`) leads with the FAQ, because the
  question a player has is usually one somebody has asked; then the composer; then the build
  and the player's code, which whoever reads a message needs and should never have to ask
  for. **Nothing is posted anywhere.** A Send button that throws the text away is worse than
  none, so the message is KEPT on the device and a mail link carrying it, the build and the
  code is opened — via a clicked `<a>`, never `location`, or a browser with no mail handler
  lands on a blank page with the game gone. `SUPPORT_EMAIL` is a constant in one place and
  is the one thing here that must change before release.
- **The player code is minted in the store's constructor**, not in `defaultProfile` (a
  constant) and not in `normalise` (which has to stay a pure function of its input — a test
  compares the two field by field). Ambiguous characters are left out of it, because the
  whole point of the string is that somebody reads it off a screen and types it.
- **Lucky hatch is the one entry still unbuilt**, and it now says so. It fell through the
  router to the Antarium, so tapping it silently opened a different screen.

**THE LADDER'S HEAD DOES NOT SCROLL** (`src/ui/leaderboard.ts`). The body was one
scroller and the screen opened by scrolling the player's own row into the middle of it,
which took the division chips and the banner off the top with it — so a player arrived at a
column of strangers' names with nothing on screen saying what they were a ranking OF. Two
boxes now: a fixed head, and a table that scrolls under it.
- **A ladder exists to say WHERE YOU STAND**, and a highlighted row never said what place
  that was. The banner carries the rank in words, a bar through the division on a LOG scale
  (the bands are orders of magnitude wide — linearly the bar sits near empty for most of
  one), and the distance to the next band. The top band promises nothing beyond it, because
  the colony number has no ceiling either (§8a).
- **Every other chip says whether that division is ahead of the player or behind.** Without
  it there is no reason to tap through six divisions the player is not in.
- **A rival is a colony, not a string.** The search, the nameplate and the result card all
  give an opponent a head; this was the one screen that did not. Rivals draw a non-premium
  species seeded off their place in the table — a premium colony on the ladder is a shop
  window, not a player.
- **`antPortrait` in `chrome.ts` owns the picture.** It was written out four times, which
  is four places to fix when the drawing changes (§7). A face drawn at twice the size it is
  shown at and scaled by the stylesheet is what keeps it sharp on a phone.

**FINDING AN OPPONENT is a screen, and the seam is real** (`platform/matchmaking.ts`,
`ui/matchmaking.ts`). It sits between the formation pick and the board: a vertical split,
you on the left, the seat across the board on the right, and the right half REELS —
profiles scrolling past under motion blur — until somebody is seated, then stops DEAD on
them and the halves part onto the board.
- **Nobody is ever found, and that is an implementation detail.** `Matchmaker` is an
  interface with one method and `LocalMatchmaker` is the offline one; a server-backed
  finder is a new class and one line in `App`, the same seam `PurchaseGateway` uses. The
  search really waits `SEARCH_MS` (5s) — five seconds of decoration would have to be
  rewritten the day it is real.
- **When nobody answers it seats a BOT, and the bot plays `hard`.** A bot stands in for a
  person, and a person who folds is worse than no opponent: the player would see it was
  not real. Settings' difficulty still drives a challenge, which is a scenario rather than
  an opponent.
- **The rosters are generated, not typed.** Twenty per chapter across fifty chapters is a
  thousand names, and a table that long is a thousand chances to leave one stale when the
  road is retuned. Seeded on the CHAPTER, so a chapter always fields the same twenty (a
  familiar ladder, not noise) and climbing meets new names rather than the same ones
  resized.
- **The one it stops on is the one that turns up.** The board is dressed in that
  opponent's species and their name goes on the nameplate — the head the reel stopped on
  has to be the colony across the board, or the search was showing something it did not
  mean.
- **The match starts UNDER the parting halves**, not after them, so the camera's descent
  plays through the widening gap and the reveal is one movement.
- **The search begins on `start()`, never in the constructor.** The caller's search closure
  wants the screen (it hands over the abort signal), so a constructor that searched at once
  ran that closure while the caller's binding was still in its temporal dead zone: the
  throw was swallowed and the reel turned for ever with nobody seated.

**WHO IS PLAYING is ON THE GROUND** (`render/plates.ts`). The header counted two armies
and called them "You" and "Enemy" — a scoreboard, not an opponent — and the colony, the
number the whole game is played for (§8a), was never once in front of the player while they
were playing for it. A mark and two words on the forest floor: the colony's own head, the
name, and its size.
- **It is drawn, not laid out.** Two DOM strips above and below the board was two more
  pieces of chrome stacked on a screen that already has a header, a turn bar and an action
  row — and the canvas had to be given its own box, because `BoardRenderer` measures the
  canvas's PARENT and would otherwise lay the board straight over them. On the soil there
  is nothing to measure, nothing to swallow a tap, and no band eating the playfield.
- **Each row is aligned to its OWN base**, not to the screen: the player's nest is in the
  bottom-left corner so their name sits under the board's LEFT edge, and the enemy's is
  top-right so theirs sits over the RIGHT edge. Centred, both would point at the middle of
  the board rather than at the corner they are about.
- **It goes under the finale.** Drawn before `drawFlood`, and faded with the outlines, or a
  name left standing would be the one thing the winner's colour did not reach.
- **The scenery is baked around the names too.** A fern or a fallen log grown where a name
  is written reads as clutter over the text, so `rowsOf` measures the rows and `terrain.ts`
  keeps exactly those boxes clear — and only those, or one name would thin the whole ring.
  A dropped prop is DROPPED, never moved: each is placed from its own seeded generator
  (§5), so removing one cannot shift the next.
- **The renderer is handed the figure's formatter, never the progression layer.** `plates`
  and `colonySize` are options; `render/` still imports nothing from `platform/`.
- **The opponent is generated** (`platform/rival.ts`), because there is no server yet — a
  name from the same pool the Leaderboard draws its rivals from, and a colony near the
  player's own, which is what a ranked ladder would serve them. Keyed by the match seed, so
  it does not change under the player mid-match.

**The match clock is the SCREEN's, never the engine's.** Wall time from the moment the
opening hands over to the moment the match is decided, latched there so a result card
sitting on screen does not keep counting, and reported to the app through `onExit`. It
cannot live in the engine: the engine is pure and seeded so the same moves replay
identically (§4.1), and a real clock is the one input that never does. Nothing about the
game reads it — it is a fact ABOUT the match. The descent is not counted; it plays the same
length every time and nothing can be done during it, so charging for it would put the same
seconds on every card. It stands where the ENEMY'S ARMY used to: by the time the card is up
their colony has been overrun by the finale, so a number for what they had is a number for
something that is not there.

**Settings shows the build it is running** (`src/platform/build.ts`, stamped by
`vite.config.ts` from the commit). Milan tests the deployed build on a phone, where a stale
cached page and a real bug look identical from the outside; reading the commit off the
screen settles which one it is in one line.

**And the app takes a newer build by itself.** Pages serves the HTML with its own cache
lifetime, so a device can sit on the previous bundle for minutes after a deploy — which
reads as a fix that did not work. The build writes `version.json` beside the bundle;
`platform/freshness.ts` reads it on boot with the cache bypassed and, if it names another
build, reloads onto `?v=<commit>` — the query is what makes the browser fetch the HTML
again instead of handing back the copy it has. It reloads at most ONCE per version
(remembered in `sessionStorage`): a cache that ignores the query too would otherwise spin
for ever, which is far worse than being one version behind.

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
- **One function owns a rule.** `strike()` is the model (§4.4); `razeTile()` is the same
  idea for what a destroyed tile keeps — it was written out by hand at the three places
  that raze one, which is three chances to leave a stale gallery flag behind. If two places
  spell out the same rule, that is the bug, not the duplication.
- Keep commits small and focused; the ability to roll back one change matters here.

## 8. Balance snapshot

Tuned by AI-vs-AI play; **not yet validated by human playtesting** — treat numbers as
provisional and say so if asked.

- Production/turn: nest 2, stable 1, resource stable 3 (up to 6 with Fungal Cultivation)
- Flat defence: nest +6, stable +1, resource stable +2, wild guard +1, vein 0, hive 0
- Species multipliers span 0.70–1.25 — deliberately narrow. Species change *how* you win.
- Ability cooldowns are 5–7 turns. Wildfire is the one on 7: it is the only ability that
  keeps working after the turn it is cast on, so its cost is the wait rather than the cast.
  Per-turn damage: fire takes a fifth of a garrison (`FIRE_BITE`), venom seven soldiers flat
  (`VENOM_BITE`). The Army Ant's bite is a quarter of each bordering garrison (`SWARM_BITE`).
  A garrison of five or fewer is wiped by fire outright — that is a separate rule from the
  percentage, and not a rounding of it.
- **Moving first is worth roughly two to one.** Same difficulty, same species, both sides:
  the bottom-left corner (the player's) wins about 8 of 12 on the small board. The maps
  are 180°-symmetric and tested to be — so this is the move order, not the ground. Whether
  to compensate the second player is an open design question; note that the AI always plays
  second, so every match a player sees is one the AI starts behind in.
- The colony: a win pays **a share of itself that tapers as it grows** — 20% of a young
  colony, 7% of a thousand, about 1% of five million (at least +8) — and a loss costs
  **36% of what a win there pays**, so an even record still gains about a third of a win
  every match. Never below its starting 40 (§8a). Not comparable to the flat +30/−15
  trophy count it replaced.

**8c. THE ECONOMY IS MODELLED AGAINST A REAL PLAYER** (`platform/__tests__/economy.test.ts`).
Every number below was checked in isolation and none of them had been checked TOGETHER, and
that is where all of it was wrong. The player it is tuned for: **two to three matches a day,
winning about half.**
- **What the model found.** The road was over in under three months. The whole research
  economy — every track on all nine colonies — was covered three times over inside three
  weeks. The daily sweep bonus alone paid more mycelium in a year than the game has to
  spend it on. And the granary out-earned playing, so the fastest way up was to stop.
- **The larva conversion was the single worst number.** Legacy pays some quests and road
  stops in larva, which is not ported, so they pay pheromone instead — at **50 each**,
  chosen to make the figures look like the legacy ones and never checked against what
  pheromone BUYS. A research level costs 40 to 180, so one ten-larva stop paid for five of
  them. It is **4** now: a larva is about a tenth of a research level.
- **Currency has to TRAIL desire.** A player should finish the road at about the point they
  have bought everything, with enough slack never to be stuck and never so much that the
  currency stops meaning anything. Held at 0.9–1.8× for mycelium and 0.7–1.3× for
  pheromone — tighter, because pheromone buys ONE thing and a surplus has nowhere to go.
- **No single faucet may carry the economy.** The level track and the sweep bonus are both
  held under what the quests themselves pay, because those two arrive without being played
  for and are exactly the kind of stream that quietly becomes the biggest one.
- **The granary is measured at its MAXIMUM, against an EVEN record.** The store holds
  twelve hours, so a diligent player banks two full stores a day — and what that has to
  stay under is what playing yields for somebody winning half, not two in three. Both
  roundings were wrong once: measuring one collection let a granary twice as fast as it
  should be through, and rounding 2.5 matches into two wins and a loss is a 67% player
  wearing a 50% label, which made the road look a third shorter than it is.
- **The shop is priced against free income, and the SKU names the grant.** Around seventy
  mycelium and fifty pheromone a day free, so a euro buys a few days, the largest bundle
  buys a couple of months, and nothing is more than a fifth of the game. The ids are the
  Play Console SKUs, so `mycel.150` granting 220 is a trap for whoever wires up the real
  store — they were renamed with the amounts.
- Measured pacing, whole road: 2 games/day at an even record **521 days**, 2.5 **431**,
  3 **368**; at 60% it is 385/316/268. That is the spread to check against after any
  balance change.
- Maps: Skirmish 7×7 (wake 10, expected 32), Corridor 9×9 (14/45), Gauntlet 13×13 (18/80).
  The turn figure is an expectation, not a limit — nothing happens when it passes (§4.8).

## 8a. The colony — the number the game is played for

The ladder was a trophy count: +30 a win, −15 a loss, a fifty-chapter road ending at
twenty-five thousand. That is a RATING, and a rating is a number about the player. This
game is about a colony, and a colony GROWS — so the ladder counts troops, a win pays a
share of what you already hold (`platform/colony.ts`), and the figure runs off the end of
what a person reads comfortably: hundreds, then thousands, then millions. The eventual
point is a world ranking of the biggest colony there is, which is why the number has no
ceiling — only a curve that flattens.

- **A win pays a SHARE of what you already have**, which is what makes the hundredth win
  worth more than the first — a flat +30 does not. But the share SHRINKS as the colony
  grows, and that taper is the whole of the tuning. A flat fourteen percent compounds, and
  compounding ran away from a road with a hundred rungs on it: the last chapter paid a
  hundred and thirty-six BILLION troops for one victory, which is not a reward, it is a
  number that has stopped meaning anything. Raising the colony to a power below one
  (`COLONY_TAPER`, 0.87) makes the growth polynomial instead: a win pays 13% of a young
  colony, 9% of a thousand, 5% of a hundred thousand and 3% of five million. That is the
  one number to turn if the late road feels wrong, and it moves the whole curve rather
  than one end of it.
- **A loss costs a share of the WIN, not of the colony** (`COLONY_LOSS_SHARE`). With a
  flat percentage off for a defeat, a colony big enough for the win share to have tapered
  below it would shrink on an even record. Tying the two together keeps the break-even
  win rate identical at forty troops and at five million.
- **A win floor carries the opening matches.** Fourteen percent of forty is five and a
  half, and a first win that moves the number by five reads as nothing happening.
- **A career is two hundred-odd wins long.** From forty: a thousand troops in about thirty
  wins, ten thousand in sixty, a hundred thousand in a hundred, and the road's last rung —
  five million — in a little over two hundred. There is still no ceiling; past the road the
  colony walks rather than sprints, which is why `compact()` keeps its B and T.
- **`compact()` is the only way a figure this big is readable**: 940, 23K, 1.2M, 4.8B, 6T.
  One decimal only under ten of a unit — 457.3K is three characters of noise — and the
  shown digit is TRUNCATED, so 999,900 reads as 999K and never as the 1000K that would
  follow 999K on the screen above it. `exact()` writes it out where there is room.
- **The road grows with it.** Every rung is a fixed multiple of the last, and a hundred of
  them run from a hundred troops to five million — the top came down from two trillion
  with the taper, because a road is only worth having where a career actually goes. A rung
  is named by its INDEX, not its size: "is this a multiple of five hundred?" only answers on an even
  ladder, and a claim key has to outlive a retune of the table.
- **A save from the trophy build converts, and its road claims convert with it.** The
  trophy count becomes troops — the player earned it — and claims keyed by trophy amount
  ("f500") would otherwise read as rung five hundred, which is past the end of the road.
  `roadClaims` recognises a legacy save by exactly that and re-marks everything at or
  below the converted colony as already paid, or a returning player collects the whole
  lower road a second time.
- **It is the biggest thing under the top bar, not a coin in the row.** It was one of three
  coins the same size as the mycelium a player spends on a chamber, which said it was worth
  about as much. It leads the profile's record and leads the result card too — and a defeat
  is printed in the losing colour, because it costs troops.

## 8b. The granary — the colony grows while nobody is playing

The colony is the number the game is played for and the number it will one day be ranked
on (§8a), and until now the only thing that moved it was finishing a match. A colony that
stops the moment the phone goes down is not a colony. `platform/granary.ts` is the passive
half: harvester ants store seed underground, the brood eats whether or not the colony is at
war, and the store is emptied into the colony from the home screen.

- **The rate is TUNED in wins and SHOWN in troops.** A level says how many hours of
  foraging add up to one victory at the same colony size — level 1 a day, level 7 twelve
  hours — and the figure is `winnings(colony) / hours`. A flat "+40 an hour" is generous at
  forty troops and invisible at five million, and would have to be retuned every time the
  win curve moved; this way the taper in §8a is inherited for free. A test holds it at five
  sizes across all seven levels.
  **But that is OUR reference, and it never reaches the screen.** The player is told troops
  per hour and what that adds up to in a day. Pricing one thing the game gives them in
  another is not an explanation, and a test greps the whole room for the word.
- **The store has a lid** (`GRANARY_CAP_HOURS`, 12). Without one a fortnight away pays
  fourteen wins, which makes not playing the fastest way up the ladder.
- **Levels are unlocked by CHAPTER as well as bought.** Mycelium alone can be saved up on
  day one; the chapter gate is what stops the passive rate running ahead of the colony that
  is meant to be earning it. The seven chapters are spread across the whole road (1, 6, 12,
  20, 30, 40, 50) so the last level is still something to reach for at the end of it. A
  gated level shows the CHAPTER, never a price — offering a number the screen would then
  refuse is a lie about what is in the way.
- **Digging empties the store first, at the OLD rate.** Hours already foraged belong to the
  speed that was running when they were foraged.
- **A store holding less than one whole troop is not stamped.** Rounding down to zero and
  restarting the clock anyway would throw away every partial hour, so a young colony
  foraging a third of a troop an hour would never bank anything at all.
- **Two clock readings have to be handled or the number on screen is nonsense.** A stamp of
  ZERO is a save that has never emptied it — a new profile, or one from a build with no
  granary — and reads as FULL: that costs one payout, once, and is right for ever after. A
  stamp in the FUTURE is a device clock that moved backwards, and reads as empty rather
  than as a negative store.
- **It is dug in the Anthill and collected on HOME.** The room belongs in the nest — it is
  the first level down, and it is *not* a chamber, because a chamber changes a match and
  this changes the colony between them. But a payout waiting behind two taps is a payout
  nobody takes, so the pill sits directly under the figure it pays into. Collecting rebuilds
  the top bar in place; rebuilding the screen would re-run the artwork and throw away the
  deck's slide for one number.
- **The pill always says something.** Full, it offers the store; filling, it states the
  rate. A control that reads as blank when there is nothing to take looks broken rather
  than patient — and a rate below one troop an hour is written as a fraction, or the first
  level reads "+0/h".
- **`chapterOf` lives in `road.ts`**, not beside the opponent search that first needed it.
  It is a fact about the road, and the granary asks the same question; two copies of that
  arithmetic would be two answers on one screen.

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
   It deliberately sells only what the game can spend (mycelium, pheromone, the Colony Pass,
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
- `platform/colony.ts` — how the colony grows, and how a figure that big is written.
- `platform/road.ts` — Colony Road reward table, pure functions of a colony size.
- `platform/quests.ts` — the daily pool and a day-seeded roll.

A new player starts with nothing — no mycelium, no pheromone, a colony of forty. The legacy
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
- **THE ARBITRATION IS AN ANGLE, DECIDED EARLY — and a distance threshold does not work.**
  The deck used to wait for 24px of sideways travel before claiming a swipe, and on every
  screen with a scrolling list the BROWSER had already taken the touch by then. Measured in
  Chromium: one `pointermove`, then `pointercancel`, and the deck never heard another
  thing. So swiping worked on Home, which has nothing to scroll, and on none of the other
  four — which from the outside is "it will not swipe if my finger is on anything". The
  browser decides within a move or two, so the deck has to decide first: `AXIS_LOCK` is
  **7px** in either direction, and what decides it is the RATIO.
- **The bias toward vertical only applies where there is somewhere to scroll TO.** A thumb
  pivots as it flicks, putting twelve or fourteen pixels across the screen for every eight
  down it, and `SWIPE_BIAS` (2) is what keeps that gesture with the list — a pivot reaches
  about 1.75 and a real swipe is five to one or more, so the line sits in a wide gap. But
  the bias protects nothing on a screen that does not scroll, or at the top or bottom of one
  that does, and there the tie goes to the DECK. `scrollableUnder` asks about the direction
  of travel for exactly that reason: a list already at its end cannot take another flick, so
  that flick is not a scroll.
  `TAP_SLOP` must stay ABOVE `AXIS_LOCK` or nothing the deck claims is ever inside it and
  the give-back never runs; the flick guard is measured against it for the same reason. It
  is **34px**, because a press that rolls twenty pixels is still a tap and was landing on
  nothing at all — measured, not guessed.
- **The gestures are measured in a real browser, with real touch events.** `Input.
  dispatchTouchEvent` over CDP, on every deck screen: a swipe must turn the page from
  anywhere including on top of a button, a vertical flick must scroll and not turn the
  page, and a tap with up to 24px of roll must reach the control under it. That is 45
  checks, and it is the only way this was ever going to be found — every unit test in
  `deck.test.ts` passed against the broken build, because jsdom has no browser to lose the
  race to. The jsdom tests now state the scroller's `scrollHeight`/`clientHeight` outright,
  so they can at least express the rule.
- **`preventDefault` on a non-passive `touchmove` is what stops the browser stealing it.**
  With only `touch-action: pan-y` on the rail, Chromium still took a swipe that began near
  the left edge, cancelled the pointer stream mid-drag, and navigated the app away to a
  blank page. `overscroll-behavior-x: none` on the root is needed too, and neither alone
  was enough.
- **A press that goes down on one element and up on another does not click either.** The
  browser fires `click` on their nearest common ANCESTOR, and a finger wobbles: ten pixels
  of drift is all it takes. That one rule was two dead-button bugs at once, and both looked
  identical from the outside — "I hit Play and nothing happens".
  - The DECK claims a gesture at ten pixels of horizontal drift, and claiming it kills the
    tap twice over: `preventDefault` on the touchmove stops the browser synthesising a click
    at all, and the pointer capture retargets the rest of the sequence. The rail nudges,
    snaps back, and the button never hears about it — on every one of the five screens. A
    claimed gesture that ends without turning the page and went nowhere is handed back to
    what it came down on (`giveBackTheTap`). DISTANCE decides that, never speed: a confident
    press is a FAST one and wobbles just as far, so a speed guard ate exactly the decisive
    taps.
  - The TOUR's shade panels are hit targets, so the same wobble takes the pointer UP on a
    panel. The tour's own handler still saw the press and marched to the next step, leaving
    the app where it was — a tour asking for a screen that never opened, with nothing but
    Skip. A press that passed the gate on the way DOWN now makes the panels inert for the
    rest of that press (`.tourpass`), so it can finish on what it started on.

- **One WHOLE-pixel step sizes a slide and moves the rail.** Slides were 20% of a 500%
  rail while the rail travelled by `clientWidth`, a whole number — so on a viewport that is
  not a whole number of pixels the two disagreed by a fraction and the screen next door
  showed as a sliver down the edge. Sizing the slides in that same fraction moved the
  sliver to the OTHER side rather than removing it: a flex item is LAID OUT at a rounded
  position, so the slides drift left of an exact fractional multiple while a transform does
  not. Neither may carry a fraction, and the step rounds UP so the slide on show is never
  half a pixel short of the viewport; the overhang falls outside the deck, which clips.
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

- **One content column, and the currency chip is a mark and a figure.** Four different
  insets were in play at once: the screen carries a 16px gutter, and then the Anthill's and
  the Challenges' cards carried another 16 of their own — so those boxes ran 326px wide
  inside a body that was 358, while the Antarium's ran 358 and the Shop's ran 356 starting a
  pixel further in. The result card had the rule that was wanted, so it is now the page's:
  `.screentop, .screenbody, .overModalWrap { width: min(100%, var(--page)); margin-inline:
  auto }` with `--page: 360px`. A phone gets edge-to-edge, a wide screen gets a readable
  measure instead of a stretched one, and nothing inside the column insets itself again —
  the header's own side padding goes too, or the back button and the currency chip sit
  sixteen pixels inside the cards below them.
  The chip is the mark and the number. "MYCEL" after the figure named the currency its own
  icon already names, and it was the widest thing in the header.

- **No gradients, and corners a step tighter.** Every surface was a vertical gradient —
  lighter along its top edge, darker along the bottom. On one card that reads as a lit face;
  stacked down a screen it reads as a shadow falling out from under everything, which is
  how it was reported. One rule does the removing (`*:not(#home), *::before, *::after
  { background-image: none !important }`), because a gradient cannot be selected for and
  there is no way to flatten everything element by element without missing some; `#home` is
  exempt because the artwork is a background image. Every radius came down one step with it
  (`--r-lg` 20→14, `--r-md` 14→10, and the literals with them); pills stay pills.
  - **The restores sit near the TOP of `skin.css`, not the end.** Each legacy rule whose
    gradient the blanket nulls needs its colour back, but at the end of the file that block
    outranks every considered decision made in between: the first version put the gold
    square back under the active tab and turned the Antarium's quiet "Upgrade & Customize"
    bar solid gold with green text on it. Early, it is a floor; anything later still wins.
  - Our OWN gradient rules were flattened in place rather than overridden, so their
    ordering against later rules is unchanged.

- **No drop shadows, and one 3D object.** Every panel, button and chip in the legacy build
  sits on a hard ledge (`0 4px 0`) and presses by dropping onto it. Stacked down a screen
  they read as a pile of objects rather than one surface, so `src/ui/skin.css` ends with a
  rule that clears every `box-shadow` and `text-shadow` in the app. The PLAY button keeps
  its solid ledge — it is the one control the home screen exists to offer. Two things had
  to be redrawn because they were built OUT of shadows rather than merely wearing one: the
  tour's spotlight ring (a border now) and the selected-colony marks (outlines).

- **The Anthill is a PICTURE OF THE NEST, not a list.** The legacy screen listed all five
  chambers in a summary table and then again as five cards — every name and every effect
  twice — and the reason to spend was one line that printed the same sentence twice ("Now:
  +2 soldiers in your base at match start → +3 soldiers in your base at match start"), so
  the only thing that changed was the hardest thing to find. The rebuild that followed
  fixed the words and was still a list of five cards: an honest table of upgrades with
  nothing whatever to do with an ant colony.
  It is a cross-section now (`src/ui/anthill.ts`): a mound and an entrance at the top, a
  shaft going down, and a chamber hollowed out at each level, alternating sides the way a
  real nest branches. Tapping one opens it where it sits; buying digs it deeper.
  - **It is DOM, not canvas.** Each chamber is a real button, so it takes a tap and a focus
    ring with no hit-testing of our own — and the whole screen can be driven and asserted on
    in jsdom (§11), which a canvas cannot.
  - **Every grid item is placed EXPLICITLY.** Left to auto-placement the shaft is laid down
    first and the cursor has already passed column 1, so a left-hand chamber drops into a
    row of its own and hangs a hundred pixels below the branch it comes off.
  - **Depth is carried by tone alone**, because the app clears every gradient and every
    shadow (§10): the ground is darker than the page, a dug chamber is lighter than the
    earth it was cut from, and untouched ground is only a dashed outline.
  - **NOW and NEXT are a comparison** — two labelled rows on one left edge, mint for what
    you have and gold for what you are buying, which is the colour of the button that buys
    it. The description reads at `--ink-soft`, not `--muted`: muted on this ground is
    3.7:1, under AA for text that size.
  - The class names inside are OURS. `.hillwrap` stays because that one is the legacy
    scroller; everything else is dressed at the end of `skin.css`.

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
  instead (50 each). Affects the Colony Road tables and two quests.
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

**ONE DESIGN, EVERY SIZE** (the responsive block at the end of `src/ui/skin.css`). The app
was drawn for a phone and stayed drawn for one: a fixed 360px column with chrome running
edge to edge, so a tablet got an 1100px top bar over a column a third of that — a phone app
stranded in a big screen.
- **The COLUMN grows and the TYPE does not.** `--page` steps 360 → 440 → 520 → 560. This is
  what iOS itself does, and scaling type up on a tablet is the mistake that makes an app
  look blown up rather than designed: a 15px label is 15px on a phone and 15px on an iPad.
  A test holds both the steps and their direction.
- **CSS `zoom` was tried first and rejected.** One line per breakpoint and everything
  scales — but `#app` is `position: fixed; inset: 0` and the tab bar is fixed inside it, and
  a fixed box under `zoom` is sized in scaled units against an unscaled viewport. Board
  hit-testing survived it (measured); the chrome did not.
- **The two bars stay full-bleed and their CONTENTS join the column**, through
  `padding-inline: max(16px, calc((100% - var(--page)) / 2))` rather than a wrapper — so no
  markup moves and the background does not break at the screen edge. The home screen's
  banner, granary pill and hero need telling separately: they are laid out above the body
  column, not inside it. The two floating buttons are POSITIONED, so they answer to the
  viewport until pinned to the column's edge too.
- **Every control is a thumb wide** (`--tap: 44px`). A dozen were under it — the back button
  on every screen, the currency steppers, the granary pill, every switch in Settings, and
  the chip rows in Friends, Support and the Leaderboard. Where a control has to stay
  visually small the SIZE and the TARGET are separated: the 16px stepper keeps its mark and
  an invisible `::after` is what the thumb hits, so the row's spacing does not move by a
  pixel. `getBoundingClientRect` cannot see that, which is worth knowing before "fixing" it
  again.
- **THE GAME IS PLAYED UPRIGHT** (`platform/orientation.ts`, `#rotate` in `index.html`). The
  board is square and the interface is one column, so landscape gives the board a third of
  its pixels and spreads the rest as empty width. Two halves, because neither is enough:
  `screen.orientation.lock` is the real thing where it is allowed (installed, or fullscreen
  on Android) and is REFUSED in an ordinary tab and absent on iOS — so it is asked for on a
  gesture and its failure is the expected case, swallowed rather than logged. The shade is
  what actually holds the line, and it lives in the DOCUMENT rather than being built by the
  app: a phone held sideways while the bundle loads must not show the layout sideways even
  for a frame. Gated on `pointer: coarse`, never on a screen size — a tablet held sideways
  is 1100px tall and would sail through any height threshold, and a laptop window must never
  be told to rotate.
- **A landscape layout was built and then deleted.** The match screen became a grid with the
  action bar as a rail beside the board, which took the board from 156px to 306px on a phone
  on its side. It is gone because the game is portrait-only; it is mentioned here so it is
  not rediscovered as a missing feature. What survived it is `.match { display: contents }`
  moving from an inline style into `skin.css` — an inline style outranks every rule, which
  is worth remembering the next time a screen will not respond to a media query.
- **CSS FAILS SILENTLY, so a test reads the stylesheets**
  (`src/ui/__tests__/css-sanity.test.ts`). `border-radius: 12pxpx` is not an error anywhere:
  the value is dropped and the rest of the rule still applies, so the corner quietly stays
  square while the file says it is round. Twelve of those had accumulated in `skin.css` —
  twelve considered decisions that had never once taken effect — and all twelve were found
  by a search for something else.

**SETTINGS IS A SCREEN, NOT A FORM** (`src/ui/settings.ts`). It was one card of six
identical rows — a label, a bordered button — and two of them were dead: "Sound [On]" and
"Vibration [On]", both disabled, both over nothing, because this build has no audio and no
haptics. A switch for something that does not exist is a screen lying about itself; they
are gone until there is something behind them.
- **Rows are grouped by WHAT THEY AFFECT, and each says so.** It uses the profile screen's
  row — a mark, a name, a sentence, then the value or a chevron — under four headings. A
  test holds every row to having a description, because that sentence is the whole
  difference between a screen and a list of labels.
- **Three of the rows are things the app could already do and had nowhere to offer.** The
  colony's NAME, printed beside the nest for the whole match (§ plates) and never editable
  anywhere; HOW TO PLAY, reachable only from home; and `ProfileStore.reset`, which has
  always existed and which nothing called.
- **The reset asks twice, on the same button.** A confirm dialog would be a second overlay
  for one control; the row re-labels itself and says what it is about to destroy instead.
- **The build stamp is not a setting and no longer sits in the list pretending to be one.**
  It is the foot of the screen — but it stays readable, because on a phone a stale cached
  page and a real bug look identical without it (§ Settings shows the build).
- **Enemy AI says what it actually governs.** A matchmade opponent always plays `hard`
  (§ finding an opponent), so the setting drives challenges; the row states that, because
  a setting that silently applies to less than its name suggests is worse than no setting.

**SOUND AND HAPTICS ARE SYNTHESISED, NOT SHIPPED** (`src/platform/feedback.ts`). There is
no asset pipeline in this project and no image file either — every picture is drawn by the
code that owns it — and a sound file has the same problem plus two more: a download before
the first tap and a decode on a phone. Each cue is a few oscillators and an envelope.
- **A browser will not start audio without a gesture.** The context is built on `unlock()`,
  called from the first press anywhere, and every cue before that is DROPPED rather than
  queued: a sound arriving after the thing it marks is worse than one that never came. The
  same goes for the gap while `resume()` is still settling — scheduling on a suspended
  context does not play late, it plays at the wrong time when the clock starts.
- **THERE IS MUSIC, and it is generated too.** Two beds — menu and match — scheduled a
  sixteenth at a time off the AUDIO clock rather than off the timer: a timer drifts and a
  backgrounded tab throttles it to once a second, so it decides only WHEN TO SCHEDULE.
  `setMusic` is idempotent for the bed already playing, because navigation calls it
  constantly and a bed that restarted on every screen change is a stutter. Muting STOPS it
  rather than turning it down — an oscillator per sixteenth for ever into a gain of zero is
  a phone kept awake for nothing — and a bed asked for before the first press is remembered
  until `unlock` can grant it.
  - **IT NEVER REPEATS, and that is the whole design.** The first version was a four-bar
    chord loop with a fixed pluck pattern, which a player hears as a loop inside a minute
    and then cannot stop hearing. The harmony is a SIXTEEN-bar round now, and everything on
    top of it — the melody, the droplets, the birds — is rolled per sixteenth off a seeded
    generator rather than written out, so the bed is sparse without ever sounding stopped
    and never plays the same phrase twice.
  - **EVERY PITCH IS A SCALE DEGREE. There is no other way to name a note.** `degree()` is
    that one function, and it exists because of a real bug: the round moved the chord roots
    while the voicing stacked a fixed number of SEMITONES above each one, so the two
    disagreed and the bed used ten of the twelve pitch classes — a random pentatonic melody
    over a chromatic accompaniment, which is the opposite of relaxing. Stacking in scale
    STEPS makes every chord diatonic by construction, so no combination of round and
    voicing can break it. A test counts the pitch classes and holds it to A natural minor;
    it is the assertion that found this, and an ear finds it faster.
  - **The melody is a random WALK, one degree at a time**, fenced to two octaves. A walk
    that could jump anywhere sounds like notes rather than a tune, and an unfenced one
    wanders off in one direction and stays there — ten minutes in it is subsonic or a
    whistle. It walks the pentatonic, which is a SUBSET of the scale, so a random note can
    never disagree with the chord under it.
  - **IT IS IN A SPACE.** Everything goes through a convolution reverb whose impulse
    response is a generated burst of decaying noise — there is no file to load one from,
    and a burst of noise IS one for anything ambient. This is the single biggest difference
    between a beep and an instrument standing in a clearing.
  - **THE FOREST IS UNDER IT.** A continuous loop of brown noise through a lowpass whose
    cutoff drifts over half a minute at a time — wind in leaves — and, every several
    seconds, two or three sliding notes far above the music. The bird SLIDES because a bird
    bends its pitch and a fixed one reads as a beep. The drift is scheduled well ahead on
    the audio clock for the same reason the notes are: a throttled tab would otherwise
    freeze the wind mid-gust.
  - **A note is a PAIR of oscillators a few cents apart**, and the long ones carry a slow
    vibrato in CENTS (a fixed number of hertz is a wide wobble on a bass note and inaudible
    on a high one). Perfectly in tune and perfectly steady is the sound of a machine.
  - **A HELD NOTE HAS TO HOLD — attack, HOLD, release.** The envelope ramped straight from
    its attack down to silence, which sounds like a decaying pluck however long the note is
    written to be: an exponential from 0.075 to 0.0001 is four fifths of the way down a
    quarter of the way through. So the pads were ticks, the whole bed measured **−54 dBFS**
    at the speaker, and the honest report from the phone was that there was no music at
    all — with every test in this file passing, because they counted notes and pitches and
    nothing measured a LEVEL. Two tests do now: one that a long note is still at its peak
    past its halfway mark, and one on the bed's own bus. The level itself was set with an
    AnalyserNode on the destination in a real browser (§11 — the same "you cannot see it,
    so measure it" rule, for something you cannot hear either); it sits near −26 dBFS, and
    the wind is deliberately UNDER the notes rather than level with them.
  - **THE MATCH BED IS A WAR, NOT FURNITURE.** The two beds were the same music at two
    speeds, which says the same thing on the home screen and over a board somebody is
    losing. `drive` puts a drum kit and an eighth-note ostinato under the match bed, runs
    it half again as fast and changes chord every HALF bar (`half`) — a round that will not
    settle is the most audible difference after the drum — with the pad on its own level
    (`pad`) so it gets out of the way, and the wind and birds pulled back. The key and the
    round are unchanged, so it is recognisably the same forest. Measured: **6.7 transients a
    second against the menu bed's 1.7.** A test measures the BAR (the gap between the
    longest voice's entries) rather than a fixed threshold: the two beds run at different
    speeds, so any fixed number picks a different voice in each.
  - **IT IS ALL TUNED FOR A PHONE SPEAKER, WHICH HAS NOTHING BELOW ABOUT 400 Hz.** The war
    bed was first written an octave DOWN for gravity, with its kick in a low sine and a
    180 Hz noise band and its ostinato through the pad's lowpass. Measured per band it had
    ten decibels LESS midrange than the menu bed — so on the device it is actually played
    on, the "heavier" bed was the thinner one, and it came back as "sounds the same". It is
    in the same octave as the menu bed now; the kick carries a hard mid click (the beater,
    not the drum), the backbeat sits at 2 kHz and the ostinato is on the open bus where its
    sawtooth harmonics survive. Low end is what a real speaker ADDS, never what a part
    depends on.
  - **THERE IS A LIMITER ON THE WAY OUT.** Four voices and a drum kit with a cue on top
    measured at twice full scale, which a browser clips into distortion. The alternative is
    turning everything down until the worst moment fits — which is a bed nobody can hear,
    and is exactly where this started. Its attack is deliberately slow enough (3 ms) to let
    transients through: tightening it to 1 ms stopped the clipping and cut the measured
    transient rate almost in half, which is the punch being flattened.
  - **THE BED MUST ARRIVE AT ONCE, AND THE OLD FADE HAS TO BE CANCELLED FIRST.** `stopMusic`
    schedules a ramp to silence a third of a second out and the timeline KEEPS it, so the
    new bed faded up into a fade-down still coming — a bed that took seconds to appear when
    the two lengths missed each other and never appeared at all when they lined up. The
    fade is also ARMED in `syncMusic` and RUN from the first pump that really schedules
    something: a context still waking from `resume()` has a clock that has not started, so
    a ramp run at arm time was over before there was a note to hear through it. Measured in
    a browser at **310 ms** from the press to audible. The test fake models
    `cancelScheduledValues` as a real timeline — as a no-op it cannot show this at all.
  - **The room and the wind are built ONCE per bed.** The impulse response is a couple of
    seconds of audio to generate and the wind is a four-second loop; either on the beat
    would be the most expensive thing in the app. Every piece of this is feature-guarded —
    a browser without a convolver or buffer sources gets a thinner bed, never a broken one,
    and that is also every test, since the fake context has neither.
- **EVERY BUTTON MAKES THE SAME SOUND, from ONE listener** on the app root. It is a
  property of the app, not of any screen: wiring a click into forty controls is forty
  chances to miss one, and the two that got missed would be the two a player noticed. It
  fires on `pointerdown` (the press, not the release), in the capture phase (so a handler
  that stops propagation cannot silence the interface), and only for things that ACT — a
  drag across the board or a swipe between screens must not click.
- **THE CUES ARE NOISE WHERE THE THING IS NOT A NOTE.** A rising blip is what a puzzle game
  does when a piece lands, and it was what this one did for a move, a fight and a razed
  tile. What actually moves on this board is a column of ants, so a `move` is a burst of
  very short bandpassed noise ticks filling the time the move takes and a `travel` is the
  same burst over the longer distance — jittered, because evenly spaced ticks are a machine
  gun and uneven ones are feet. `destroy` is a SNAP (a narrow band whose filter drops fast,
  which is what a stick does), a THUD that gives the snap a size, and then RUBBLE — the
  scattered part that says something came apart rather than was merely hit; `fight` is the
  same shape, smaller. One function, `tick()`, is the entire percussion set: a bandpass over
  one noise buffer is a stick, a rim, a twig or a footfall depending only on where the band
  sits and how fast the envelope closes, which is why there is not one audio file here.
- **Levels are MEASURED, never guessed** — with an AnalyserNode on the destination in a real
  browser, because a fake context has no waveform. The beds sit near −20 dBFS RMS and the
  cues peak between a half and three quarters of the bed, so a tap still reads over it. A
  narrow bandpass throws away most of a burst's energy, so the percussive cues need several
  times the gain the numbers suggest; that is why they are tuned against a measurement
  rather than against each other on paper.
- **ONE cue per batch, and it is the loudest thing in it** (`loudestOf` in `match.ts`). A
  long send is a dozen `veinLaid` and a `capture`; an attack is a `combat` and a `capture`.
  A sound each is a rattle. **A batch whose loudest event has no case here is SILENT**, and
  silence is indistinguishable from a broken speaker — reinforcing a tile emits `move` and
  no `capture`, and played nothing at all for as long as this function existed, which is a
  large fraction of everything a player does. It has its own tests now.
- **A tile picked up does NOT buzz.** It happens constantly, and a buzz on every one is not
  feedback, it is a fault. `BUZZ` sets that per cue and a test holds it.
- **THE SOUND CAN BE REPLACED WITH REAL RECORDINGS, ONE AT A TIME** (`platform/sounds.ts`).
  Synthesis has a ceiling: a recorded frame drum is a recorded frame drum, and no amount of
  filtered noise is going to be one. `SOUNDS` is a table of file URLs, EMPTY in the repo,
  and anything named in it REPLACES the synthesised version — drop a file in `public/audio/`
  and name it, and nothing else moves.
  - **Per ENTRY, never all or nothing.** A build can use a recorded loop for the match bed
    and keep every synthesised cue, because that is how a replacement actually arrives.
  - **Every failure falls back to the synthesiser.** Nothing named, a path typed wrong, a
    fetch that dropped, a codec the phone refuses — each gives the generated sound, never
    silence. A missing asset is the failure mode this whole design exists to avoid.
  - **The first play of a sampled cue is synthesised**, because the file is still in the
    air: a cue that arrives late is worse than one that arrived generated, which is the
    same rule as dropping a cue before the first gesture.
  - **A sampled bed replaces the WHOLE generator** — no round, no drums, no wind. A recorded
    piece already has those in it, and running the generator underneath is two pieces of
    music at once.
  - **Paths resolve against `BASE_URL`**, so a manifest written the obvious way works under
    the project page as well as at a domain root.
- **A MATCH IS COUNTED IN.** The match bed opens on a bar of drums ALONE — a roll that
  fills in from quarters to sixteenths and a pickup into the downbeat the music enters on
  (`openBars`, `opener`). A bed that fades up out of nothing does not say a match has
  started. Counted off `played`, which never wraps: `step` wraps with the round, so an
  opening keyed to it would fire again every time bar one came back.
- **THE KIT IS A HAND DRUM, NOT A DRUM MACHINE.** Every hit is a pitched MEMBRANE that
  falls, with the noise part rolled off rather than a bright click on top, and the ostinato
  is a plucked triangle rather than a sawtooth — the sawtooth and the beater click were
  most of what came back as "aggressive and digital". Nothing lands exactly on the grid
  either: each hit carries a few milliseconds of timing jitter and a little weight
  variation, because perfect timing at a constant level is the single most digital thing a
  piece of music can do.
- **`SilentFeedback` is not a stub for something missing** — it is the honest implementation
  for a device with neither capability, and every test in the suite runs on it. Nothing here
  may throw: no audio is a quiet game, never a broken one.
- **Settings has THREE switches, and music is its own.** They are two different
  irritations: a bed running for an hour is what somebody turns off on a bus, and the cues
  are what they still want when they do — one switch for both means turning the music off
  costs the feedback with it. All default ON, and `normalise` reads a missing flag as
  `!== false` — reading it as "off" would silently mute the game for every returning
  player, including on the `music` flag that no older save has at all.

**NO EMOJI, AND A TEST SAYS SO** (`src/ui/__tests__/no-emoji.test.ts`). §10 has said this
since the beginning and every screen was cleaned by hand, which is exactly why the MATCH
screen's action bar still carried five of them — the one screen a player spends the whole
game on — and the board drew a shield emoji into the canvas. The test walks every shipped
`.ts` and `.css` file; comments are exempt, and so are arrows and dashes, which are
typography. It found the hourglass on the ability button that the sweep itself had missed.

## 10a. The guided tour

`src/ui/tour.ts` is the first-run walkthrough, and it is one component doing both halves:
twelve steps across the meta screens — the currencies, the colony road, the bar, each of the
four other deck screens in turn, then one step per setup choice — ending on the button that
starts a match, and twelve more inside it, which play the first five turns: a move, a long
send, a rally, an attack and the Hive queen, with the enemy answering in between.

**The match tour is played on an ARRANGED board** (`src/engine/tutorial.ts`). A first match
played straight cannot teach the game: the Hive sleeps for ten turns, the enemy is a dozen
tiles away, and five tiles of three soldiers cannot crack anything, so the walkthrough could
only ever demonstrate "move onto empty ground". `arrangeTutorial` runs a supply line from the
colony to a camp beside the Hive and puts an ENEMY TILE ON THE GUARD in front of the queen —
on whatever map the player picked, so it never contradicts their choice. It changes no rules;
it decides where things START, the way a formation does. `src/engine/__tests__/tutorial.test.
ts` plays the whole walkthrough on every map as all nine species, because a step asking for
something the board cannot deliver leaves the tutorial stuck with nothing but Skip.

- **The enemy stands on the guard because the queen has no doorstep.** Her only neighbours
  are her four guards, so there is no square she can be attacked from — "attack the enemy,
  then take the queen" needs the enemy standing exactly there. A captured hive tile becomes
  an ordinary stable (§5), so this is a board the game produces by itself.
- **Five lessons, each on its own turn, each in TWO taps.** Move, long send, rally, attack,
  queen — and every one is "pick the tile up, then say where", because that is how the
  player will act for the rest of their life in this game. An earlier walk did the first tap
  for them on every step but the first, which taught half a control.
- **The enemy answers between the lessons, from a script.** `tutorialAiMove` takes one tile
  of empty ground beside the enemy's own colony and nothing else. A turn handed over is half
  of how the game works and a walkthrough where the board never replies teaches a solitaire —
  but it must not be the real search, or the board the next step is about is not the board
  the step was written for. `MatchScreen.enemyReplies` runs it from the FOLLOWING step's
  `enter`, so the move animates under the instruction being read rather than in a pause.
  Its events are muted (`scripted`) or a scripted capture would answer the step on screen.
- **The first match is played on EASY**, whatever Settings says, and the real opponent takes
  over the moment the walk ends — the last step hands the turn over, which is the hand-over
  the whole walk has been rehearsing.
- **A deed is read off the whole BATCH, not one event at a time.** Walking onto empty ground
  is a `capture`, not a `move` (`move` is reinforcing a tile you already hold), and a capture
  is also what a won fight and the end of a long send produce. "Took ground" is a capture
  with no fight and no march anywhere in the batch. Getting this wrong is silent: the action
  happens and the step just never advances.
- **A signal is delivered on a microtask, not inside the batch.** A step opens the moment the
  previous deed resolves — in the middle of the handler that resolved it — and its `enter`
  may hand the turn over. Opening it inside the batch changes the board under it.
- **The bubble is pinned to the top on the setup steps.** They light a whole PICKER, which
  leaves no room beside the hole, so the bubble settles in the middle — on top of the very
  cards the player is being asked to choose between.

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
  - **And so is PLAY.** It was a `tap`, which advanced on the press whether or not the
    setup flow had actually opened — so a press the app did not act on left the tutorial
    asking for a screen that was never coming, with nothing but Skip. `show()` signals it
    when the router really reaches `mapsel`. Any step whose whole point is that the app
    moves belongs on a signal, never on the press.
- **It is ONE walk, counted through.** The meta half and the match half are two `start`
  calls, and each counting from one said they were two different tutorials — the first
  ending on "12 / 12" at the button that begins the second. `start` takes `done` and
  `total`; `MatchScreen.TOUR_STEPS` is what lets the meta half put the whole length on the
  counter before the match screen exists, and a test holds the two together.
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
