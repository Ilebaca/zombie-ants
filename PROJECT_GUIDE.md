# Zombie Ants — project guide

Read this before doing anything. It is the memory this project has across sessions.

---

## 1. The project

**Zombie Ants** is a mobile-first, turn-based territory strategy game. Two ant colonies fight
for a square grid. At the centre sleeps **the Hive** — a wild queen infected with
*Ophiocordyceps*, the real parasitic fungus. Capture her for a growth surge; lose your own
queen and the match is over.

Grounded in real ant biology: eight real species whose real behaviours are their abilities.

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

**Typography and shadows:** Fonts never use outline strokes. The shared skin disables
text stroke across the UI. Text shadows, when used, have zero blur and a sharp edge.
CSS drop shadows use the same sharp edge; the road's subtle background glow is a
separate decorative effect. Do not bring back soft text shadows or outlined lettering.

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
   - **BOTH LENGTHS STRETCH A TURN PER LEVEL** (`surgeTurns`, `surgeCooldown`), which this
     paragraph did not say for a long time and the GDD still printed as flat. A level-3
     queen costs far more to crack than a level-1 one, so the swing she pays out has to
     grow with her; and the gap before she returns has to grow with it, or the board spends
     more and more of the match with a surge running on it.
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
   - **THE QUEEN IS DRAWN AS A CIRCLE AND A NUMBER, AND NOTHING ELSE.** She used to sit
     on a violet SLAB — a rounded plate under each of her five tiles, the same shape a
     colony's own tiles are drawn as — with spore stalks erupting from the middle one.
     Both are gone, asked for directly: the ground already says where she is (a painted
     region paints her fungus across those five cells), and a plate the same shape as a
     unit's said she was something standing ON the board rather than part of it. The
     circle still grows for the QUEEN and shrinks for a guard, which is what the stalks
     were there to say, and a test counts the arcs on her tile so they cannot creep back.
   - **The surge is a COLONY effect, so it has to look like one.** The wave that marks it
     leaves the queen and washes out across every tile the holder owns, each lighting as the
     front reaches its distance from her. Lighting only the five hive tiles said the
     opposite — that whatever was happening was happening over there, on the ground she used
     to sit on. The front travels at a constant tiles-per-second and the gap behind it is
     measured in tiles too, so a four-tile colony and a forty-tile one look the same; a
     fixed period would crawl early and streak across the board late.
   - **The Hive eats what is left standing on it WHEN THE SURGE LAPSES.** Troops on the five
     tiles at that moment are banked (`hive.banked`) and come back as part of the next
     garrison, split in proportion to what each tile is already worth. Deleting them was a
     garrison the player had paid for vanishing with no explanation.
   - **BUT SHE HAS TO FIGHT FOR GROUND SOMEBODY IS STANDING ON WHEN SHE GROWS BACK.** Troops
     camped on the bare grave used to be banked the same way — the tile handed over whatever
     was on it, which was the one thing on this board that took a tile off a colony with no
     fight. Every contested tile goes through `fight()` now (`storm` in `hive.ts`): she
     attacks with the garrison that would have stood there, the colony defends as it defends
     anything, a camp that holds KEEPS the ground and its structure, and one that loses
     leaves her with only what the fight left her. Same arithmetic as any attack, which is
     exactly what was asked for.
     - **The force is worked out BEFORE anything is resolved** (`returningForce`), banked
       pool included, or the tiles she fought for would attack with a share of a pool that
       had already been spent on the tiles she did not.
     - **HER OWN TILE DECIDES, and losing it DENIES the respawn.** She stays dead, the pool
       goes back, `coolLeft` is 1 and she comes at the same camp next round — nothing else
       on the five tiles moves in an attempt she lost. Without that rule the board spends
       the rest of the match with a queen who is "awake" and not there: `setHiveDefence`
       skips an owned tile, so she would never garrison her own square again.
     - **It is why `onHive` had to mean the NEUTRAL hive** (see §5a's lesson). A colony can
       now hold the middle tile while she is standing, and reading the terrain alone both
       made that tile defend with no species multiplier and no flat defence AND paid a full
       surge to whoever beat the camp — a surge out of a queen who was not there.

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

10. **Easy, Normal and Hard get no anthill upgrades, research or traits.** Impossible is
   an explicit exception: it uses the same capped chamber and research levels as the player.
   It receives no extra actions, invented combat bonuses or free soldiers. Enemy modifiers are
   derived by `opponentModifiers()` from the engine caps and `NEUTRAL_MODS`.

11. **WHO MOVES FIRST IS A COIN** (`startsFirst` in `engine/state.ts`). Moving first is worth
   roughly two to one (§8) and for the whole life of this game the player had it in every
   single match. Against a bot that is a habit; between two people it is the match decided
   before either of them touches the board.
   - **DERIVED FROM THE SEED, never drawn off `state.rng`.** The board's own stream is what
     ability scatter consumes, so taking one number out of it here would shift every later
     draw — and every match already recorded, suspended or replayable would come back a
     different game. A pure function of the seed changes nothing that has already been
     played and still replays identically, because the seed travels with the record. The
     seed is offset before use, or the flip would be correlated with the first scatter.
   - **And the record CARRIES it** (`MatchSetup.first`), rather than re-deriving it on
     replay. A derivation is a rule that can be retuned; the day the flip changed, every
     stored match would replay as a different game — the same reason the enemy's formation
     is in there. **An absent field means "you"**, because every record written before there
     was a coin was played with the player first.
   - **THREE THINGS OPT OUT, and they are the same thing: a SCENARIO is not an opponent.**
     The tutorial's first instruction is a move, so a board where the enemy opens leaves the
     walkthrough asking for something the player cannot do (`arrangeTutorial` sets it, and
     so does the router). A CHALLENGE is a fixed position judged against an objective, so a
     coin would quietly make the same challenge a different difficulty on different days.
     And the measurement tools cancel the first-move advantage by swapping SIDES between
     games, which only works while the side that opens is the same one every time — left to
     the coin, half the swaps cancel nothing and the ladder measures the seed.
   - **`blankGame` in the test helpers opts out too**, and that is not tidiness: `canActFrom`
     gates every action on whose turn it is, so a test board left to the coin would refuse
     half its own moves depending on the map's default seed.

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
- **A CUT-OFF TILE CASTS NO TERROR, and the reach is TWO.** Reported as "terror is bugged,
  doesn't work well", and it was two separate faults with one symptom — a garrison ending
  up somewhere the player could not account for.
  - `castFlee` measured against EVERY tile the caster owned, connected or not, and that
    set decides both which enemy garrisons panic AND which way each one runs. So a single
    stranded outpost (§4.2: producing nothing, defending nothing) frightened a garrison
    nowhere near the colony and shoved it in a direction that made no sense from anything
    on screen. `mine` is filtered by `isConnected` now.
  - `FLEE_REACH` was 3, which is "every enemy garrison within three tiles of anything I
    own, pushed up to three tiles". On a 9x9 board with two colonies in contact that is
    most of a front line rearranged in one tap, and the position the player was reading a
    moment ago is gone. Two is the tiles NEIGHBOURING the colony pushed a step clear of
    it, which is what the ability is for.
  - Two existing tests had to have their BOARDS moved rather than their assertions
    weakened — at reach 2 the runner stops one tile earlier, so one landed on the trail it
    was supposed to strand and the other never reached the tile it was meant to merge
    into. A test whose board only worked at the old number is a test of the number.
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
- **THE BOARD IS 90vw WIDE AND DEAD CENTRE, ON EVERY PHONE** (`BOARD_VW` in
  `render/layout.ts`). A tile is a tenth of the VIEWPORT and the nine of them span nine
  tenths of it. It used to be whatever was LEFT once the header, the turn bar and the
  action row had taken their share — `min(w, h) - 28` of the canvas — so the playfield was
  a different size, and a different fraction of the picture, on every device. A ground
  painted to the tile grid cannot live with that.
  - **Measured off the VIEWPORT, never the canvas.** The match screen is `display:
    contents`, so the canvas happens to be the full width today; a gutter added above it
    tomorrow would make nine tenths OF THE CANVAS something other than 90vw, which is the
    number this rule exists to pin.
  - **A canvas too short for that square falls back to FITTING it**, because a clipped
    board is worse than a small one. No portrait phone reaches it — measured in a browser
    from 320x568 to 768x1024, the shortest left 43px of slack — but a desktop window laid
    out wide does, and the game's rotate shade is gated on `pointer: coarse` (§10) so it
    never covers one.
  - **`drawSnapshot` builds its Layout BY HAND and is untouched by this.** A figure is
    exactly as big as its window, so there is no viewport in it to be nine tenths of.
  - **And it is what the region's picture is lined up BY.** A painted ground carries the
    grid itself and is scaled until its cells are the board's (§ THE PICTURE CARRIES THE
    GRID), which only works because the board is the same fraction of every screen.
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
- **THE FILL FRONT LEAVES FAST AND SETTLES — it is not a constant rate** (`frontEase` in
  `render/reveal.ts`). It ran at one for a long time and there was a test insisting on it:
  equal ground in equal time, so a single capture and the tenth step of a long send extended
  identically. That is the honest way to animate something with no mass, and it is exactly
  what it looked like — a bar filling. What is actually moving is a column of ants, and
  anything moving under its own power leaves quickly and arrives slowly.
  - **IT HAS TO BE STEEP TO BE SEEN AT ALL.** The first attempt was a gentle four-to-one
    and the honest report from the phone was "I don't see any difference" — which is fair:
    most of what a player does is a SINGLE tile, a quarter of a second end to end, and a
    mild curve inside a quarter of a second is not something an eye picks up. Measured in
    the browser on a four-tile send, before and after: **180 ms / 400 ms** for the first
    and last tile, against **110 ms / 580 ms** now. Half the distance is covered in the
    first quarter of the time.
  - **It is a BLEND of a straight line and an ease-out, and that is the whole of the
    tuning.** A pure ease-out arrives with ZERO speed, so the last tile of a send never
    quite lands — it asymptotes, which reads as the animation stalling rather than
    settling. The line mixed back in puts a floor under the final speed. Two dials:
    `FRONT_EASE` (0.8) is how much of the curve is ease rather than line — 0 is the old
    constant rate, 1 stalls — and `FRONT_POWER` (3) is how sharply the ease falls away.
  - **The inverse is SEARCHED, not solved.** Inverting the cubic in closed form is
    Cardano's formula, which would have to be rewritten the day `FRONT_POWER` moves — and
    the whole point of that constant is that it is a dial. Forty halvings land well inside
    a rounding error, and it runs once per tile of a batch rather than per frame.
  - **How long a run TAKES did not change** — `REVEAL_MS_PER_TILE` is an average now, and
    `revealStepMs` still shortens it past six tiles so a long send lands inside a second and
    a half. Only the pacing within the run moved.
  - **EVERY FLOURISH IS SCHEDULED AGAINST THE FRONT, not against an index.** The streak, the
    clash, the white-out and the pop were spaced by `i * stepMs`, which was the same answer
    while the front was steady and is wrong now: the streak for the fourth tile would set
    off well after the ground under it had filled. `slotMs` answers "when does the front
    reach this slot", inverting the curve exactly rather than searching it, and `animate.ts`
    asks that. Nothing about this shows up in a test of the reveal alone — the fill looks
    right and the effects drift off it — so `render.test.ts` holds the delays.
  - **And the comet rides the same curve** (`fx.ts`). It also stopped keeping its own copy
    of the step time: `FLOW_MS_PER_STEP` was 260 with a comment saying it matched
    `REVEAL_MS_PER_TILE`, but `revealStepMs` SHORTENS past six tiles and the copy did not —
    so on a ten-step Travel the streak was still crawling a second after the trail it was
    supposed to be laying had finished filling. Two places spelling out one rule (§7).
- **A TILE TAKEN OFF THE PLAYER MUST BE SEEN TO BE TAKEN, even under a travel**
  (`inTravelRun` in `render/animate.ts`). Reported from a real match: "the enemy played his
  tile across mine, through my line of tiles, destroying one in the process."
  - **The ENGINE was innocent, and proving that is what found the real fault.** An ability
    is a free extra action (§4.10), so ONE turn can eat a tile out of the middle of a line
    and then send a column along the ground it just took. Both halves are legal; together
    they look like somebody walking through your colony.
  - **The animator skipped any capture that merely sat on the travel PATH.** But a travel's
    reveal run is filtered to the tiles it CLAIMED — the ones that got a `veinLaid`, which
    only fires over ground that was EMPTY. So the tile the same turn had just taken off the
    other colony was on the path, not in the run, and got neither: no fill, no white-out.
    It was simply the other colour on the next frame, under a comet flying across it.
  - The predicate is "on the path AND claimed" now, and **both halves are load-bearing** —
    on-the-path alone is the bug, and claimed alone stops a vein laid by anything OTHER
    than a travel from ever filling in. A mutation of each fails a different test.
  - **AND IT CAME BACK, because the tile being SEEN to go was only half of it.** Reported
    again from a real match — "he was able to cut my line with his long move, long move
    should not be able to attack", twice in ten games. The engine was innocent again:
    `travelTargets`/`pathTo` only ever step onto ground that is EMPTY or already the
    mover's, and the audit came back clean at hard over **18 games / 1,555 turns**. What
    the player saw was ONE TURN DOING TWO THINGS ON ONE FRAME — the ability destroys a
    tile out of the middle of a line and the column sets off along the gap in the same
    batch, so the tile dies under the comet.
  - **SO THE MARCH WAITS FOR THE CAST** (`SECOND_ACT_MS`, `actGapOf`). Everything before
    the first march verb (`move`, `travel`, `rally`) is the cast; it plays at once and the
    march — its fill, its streak, its pop, its captures — is held back a beat. It is a
    delay on the ANIMATION only: the engine has finished the turn and the searched board
    lands whole, which is why this could not be done by playing the two halves as two
    board updates.
  - **A TRAVEL'S OWN TRAIL IS NOT A CAST.** `travel()` emits one `veinLaid` per step and
    only then the travel itself, so those always sit in front of the march — counted as a
    first act, every long send would wait for itself. Three existing tests failed exactly
    that way, which is how the rule was found rather than shipped.
  - **The hand-over waits with it.** `MatchScreen.playAI` holds the turn open for the
    animation; a batch that plays a beat longer needs that beat, or the second half is cut
    off precisely where it matters.
  - **AND IT IS RARE, WHICH IS WHY IT LOOKED LIKE A BUG.** `npm run reach` counts the
    pattern now, and the number has been re-measured on a sample twelve times the size:
    **74 turns in 9,371 at hard, 0.8%** (it read 0.4% off 773 turns, which is the sort of
    thing a three-figure sample gets wrong). Call it one turn in forty-five — about one a
    match — against a player who has seen every other turn behave. Milan reported it twice
    in ten games, which is the same order. A thing that happens about once a match and
    looks illegal is worse than one that happens constantly.
- **AND THE WAY THAT WAS SETTLED IS ITS OWN TOOL** (`npm run reach`, and
  `engine/__tests__/reach.test.ts` as the tripwire). Every rule test in the suite builds the
  one board it is about; nothing played whole games and watched the WHOLE grid. This does,
  after every single action, against two rules: **every tile that changed hands was named
  by an event** (the renderer draws from events and nothing else, §3 — so a tile that
  changes owner unannounced changes on screen with no animation), and **an action only
  reaches where its kind can** (a move touches two ADJACENT tiles; a travel's path is
  orthogonal steps, no longer than the range, over ground that is empty or already its own).
  - **Ownership is carried forward EVENT BY EVENT, never read off a snapshot taken at the
    start of the turn.** That is the first thing it found, and it was a false alarm — the
    ability had taken the tile earlier in the same turn. Worth keeping in mind: on this
    board "the enemy reached too far" and "the enemy did two legal things in one turn" look
    identical from a snapshot, and identical on the sofa.
  - **The difficulty decides what is audited**, because it decides which actions are played
    at all: `easy` generates no travel, `normal` no rally, and only `hard` plays the whole
    set (§4a) — so a clean run at normal says nothing whatever about rally, and the sweep
    has to be run at hard before it means anything. The engine came back clean at both:
    **81 games / 8,362 turns at normal, and 108 games / 9,371 turns at hard** — the second
    re-run since, still zero unnamed changes and zero over-reaches, in 57 minutes (which is
    why it is a tool and not a test). The suite carries one short game,
    because the search is synchronous and a full game is most of vitest's RPC budget spent
    on a tail where nothing new happens.
- **AND VEINS HAVE THEIR OWN SWEEP, for the same reason and a worse one** (`npm run
  veins`, and the tripwire at the foot of `engine/__tests__/veins.test.ts`). Reported from
  a real match as "a bug with veins, vein interaction with abilities especially", with a
  stub hanging off the colony pointing at nothing. Two faults, and the reason neither was
  caught is the part worth keeping:
  - **`invariants.test.ts` plays `easy`, AND EASY GENERATES NO TRAVEL** (§4a). Travel is
    the only thing in this game that lays a vein, so the audit carrying the most vein
    rules had been running for months on boards that had almost none. It stayed green the
    whole time. `normal` is the cheapest difficulty that travels, which is what the
    tripwire plays, and the tool plays `hard`.
  - **IT CHECKS AFTER THE HAND-OVER, not only after an action.** `startTurn` is where
    effects tick and where the hive takes its five tiles back, and both of those can
    strand a trail — neither is visible to a check that runs only after a move.
  - **A SWARM DEVOURED INTO A VEIN.** Feeding Swarm eats a bitten garrison INTO a
    bordering tile of its own, and the tile it picked was allowed to be a vein — so the
    colony grew a vein CARRYING a garrison, which then ate the next bite as well and
    climbed on every cast. §4.6 already said what should happen ("troops landing on a
    vein promote it to a stable"); the swarm was the one path that landed troops without
    going through `promote`. One line, in the function that owns the rule (§7).
  - **THE HIVE TAKING ITS TILES BACK IS AN ANCHOR GOING AWAY.** While a colony holds them
    they are ordinary stables, so a trail may legitimately end on one — and `startTurn`
    recomputed supply lines after `hiveTick` without PRUNING, so a surge lapsing (or a
    queen storming a camp off her own ground) left the trail standing as a stub for the
    rest of the turn. It prunes there now, the same way it already did after effects.
  - **A TEST THAT DELETES ITS OWN EVIDENCE IS NOT A TEST.** The flee-landing case passed
    against the broken code: the runner landed on the end of a THREAD, so an unpromoted
    vein-with-a-garrison was destroyed for having one anchor before the assertion ran, and
    the board came out clean either way. The landing tile is given two anchors of its own
    now. Mutation-check anything on this board that prunes.
  - **AND ARMOUR WAS LANDING ON TRAILS.** Attacking an enemy vein captures it instantly —
    the combat path returns before `fight()` is reached — so a defence bonus on one cannot
    change a single outcome. What it DOES do is draw: armour is a full-tile plate and a
    shield badge, so an armoured vein lit a square over a trail drawn as a thin bar, and
    put a shield on the one tile in the game that cannot defend itself. Both paths that
    armour a tile now ask `takesArmour` — Fungal Garden's frontline sweep, and a leaf wall
    leaving armour as it withers (a wall is only ever cast on EMPTY ground, but a travel
    may lay a trail across it first). Fortify already skipped veins; this is the rest of
    that rule.
  - **AND THERE WAS A THIRD PATH, found by re-running the sweep after fixing the first
    two.** Razing a tile does NOT clear the effects on it — deliberately, because venom
    and fire keep burning ground after whatever stood there is gone. Armour is the one
    effect that belongs to the GARRISON rather than to the ground, so it outlived its
    tile and a travel laying a trail across that square inherited a shield nobody cast
    there. `travel` strips it where it lays the vein, which is the only place in the game
    a tile becomes one. Guarding the two places armour is ADDED was not enough, and
    nothing but a sweep would have said so.
  - Clean at hard over the sweep after the fixes; `npm run veins [games] [turns]`.
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
- **THE OPENING IS THE COLONIES GROWING OUT OF THEIR NESTS, AND NOTHING ELSE.** There was
  a CAMERA: the match began high above the board, the clearing small in a frame of
  undergrowth, the floor growing up to the lens and locking, bushes sliding out of shot
  and a supply line running in from off the frame to each nest (`render/intro.ts`, now
  deleted, with its test). It is gone because Milan asked for it directly — "I don't want
  that zoom anymore" — and the reason it cannot come back as it was is structural: the
  board is a FIXED frame now and a region's picture is painted to fit that frame exactly
  (§ THE PICTURE CARRIES THE GRID), so a camera that pulls back is a camera pulling back
  off the edge of somebody's artwork. Written down rather than left as a hole, because it
  is the kind of thing that gets rediscovered as missing.
  - **What it cost, and what it bought.** It cost `terrainBleed`, which is 0 now: the
    plate was baked half as big again in every direction so the lens never saw its edge,
    which is several times the area for ground nobody can see. The one real consequence
    was the scenery count — props are SOWN over the plate and thrown away if they land on
    the board, so the number to sow is the plate's whole area over the canvas's FREE
    ground. It was the plate's free ground over the canvas's, which only came out right
    while the plate was much bigger, and the ring around the tiles emptied by half the
    moment the bleed went.
  - **The colonies still grow**, and they are scheduled from NOW rather than from a
    landing that no longer happens — a front timed for one would leave the board empty
    for the whole hold and then blink on. A test holds that the reveal has finished by
    the end of the hold the caller is given.
    - **AND THE HOLD IS THE FILL'S OWN LENGTH, never a number written down beside it.**
      It was `OPENING_FILL_MS`, a flat 820ms, which is what a THREE-tile front takes —
      and only the wedge and the hook are three tiles from the nest at their far corner.
      The other ten formations reach four or five, so the hold ran out mid-fill, and
      `endIntro` then CLEARED the reveal and grew the colonies again: **the opening
      visibly played twice**, on ten of the twelve formations. Reported from a real match
      as the troops moving in, snapping back and loading in again. Measured in a browser
      on the `line` formation — the player's own colour on the board rose, dropped from
      28,551 pixels to 23,166 at 837ms, and rose a second time.
      - Two faults, one cause (§7): a constant spelling out the reveal's arithmetic, and
        `endIntro` starting the fill rather than settling it. `growColonies` returns the
        wider of the two fronts and `playIntro` asks `reveal.runMs` for the hold; a skip
        now only clears. `endIntro`'s `growColonies` was correct while the fill was
        scheduled for the moment the CAMERA landed — a tap before that had nothing
        running to settle — and became a second play the day the camera went.
      - **The default board in `renderer.test.ts` is a WEDGE, which is why every test
        there passed.** The regression test walks all twelve formations with the enemy
        left on the wedge, so the hold has to be the wider of the two fronts as well.
  - **Every control still skips it**, canvas and footer alike. The footer is DOM and
    stays live under the animation — End turn during the opening handed the first turn
    over before the match had visibly started.
  - **And the scenery must survive a resize.** Every prop is placed from its OWN seeded
    generator, keyed on its index: with one shared sequence a prop rejected for landing on
    the board consumed a different number of draws than one that was kept, so a few pixels
    of relayout reshuffled every prop after the first difference. It is the DRAWN floor's
    scenery only — a painted region replaces it.
  - **Nothing may RESIZE at the hand-over.** The ability button's label is one line in the
    markup and two once it names the ability and its cooldown, so filling it in at the
    first turn grew the footer five pixels, shrank the canvas, fired the ResizeObserver,
    re-measured the board and re-baked the ground. `start()` dresses the HUD BEFORE
    `playIntro()`. Anything else that writes into the chrome has the same trap.

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

- **THE BOARD IS DRAWN SHARP, AND THE DEPTH OF FIELD IS GONE** (`render/depth.ts`, deleted).
  It was a tilt-shift: a band across the middle sharp, the forest above and below it soft,
  tilted a few degrees. It was cheap — it read the finished frame rather than a copy of it
  and painted back only the two soft bands, so the frame cost 16.7 ms either way — and it
  was a VIEW like the opening camera and the winning flood, touching neither the board nor
  the layout. It is gone because the ground under the board is a PAINTED REGION now, and
  blurring the top and bottom of somebody's artwork is the renderer throwing the picture
  away. Reported as "remove blur effect we have". Written down rather than left as a hole,
  because it is the kind of thing that gets rediscovered as missing: if it ever comes back,
  its sharp band has to be measured off `layout`'s own rectangle rather than a fraction of
  the screen (a board fills very different amounts of a phone and a tablet), and the blur
  has to be a DOWNSCALE rather than `ctx.filter`, which reached Safari only in 17.

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
- **A HIDDEN SCREEN IS HIDDEN — and an ID RULE OUTRANKS THE RULE THAT HIDES IT.** The
  router shows one page by putting `.hidden` on every other one, and the legacy rule that
  acts on it is `.screen.hidden { display: none }` — TWO CLASSES, which any per-screen rule
  keyed on an id beats. `#formation { display: flex }`, added when the setup screen became a
  flex column, left that screen standing on top of the match it had just started: two things
  on screen at once, and still there on the way back. `.screen.hidden` carries `!important`
  now rather than the id rule being rewritten, because the next screen that needs a display
  of its own walks into exactly the same trap. `ui/__tests__/hidden.test.ts` puts both
  stylesheets into jsdom and asks for the COMPUTED display of every id `skin.css` styles —
  reading the file cannot see a cascade, which is the whole fault.
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
**Two more were found by that sentence** — `onHive` in `actions.ts` and `flatDefence` in
`combat.ts`, both reading the terrain alone. A colony HOLDS hive tiles routinely (a captured
guard becomes a stable, §5) and both of them made such a tile defend as the neutral hive
does: no species multiplier, no flat defence, on ground its owner had fought for. Each takes
`!t.owner` now, and a test attacks the same garrison on hive terrain and on plain ground and
holds the two answers identical.

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

**ONE BOARD, AND ONE SCREEN THAT ASKS THE OTHER TWO QUESTIONS** (`engine/config.ts`,
`ui/setup.ts`). There were three maps — 7×7 Skirmish, 9×9 Corridor, 13×13 Gauntlet — and
choosing between them was the FIRST thing the game asked of somebody who did not yet know
what a Hive was, or what a longer match was going to cost them in time. Corridor is the
one that survived.
- **The type stays a union of ONE, and the setup keeps its `map` field.** A match record
  carries it (`engine/protocol.ts`), so every stored match still says what it was played
  on, and a second board is a line in `MAPS` plus a block in `buildMap` rather than a shape
  change through the whole app. `maps.test.ts` holds that nothing assumed more than one.
- **Everything that NAMED the board stopped saying anything.** The Settings row that cycled
  boards is gone (a control that cycles a list of one is a screen lying about itself, the
  same fault as the dead Sound and Vibration switches), the board chip is off the challenge
  cards, and `profile.lastMap` is gone — a memory of a choice that no longer exists.
- **Setup shares Shop's header inset and Home's primary action geometry.**
  `--screen-top` is shared by ordinary headers and the setup header. Next and Play use
  `--primary-action-width` and `--primary-action-height`, just like Home. The setup
  bottom inset, `--primary-action-bottom`, reserves Home's tray footprint and three
  HUD gutters so all three buttons align even when the tray is hidden. Picker controls
  retain the reading-column width; colony artwork still spans the viewport.

- **The setup is now ONE screen with TWO steps** (`buildSetup`), and Next does not
  navigate: the same row starts naming colonies instead of formations, the tiles on the
  board recolour, and the button becomes Play. The picture never moves, so the player is
  watching the thing they are deciding about rather than two screens of cards.
- **The board is drawn by the BOARD'S OWN CODE** (`render/snapshot.ts`) over a real
  `GameState`, so the gems, rocks, water and the Hive are where they will actually be, and
  a change to how a nest is drawn reaches this screen on the same commit. FIT, not cover —
  the whole board, with a hair of soil around it (`padTiles`), because a canvas cropped to
  the last tile cuts the clearing's feathered edge off mid-fade.
- **AND IT IS THE GROUND THE MATCH WILL BE PLAYED ON.** It wore the game's own DRAWN
  forest floor on every chapter while the match itself is played on the region's painting
  (§ THE BOARD'S GROUND IS PAINTED PER REGION) — so the picture a player picked a formation
  on was a different place from the one they then played in. `drawSnapshot` takes an `art`
  url and hands it to `drawTerrain`; the lookup (`groundFor(chapterOf(colony))`) is done in
  the SCREEN, because which picture belongs to which stretch of the road is a progression
  decision and `render/` may not read one (§3).
  - **A STILL HAS TO BE REDRAWN WHEN THE PICTURE LANDS** (`groundReady`). The board redraws
    every frame and simply picks the file up on whichever frame it arrives; a snapshot is
    drawn ONCE, and the file always lands a beat after that one draw — so without a redraw
    the screen keeps the drawn ground for ever. The redraw reads the choices LIVE, or a
    picture arriving after the player has stepped on would put the previous formation back.
  - **AND HOME FETCHES THAT PICTURE A SCREEN EARLY** (`groundReady` in `App.renderHome`).
    The redraw above is correct and still reads as a fault: opening the setup screen for
    the first time showed one frame of the game's own DRAWN forest floor and then the
    region, reported as "it blinks another map for a moment". Nothing on the setup screen
    can fix that — what fixes it is the picture already being in hand when the screen
    opens, and home is where PLAY is pressed. Fire and forget, and idempotent: the loader
    holds one element per url for the life of the page, so the rebuild home does on every
    deck slide costs nothing.
    - **WAITING for the picture instead was tried and is WORSE.** Holding the first draw
      until `groundReady` resolves means an image element that never fires either event
      leaves the board blank for ever — which is every jsdom test (two failed at once,
      which is how this was caught) and any browser that simply never answers. A blank
      square reads as broken where a redraw reads as loading, which is the rule the
      granary pill and the hatch button already follow.
  - **The manual's figures and the news pictures leave `art` unset on purpose.** They
    illustrate a RULE, which is true on every ground there is; dressing one in a chapter's
    artwork would say the rule belongs to that chapter.
- **NO ENEMY ON IT.** Their corner is the one thing in the picture that is not the choice
  being made, and at this size a second colony reads as part of the formation.
- **IT OPENS ON THE LAST PICK.** It used to reset to the first formation on every open —
  "a fresh choice each time, exactly as the legacy build opens" — so a player with a
  favourite re-stepped to it before every single match, twelve formations round. The choice
  already lived on the save (`lastShape`/`lastSpecies`, written when a match starts) and the
  shell already read it back; the SCREEN was what threw it away. All it does now is refuse a
  formation the build no longer carries, which is the same rule the colony step follows.
- **THE COLONY STEP SHOWS THE COLONY, AND THE PAINTINGS SLIDE.** It recoloured the same
  BOARD and stepped a name under it, so the thing being chosen — which ant — was a word
  and a tint on a map, while the colony's own painting sat two screens away in the
  Antarium. The second step is a RAIL of those paintings now, moved one pane across per
  press. Three rules:
  - **BOTH PICTURES STAY IN THE DOM and a class swaps them.** The rail has to keep its
    position so stepping back from the formation lands where it was left, and rebuilding
    it per press would restart the slide from a standing start every time.
  - **The offset follows the CHOICE, never a count of presses.** It is
    `owned.indexOf(species)`, which is the same list the arrows walk, so the two can
    never disagree about where the rail should be.
  - **A COLONY WITH NO PAINTING KEEPS ITS DRAWN HEAD, in a pane of the same shape.** A
    pane that vanished would put every colony after it one place out on the rail — and
    it is what let the slider land without depending on all eight files existing.
  - **AND THE PICKER STOPS AT BOTH ENDS; it does not wrap.** With the colony step drawn
    as a rail that is the one place wrapping cannot work: stepping past the last colony
    slid the whole row backwards across every other one to reach the first, which reads
    as the screen throwing the player back to the start rather than as one more step.
    Both steps stop, not only the colony one — they are the same two arrows in the same
    place, and an arrow that wraps on the formation and stops on the colony is two
    behaviours for one control.
    - **THE DISABLED ARROW IS THE MECHANISM, not a second one.** A first version also
      clamped the index inside the handler, and the mutation that turned that clamp back
      into a wrap passed every test — a disabled button cannot be pressed, so the clamp
      was unreachable code dressed as a rule (the same lesson as the ability card's
      clock guard). What is left in the handler is a FALLBACK, and it is commented as
      one. Dimmed, never HIDDEN: the row is a three-column grid and a missing arrow lets
      the name slide to the edge on the first and last colony.
    - **An existing test asserted the WRAP** — it walked one full loop and checked it
      came back round. It walks to one end and back along the whole list now, which is
      what "the arrows reach every formation" actually means without one.
  - **The little head beside the NAME went with it.** It was there because a colony is a
    face everywhere else it is named; with the painting directly above the name it was
    the same fact twice on one line, and the smaller of the two.
- **An arrow may not step onto something the screen will then REFUSE.** The grid of cards
  it replaced showed locked colonies so the goal was visible and turned them down with a
  toast; a stepper that lands on one is a dead end with nothing to say. It walks what the
  player owns, and the Antarium is where the rest are seen.
- **The step it finished is REPORTED, never assumed** (`onStep`). The tour walks this
  screen and the screen does not know the tour exists — the same seam every other screen
  uses, and it is what lets a step advance on the deed rather than on the press.
- **THE PICTURE AND ITS NAME SIT IN THE MIDDLE; THE BUTTON HOLDS THE BOTTOM.** The name
  and the arrows sit 20px under the board's bottom edge, because they are what the picture
  is being stepped through with — and the button is SEPARATE from them, where a primary
  action belongs. The board is square and a phone is not, so there is always slack: two
  flexible gaps, one above the board and one under the name, share it equally. `flex: 1 1
  auto` on both, never `flex: 1` — a basis of zero splits the whole screen by grow factor
  rather than sharing out what is spare, which sizes each box without reference to what is
  in it and runs the picture up under the header. The header is LIFTED OUT of the flow, so
  the middle is the screen's middle rather than the middle of what is under the header,
  which sat the picture low; there is nothing behind it to cover, because the ground above
  the board is empty. Two things it costs: the screen must NOT be given `position:
  relative` for the header to hang off (`.screen` is already `position: absolute; inset:
  0`, and overriding that collapses the screen to the height of its content), and an
  INVITATION puts the header back in the flow — the bar and the header together are a
  third of a short screen, and the picture would ride up through them. The button stays
  INSIDE the footer with the picker, so the tour's one hole can hold both controls live.
- **AND THE PICTURE IS SIZED AGAINST THE BOX IT SITS IN.** The tile is measured in JS off
  the viewport minus the screen's own gutter and the chrome above and below, so the stage
  may add NO inset of its own: a board wider than its column does not centre, it overflows
  the END and is clipped there — reported as "the map is cut off to the right". A test
  reads the rule out of `skin.css`, because nothing else can see it.
- **The way in NAMES THE BOARD.** Home's button reads PLAY 9×9, read off `MAPS`. The screen
  that used to ask which board is gone, so that button is the only place the player is told
  what they are about to play on.

**A COLONY'S PAINTING COMES IN TWO SETS** (`src/ui/covers/`, `src/ui/covers-cut/`,
`ui/covers.ts`). One painted ant per colony, shown at the top of its own page and as the
rail the setup screen's second step slides. THE FOLDER IS THE TABLE, twice over and the
same rule the home artwork and the region grounds follow: `covers/fire.webp` and
`covers-cut/fire.webp` are both the Fire Ant's, both resolved by a build-time glob, and a
colony with no file in either keeps its drawn head in a box of the same shape.
- **THE DIFFERENCE IS THE GROUND THEY STAND ON.** `covers/` is the painting as delivered
  — the ant on its own lit brown ground, lamp and shadow and all. `covers-cut/` is the
  same ant CUT OUT on transparent ground.
- **AND IT IS TWO SETS BECAUSE THE TWO BOXES ARE NOT THE SAME BOX.** One set was tried
  for both and each half came back in turn. The SPECIES PAGE is a full-bleed hero across
  the top of a screen, and the cut-out there is an ant floating in a flat rectangle of
  `#1a120a` — "restore previous species images just in the species overview". The SETUP
  RAIL is a rounded pane stepped through one colony at a time, and the painting there is
  a photograph in a frame; the brown plate behind a transparent picture was reported as
  the image "somehow still having a brown background".
  - So the hero takes the PAINTED one (`coverFor`) and the rail the CUT one
    (`cutCoverFor`), **and the rail's box has no fill at all** — the screen's own ground
    is what the ant stands on, which is the whole point of a cut-out. `#1a120a` stays on
    the HERO, and that is not an inconsistency: it is the colour the paintings are lit on.
  - **AND THE PLATE CAME BACK FROM FOUR THOUSAND LINES AWAY.** `.coverpane` was swept
    into the design remap's shared card list (§ AND THE OTHER NINETEEN CAME OVER AS ONE
    REMAP), so the pane wore the card's fill, its 7px corner and its ledge — a lit grey
    rectangle behind a cut-out that exists precisely so the screen's own ground would be
    what the ant stands on. Reported from a phone: the species frame should have no
    background, no rounded corners and no design attributes at all. Same shape as the
    `padding` shorthand that wiped three caps and the `#mainNav.homenav` tie that stopped
    the bar hiding — **a rule written early, correct, and silently overruled by a list
    further down the file**, which is the one failure this stylesheet keeps repeating.
  - **So the test SWEEPS every rule that mentions the pane**, rather than reading the
    pane's own rule. `rulesFor` matches a rule by its WHOLE selector list, so it cannot
    see a plate arriving from a list of twenty-odd classes; the check walks the file and
    fails on any rule whose selector mentions `.coverpane` and which sets a background, a
    radius or a shadow. Anything else that must stay undressed wants the same shape.
  - **Each falls back to the other rather than to nothing**, so a colony with a file in
    one folder and not the other is still shown everywhere. `css-sanity.test.ts` holds
    that the rail has no plate and the hero still has its ground, and `covers.test.ts`
    holds that each function answers out of its OWN folder — nothing but the folder a url
    came from can tell the two apart.
- **ONLY THE CUT SET CARRIES ALPHA, and a test holds it.** One delivered with its
  background still baked in would sit in the rail as a brown rectangle on the screen's
  green, which reads as a considered frame rather than as a mistake.
- **AND THE CUT FRAME IS OURS.** They arrive at 1402x1122, which is nearly square and
  mostly empty above and below the ant, so each is re-framed into 1567x900 — padding
  transparent ground costs nothing. The PAINTED set keeps the three sizes it has always
  had (1567x900, 1402x1122 and 1567x1254), which the ratio test was written to survive:
  a file wider than the box loses its head to the crop, taller only loses sky.
- **THE HEAD PORTRAITS ARE DIFFERENT ART** (`src/ui/faces/`, 512 square). They are a close
  crop of the head and they are what a friend row, the matchmaking reel and the result card
  wear; cutting one out of a cover would be an upscale of a third of the picture.

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
  middle of the board, which is inside most of these windows.

**THE COLONY ROAD IS A VERTICAL TWO-TRACK REWARD ROAD** (`src/ui/road.ts`).
- Fifty chapters, five checkpoints each. The existing free/pass reward table and claim
  keys stay unchanged: 5,625 mycelium / 1,000 crystals free, plus 7,750 / 1,400 on the pass.
- The premium cards are on the left: tall, straight cyan frames with blue gradient faces
  and a white lock. Smaller purple normal cards sit on the right. Both show
  resource art, a named free avatar, or a premium '?' trait card, with its caption beneath. Claimed cards carry green checks.
- Resource rewards are mixed on both tracks in every chapter. Existing currency rewards
  move between neighboring chapter pairs; avatars stay in place. roadKey maps display
  positions to the original immutable reward ids, and rewardFor keeps paying the same
  amount for each saved id. Total rewards and saved claim keys remain unchanged.
- Free middle rungs grant their existing avatar; premium middle rungs grant one random
  trait instead of a duplicate avatar. Rarity is guaranteed by chapter: Common 1–10,
  Uncommon 11–20, Rare 21–30, Exceptional 31–40, Mythic 41–50. The trait definition
  is still random, drawn from universal and owned-species pools by rollTrait; road claims
  never use hatch rarity odds. claimRoad mints a uid and saves item plus key in one write.
  Trait cards use the canonical engine rarity fill and print its name above a faceted
  green question badge, with 'Trait' beneath. It costs no larva and does not convert to a
  skin/avatar. A full bag leaves the reward unclaimed and shows BAG FULL. Previously paid
  premium keys stay claimed; no retroactive re-roll.
- Each card claims its own existing free/pass key. An unowned premium card opens the shop;
  future normal cards cannot be claimed. Existing combined claims remain claimed on both
  tracks. Buying a pass later does not repay normal rewards.
- Area colors follow the ten regions in five-chapter groups: forest greens, desert ochre,
  volcanic charcoal, rainforest emerald, mangrove teal, savanna olive, cave indigo, tundra
  ice blue, amber gold and fungal plum. All road backgrounds are solid, with no gradients.
  The pass side is exactly the left 50% and uses a slightly lighter solid color. Both
  road end caps carry the same two-color split.
- The pass side has brighter static green light particles, each with a small emitted glow.
  No large color wash, rings, branching texture or animation. Resource card artwork stays
  unchanged. Only reward-card surfaces bypass the app's flat-background blanket.
- One continuous central rail is dark ahead and green behind the current colony. Circular
  checkpoint badges show rung numbers with compact troop thresholds underneath. The green
  current-colony marker shares exactly the fill endpoint.
- Progress accents share the home Play button's --hud-go green. Road-local light, pale,
  edge and shadow shades cover the fill, reached stops, marker, claims, pass labels,
  particles, question badges and payout highlights. Area backgrounds, resource artwork
  and the canonical rarity card colors retain their own palettes.
- Progress is calculated in responsive row and divider units, including the extra distance
  between chapters. CSS owns their pixel sizes so the marker does not drift on phone widths.
- Every chapter starts at the same square charcoal block with broad angled reflection
  shapes and a sharp dark bottom ledge, centered on the exact background seam. No rounded
  corners or white top/inner highlight. The reserved divider gap
  belongs half to each adjacent chapter. Prominent COLONY PASS / FREE REWARDS plaques
  sit above it; chapter and area names are plain white. Themed divider images were
  removed at Milan's request; backgrounds still follow area palettes in ui/road-theme.ts.
  Card frames remain upright.
  Resource cards reuse the shop's largest-pack paintings (mycel.1500 / pher.900);
  their small quantity labels retain the ordinary currency mark.
- There is no screen title, toolbar, fixed troop footer, season UI or purchase banner.
  A single floating back button sits above the full-viewport scroller.
- Claim popups confirm the amount actually banked. Claims and closing the popup preserve
  scroll position. The road opens around the next checkpoint. The game font is used
  throughout. Nothing pulses.

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

**THE ANTARIUM'S HERO PUTS THE LEVEL ON THE NAME LINE.** It led a row of four chips, where
it was the widest of them and pushed the cooldown onto a second line — 3 + 1, which reads
as a row that did not fit rather than one that was laid out. It is also not the same KIND
of fact: attack, defence and cooldown are what the colony DOES, and the level is how far
this player has taken it. What is left is TWO chips, attack and defence — the cooldown was
the one that would not fit, and it is also the one this screen is not about: the colony's
own page states it once (`ui/species.ts`), and the cards below the hero already pair attack
with defence, so the hero says the same two things in the same order. They are a GRID of
equal columns, never a flex row: sized to their own content the four came to 242px in a
202px line and wrapped 3 + 1, and equal columns cannot let one chip push another out.

**A COLONY'S PAGE IS ABOUT RESEARCH** (`src/ui/species.ts`, split out of `antarium.ts`).
It was four grey cards of the same shape — a hero box, a "combat profile", the research
list, then the trait, the field notes and the ability in three more boxes — and it was the
last screen in the app still wearing the legacy skeleton. A deliberate deviation now (§10).
- **THE TRAITS ARE THE HERO'S LAST LINE, not a section.** They had a heading, a card and
  a gap either side, for one row summarising what the colony is WEARING — while everything
  in the card above it summarised what the colony IS. A section is for a list and this is
  one row, so it rides in the hero on the card's own surface, under a hairline, still
  showing its five slots and still opening the bench.
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
- **Skins are the third section**, after research. Research is the point of the page and
  leads it; a look costs nothing, affects nothing, and is the one thing on this screen a
  player picks rather than buys.
- **The "Customize" tab is gone.** It sold skins from a cosmetics pool that does not
  exist, so it was a tab that could only ever raise a toast. Skins are found in the hatch
  and worn here instead — never sold.

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
  one back — two people tapping Add should end up friends, not with a request each. A friend
  row carries two marks — the crossed swords that challenge them and the X that drops them
  (§ CHALLENGING A FRIEND) — and removing turns the row into the question rather than asking
  twice on one button.
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
- **Lucky hatch is BUILT** (`ui/hatch.ts`), and with it every drawer entry is a real
  screen — `buildComingSoon` is gone, because a "Coming soon" helper that nothing calls is
  an invitation to ship another dead entry.

**THE LADDER'S HEAD DOES NOT SCROLL** (`src/ui/leaderboard.ts`). The body was one
scroller and the screen opened by scrolling the player's own row into the middle of it,
which took the chips and the banner off the top with it — so a player arrived at a column
of strangers' names with nothing on screen saying what they were a ranking OF. Two boxes
now: a fixed head, and a table that scrolls under it.
- **A ladder exists to say WHERE YOU STAND**, and a highlighted row never said what place
  that was. The banner carries the rank in words, the score, the distance to a prize and
  how much of the week is left.
- **The note under the table scrolls WITH it.** Pinned to the foot of the screen it took a
  fifth of the page for ever and left five rows of a fifty-colony league showing. The HEAD
  is what has to stay put; a disclosure is read once.

**THE WEEKLY LEAGUE — the ladder was seven names and nothing behind them**
(`platform/league.ts`, the two tabs in `ui/leaderboard.ts`). A colony sat in Forager or
Raider because of its size and that was the whole of it: nothing to win, nothing to lose,
and no way for a week of playing to show up anywhere. Four decisions, each of them a rule
rather than a detail:
- **THE SCORE IS WHAT YOU GAINED THIS WEEK, never what you hold.** Ranking by total troops
  ranks by how long somebody has played — a table decided before the week starts, with the
  biggest colony winning it for ever. Gain is the one measure a young colony and an old one
  compete at on the same terms, because a win already pays a SHARE of the colony (§8a): 12%
  of a small one and 3% of a large one are both a good week. And a DEFEAT SHRINKS THE
  COLONY, so the score falls by itself — which is exactly why it is a difference between
  two readings (`seasonScore`) and not a tally somebody has to remember to decrement.
  Nothing in the match settler knows this feature exists.
- **THE LEAGUE IS THE SIZE BAND**, so everybody in one is playing for the same kind of
  number, and it NAMES THE CHAPTERS it spans — a band that does not tie back to the road is
  a second scale to learn. The bands moved out of the screen and into `platform/` because
  what a week is worth is a progression decision, not a screen's private business (§7).
- **FIFTY COLONIES, TOP TEN PAID, and the prize tapers.** The prizes are FLAT ACROSS THE
  LEAGUES on purpose: the currencies buy the same chambers and the same research whatever
  the colony is worth, so a prize scaled by band would be worth most to the players who
  need it least. Sized against what playing pays — first place is about half a week of
  quests and tenth is a rounding error on it — and `economy.test.ts` holds that ceiling, in
  larva as well, or finishing a league would beat playing as the way to reach the hatch.
- **A SEASON IS SETTLED ONCE.** `ProfileStore.rollSeason` closes a week that has ENDED,
  pays it and opens the next; it answers null while one is still running, so the screen has
  something to announce exactly once. Same shape as the challenge rewards and the road
  claims, and the only thing making the prize pay once. It is opened LAZILY rather than in
  the store's constructor — that block is gated on `!playerId`, so seeding a season there
  would give one to brand-new colonies and to nobody else, which is every player who has
  ever opened the game.
- **The finished table is built at the END of the week it settles**, not at the moment
  somebody opens the screen. The rivals reveal their gains across the week, so reading them
  on Monday morning would score a finished season against a field that had barely started.
- **The rivals are seeded on the WEEK AND THE LEAGUE**, so it is a standing table — the
  same names all week rather than a fresh cast per visit — and their gains come in ACROSS
  the week with a pace of their own, which is what makes it something to climb rather than
  a picture taken on Monday.
- **The second tab is a different question, and that is why it is a second tab.** Biggest
  Colonies is every colony by TOTAL troops with the chapter it has reached: no bands, no
  prize, no reset. A week rewards playing now and a career rewards having played; one table
  trying to be both answers neither, which is what the old one did. It tops out at the
  ROAD'S LAST RUNG — past five million every row reads "Chapter 50", so a list that ran to
  twenty million had the one fact it exists to carry blank at the end everybody looks at.
- **EVERY PAID PLACE PRINTS WHAT IT PAYS, on the row.** Stating it only for the row the
  player is standing on says what THIS week is worth and nothing about what climbing is
  worth — and the prize TAPERS, so the difference between one row and the row above it is
  the whole reason to climb. Marks and figures rather than words: three currencies written
  out is a line and a half in a row that is one line tall, and the words survive as the
  row's `title` and `aria-label`.
- **The distance to a prize is counted FORWARDS.** It was `PAID_PLACES - place + 1`, which
  is places-left-inside-the-paid-ten — positive only for somebody already being paid, so
  everybody else was told they were "−27 places to a prize".
- Both tabs still say the other colonies are generated on the device (§ WHAT THE TWO STORES
  REQUIRE). What is NOT invented is the player's own score, their place and the prize.
**A COLLECTION CARD CARRIES THE NAME AND NOTHING UNDER IT.** Two things used to sit there
and both were reported as "a line under the name that I guess is the level":
- the colony's attack and defence as a bare pair — "0.86 · 0.87" — two numbers with no
  label, no scale and nothing to compare them against, which is exactly what an unlabelled
  figure under a name reads as. Both are a tap away as LABELLED chips on the banner above,
  and the colony's own page draws them as bars measured against every other colony. What is
  lost is comparing two colonies without tapping either; the bars are where that belongs.
- a RESEARCH BAR, which drew the same number the "LV 15" badge already carries, unlabelled
  — and only appeared once a colony HAD research, so it showed under two cards out of nine
  and read as a stray rule rather than as a measure of anything. Hiding it at level zero
  (which is what it already did) was the half-fix; the badge was always saying it.

A test holds `.cname` as the card's LAST child, so nothing can creep back under it.

- **A rival is a colony, not a string.** The search, the nameplate and the result card all
  give an opponent a head; this was the one screen that did not. Rivals draw a non-premium
  species seeded off their place in the table — a premium colony on the ladder is a shop
  window, not a player.
- **`antPortrait` in `chrome.ts` owns the picture.** It was written out four times, which
  is four places to fix when the drawing changes (§7). A face drawn at twice the size it is
  shown at and scaled by the stylesheet is what keeps it sharp on a phone.
- **AND IT ANSWERS WITH TWO DIFFERENT TAGS, so a box has to size BOTH.** A colony with a
  painted face comes back as an `<img>` and one without as a `<canvas>` — so every
  `X canvas { width: … }` written for a portrait box sized half of them and let the rest
  render at the file's own size. On the match history that was a face twice the row's
  height, lying over the rows above and below and the text beside it, on every row.
  Nine rules in `skin.css` name both now, and `css-sanity.test.ts` fails on a portrait box
  that names only one — the exceptions are the three surfaces that are ALWAYS drawn (the
  setup stage, the replay stage, the news picture), where an `img` selector would match
  nothing.

**CHALLENGING A FRIEND** (`platform/duels.ts`, `ui/duel.ts`, the row in `ui/friends.ts`).
A ranked match is against whoever the finder seats; a DUEL is against a named person. It is
deliberately the ORDINARY setup flow, entered from the friend rather than from home:

    challenging   the drawer → Friends → crossed swords → formation → colony → the match
    invited       the bar → formation → colony → the match, on their ground

- **IT STARTS ON THE FRIEND, and that is why a screen went away.** There was a third
  floating button on home which opened a PICKER of friends — a whole screen whose only job
  was to ask a question the friends list is already an answer to, and home was carrying a
  button for a feature most players open once a week. The challenge is a control on the
  ROW now (`buildFriends`'s `onChallenge`), beside the one that removes them: the two
  verbs this list exists for, in the one place every friend is already shown.
- **BOTH ARE MARKS, NOT WORDS.** Crossed swords to play them, an X to drop them. A row
  carrying a face, a name, a colony size and two words as well wraps on a 320px phone;
  neither is unlabelled, because `title` and `aria-label` carry the name (§ EVERY CONTROL
  SAYS WHAT IT IS).
- **REMOVING ASKS, AND IT ASKS IN THE ROW.** The question replaces the two marks it is
  about, so nothing else on that row can be pressed by mistake while it is up, and it can
  be answered NO — which the old "press the same button twice" version could not. A confirm
  dialog for one row of a list would be an overlay over the thing it is about.
- **THE BADGE MOVED WITH THE FLOW.** The count of invitations waiting rode that floating
  button; it is on the drawer's Friends entry now, which is the only route to the list. A
  badge nowhere at all is an invitation nobody can be told about.
- **THE INVITATION SITS ON THE SCREEN IT INTERRUPTS.** The bar used to ride the MAP
  PICKER, because the ground was the one choice an invitation had already made. With one
  board what it has settled is the OPPONENT, so it rides the SETUP screen — the one thing
  standing between the player and playing them — and the screen makes its own room for it
  (`#formation.hasinvite`) rather than being covered by it.
- **Accept AND decline.** An invitation you can only accept is a demand.
- **An invitation is answered exactly ONCE.** `answerDuel` returns it and removes it, and a
  null means somebody already did — the same reason a challenge reward returns a boolean:
  accepting is what starts a match, so an invitation that could be taken twice starts two.
- **The first invitation is minted in the store's CONSTRUCTOR**, beside the player code and
  for the same reason: it needs the clock, and neither `defaultProfile` (a constant) nor
  `normalise` (a pure function of its input) may read one. Once per save, so accepting it
  does not summon another — and it exists at all because nothing arrives on its own without
  a server, and an Accept button nobody can reach is a feature nobody can tell is finished.
- **A CHALLENGE IS NOT A SEARCH.** It reuses the matchmaking screen, because the moment —
  between choosing and playing — is the same one; but the reel is the player's own friends
  and the status names the person (`awaiting`). "Searching for an opponent" over somebody
  you have just chosen is the screen describing something that is not happening.
- **Leaving abandons it.** `challenge` takes the screen's abort signal, exactly as the
  opponent search does, so a promise that resolves after the player walked away cannot
  start a match behind whatever they went to.
- **AND ABANDONING THE FLOW ABANDONS IT TOO.** The swords MARK the setup screen as a
  challenge (`duel`), and nothing unmarked it — so backing out to home and pressing PLAY
  played whoever was seated last instead of searching: the ordinary flow silently still
  being the one before it. Both ordinary ways in say which flow they are (`playOrdinary`,
  `leaveSetup`), because the screen is two flows and the way in is the only thing that can
  decide.
- **`waitingFor` is not `agoOf`.** A news post lives for weeks and is dated in days, so
  "Today" is right for one. A challenge lives for minutes, and "Today" says nothing about
  whether the person who sent it is still sitting there.

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
- **The match starts UNDER the parting halves**, not after them, so the colonies grow out
  of their nests through the widening gap and the reveal is one movement.
- **The search begins on `start()`, never in the constructor.** The caller's search closure
  wants the screen (it hands over the abort signal), so a constructor that searched at once
  ran that closure while the caller's binding was still in its temporal dead zone: the
  throw was swallowed and the reel turned for ever with nobody seated.

**WHO IS PLAYING is ON THE GROUND** (`render/plates.ts`). The header counted two armies
and called them "You" and "Enemy" — a scoreboard, not an opponent — and the colony, the
number the whole game is played for (§8a), was never once in front of the player while they
were playing for it. Two words on the ground: the name, and its size.
- **THERE WAS A HEAD AT THE START OF EACH ROW AND IT IS GONE**, asked for directly. It
  drew the colony that side was fielding, wearing its skin — a third thing on a line that
  is already a name and a number, sitting on a painted plaque that is carrying marks of
  its own now (see the seam counter below). What the head said is on the board itself, in
  the colony's colour, for the whole match. `Plate` lost its `species` field with it, and
  `drawPlates` its `looks`.
- **It is drawn, not laid out.** Two DOM strips above and below the board was two more
  pieces of chrome stacked on a screen that already has a header, a turn bar and an action
  row — and the canvas had to be given its own box, because `BoardRenderer` measures the
  canvas's PARENT and would otherwise lay the board straight over them. On the soil there
  is nothing to measure, nothing to swallow a tap, and no band eating the playfield.
- **Each row sits on the side of the board its base is on**, and both are CENTRED on the
  board. They were pushed out to the corner each base stands in — the player's to the left,
  the enemy's to the right — on the argument that a label belongs to the corner it is
  about. On a 9x9 board that reads as two labels flung to opposite ends of a wide screen
  rather than as a pair, and which side is which is already said by the half of the board
  the row is on. Centred on the BOARD, never on the canvas: on a screen wider than the
  playfield a canvas-centred row drifts off its end.
- **It goes under the finale.** Drawn before `drawFlood`, and faded with the outlines, or a
  name left standing would be the one thing the winner's colour did not reach.
- **The scenery is baked around the names too.** A fern or a fallen log grown where a name
  is written reads as clutter over the text, so `rowsOf` measures the rows and `terrain.ts`
  keeps exactly those boxes clear — and only those, or one name would thin the whole ring.
  A dropped prop is DROPPED, never moved: each is placed from its own seeded generator
  (§5), so removing one cannot shift the next.
- **The renderer is handed the figure's formatter, never the progression layer.** `plates`
  and `colonySize` are options; `render/` still imports nothing from `platform/`.
- **THE NAME AND THE FIGURE ARE ONE LINE, so they are ONE COLOUR.** The figure was drawn in
  that side's colony colour on the argument that it belonged to that half of the board — but
  which half it belongs to is already said by the half it sits on and by the head at the
  start of the row, and the colour made the number read as a second thing stuck on the end
  of the name. It is the page's ink like the name now, which is also the only colour that
  stays legible on every region there will ever be (a dark orange or blue number sits on
  whatever the artwork chose to put there).
- **The opponent is generated** (`platform/rival.ts`), because there is no server yet — a
  name from the same pool the Leaderboard draws its rivals from, and a colony near the
  player's own, which is what a ranked ladder would serve them. Keyed by the match seed, so
  it does not change under the player mid-match.
- **AND HOW FAR OUT EACH ROW SITS IS A DIFFERENT NUMBER AT EACH EDGE**, because the
  painted plaque is. One gap for both put the enemy's name half on top of the stone it is
  written above.

**THE FOUR SOCKETS ON THE PLAQUE COUNT THE SEAMS** (`drawSockets`, `seamsHeld` in
`render/plates.ts`). Every region's ground has a stone plaque painted onto each edge of the
board with four empty diamond sockets cut into it. They are the only thing anywhere that
says who is winning the RESOURCES — a seam pays three a turn where a plain stable pays one
(§8), and until now the only way to know was to find all four on the grid and read their
colours. One socket lights cyan, left to right, per seam that side holds, and goes dark the
moment the tile is lost.
- **FOUR IS THE ARTWORK'S NUMBER, not the map's.** The sockets are painted, so the count
  cannot be read off the board at runtime — and a map with three seams would leave one
  that can never come on, while a fifth would light nothing. A test holds `buildMap` to
  exactly `SOCKETS` resource tiles, which is what stops the two drifting.
- **IT IS READ OFF THE BOARD, never tallied.** `seamsHeld` counts owned resource tiles on
  the frame it draws, so losing one puts the light out with no event to subscribe to and
  nothing to keep in step.
- **The geometry is in TILES from the board's own edges**, measured off the ten region
  files and then checked by drawing the pips over the artwork in a browser at a phone's
  size. That frame is the one the picture and the board agree on (§ THE PICTURE CARRIES
  THE GRID) — the picture is scaled until its painted cells are the board's, so a pip
  placed in tiles lands on the painted socket on every screen and in every region. It is
  also why the two edges carry different numbers: the plaques are not painted at quite
  the same distance out, and forcing them symmetric put every pip a couple of pixels off
  its socket at one end.
- **The empty sockets are the GROUND's.** On a painted region they are already cut into
  the stone and only the lit ones are drawn; on the game's own drawn floor there is no
  plaque at all, so the dark ones are drawn too — four pips with nothing behind them read
  as decoration rather than as a counter of four. Same flag as the rocks and the seams
  (`Scene.painted`), and it asks whether the picture has LANDED.
- **It goes under the finale with the names**, for the same reason: the winner's colour
  takes the whole board.

**THE ABILITY CARD HOLDS THE MATCH STILL** (`showSpellCard`, `holdFor`, `.match.casting`).
It slid in, held and slid out and was marked "purely decorative", which was two faults at
once: the turn clock ran down behind three seconds of animation nobody could play through,
and the card is `position: fixed` over the MIDDLE of the board — so a tap aimed at what is
under it landed on a tile the player could not see. Reading what your own ability just did
must not cost the turn and must not take a move you did not mean to make, which is the rule
a tutorial step already follows (§10a).
- **THE CLOCK IS PAUSED, NEVER RESTARTED.** `startTimer` resets the turn to its full
  length, so resuming through it would make casting an ability a way to buy another thirty
  seconds. `runClock(restart)` is the split: `startTimer` is `runClock(true)` and a resume
  is `runClock(false)`.
- **AND THE GUARD IS THE MECHANISM, not a second one.** `holdFor` arms the watchdog FIRST
  and then calls `runClock(false)`, so `casting` is already true and the clock is stopped
  by `runClock`'s own guard rather than by reaching past it to `stopTimer`. Written the
  other way round the guard was unreachable — the mutation that deleted it passed every
  test — and a `startTimer` landing during a hold would have quietly un-paused AND reset.
  One function decides whether the clock may run (§7).
- **THE CSS OWNS THE LENGTH, so `animationend` is what releases the hold.** A duration in
  the TypeScript would be the animation's length written down twice. `CARD_WATCHDOG_MS` is
  not that number: it is far longer than any card, and it exists because a screen left
  inert for ever by an event that never arrived is a far worse fault than the one this
  fixes — the same reasoning as the splash watchdog. jsdom runs no animations at all, so in
  a test the watchdog is always what releases it.
- **A SECOND CAST RESTARTS THE HOLD** rather than stacking one on another, and `castSeq` is
  what makes the first card's listener harmless when it finally fires.
- **A PRESS DOES NOT SKIP IT**, unlike the opening. The card is on screen precisely
  because the player is meant to read it, and a tap that dismissed it would be the
  accidental press this exists to prevent.
- The JS gates REFUSE the action (`acting`, `onPointerDown`); `.match.casting > *` stops the
  press being taken at all, so a button does not light up for something that will not
  happen. DIRECT CHILDREN, because `.match` is `display: contents` and generates no box —
  a rule on the wrapper would be relying on `pointer-events` inheriting through an element
  that is not there.
- **Tunnelling shows no card and is not held.** It is cast from a target tap and spends the
  turn (§4.10), so the turn hands over immediately and there is no clock left to pause.

**BOTH SIDES SEE THE SAME CAST** (`showOpponentCast`, `closeEnemyTurn` in `ui/match.ts`).
The card was raised from `onAbility` — the PLAYER's own button — so an ability the OPPONENT
used simply happened: tiles changed and nothing on screen said what had hit them. Reported
directly, with the reason attached: two players have to be watching the same match from two
chairs, and that is the test to apply to anything on this screen long before there is a
server to make it literal.
- **IT IS READ OFF THE MOVES THE TURN LANDED WITH**, never off the opponent being an AI. A
  remote turn arrives through `playAI` exactly as a searched one does (`ui/opponent.ts` is
  one landing path for both, §9b), so a real opponent's cast raises the same card with no
  second route to keep in step.
- **THE CARD SAYS WHOSE IT IS.** It never had to while it was the player's only; the moment
  the enemy gets one, an unattributed "Venom Rain" over the board reads as something you
  did. `.sc-cast` is the legacy card's own accent line — it had been empty since the day it
  was ported — and `--sc-accent` is the colour it is written in, which is the second half of
  the same answer. The name comes off `plates`, so it is the opponent the reel seated.
- **AND THE TURN DOES NOT COME BACK FROM UNDER IT.** The card plays OVER the board, so it
  overlaps the move rather than following it — but handing the turn to the player while they
  are still reading what just hit them is the fault the hold exists to fix, seen from the
  other chair. `playAI` leaves the hand-over in `afterCard` and `release` runs it; `release`
  then does NOT resume a clock it is about to reset, because `beginTurn` starts a fresh one.
- **TUNNELLING STILL SHOWS NONE, ON EITHER SIDE.** It spends the turn, so the player gets no
  card for it; one here would be the two sides disagreeing in the other direction.
- **AND A TURN THAT ENDED ITSELF IS NOT ENDED TWICE** (`closeEnemyTurn`). The local search
  hands back a board with its move played and the turn still its own, leaving the hand-over
  to the screen — but a REMOTE opponent sends a whole turn as data, `end` included, so the
  board it lands is already the player's move. Running the hand-over on top of that took the
  player's turn away the instant it began, and then handed it back, and so on: a ping-pong
  that is on the right side half the times you happen to look. It was found by writing the
  test with a `RemoteOpponent` rather than the AI, which is the whole argument for doing
  that — and the test samples ACROSS the span rather than at one moment, for the same reason.
- **The three new tests pin the AI's think time** (`Math.random` → 0). It sits on its answer
  for one to four seconds and the card's watchdog is six, so an unpinned think puts the
  release anywhere between 7.7s and 10.7s — and a test that advances past one of those is a
  test that passes on some runs.

**The match clock is the SCREEN's, never the engine's.** Wall time from the moment the
opening hands over to the moment the match is decided, latched there so a result card
sitting on screen does not keep counting, and reported to the app through `onExit`. It
cannot live in the engine: the engine is pure and seeded so the same moves replay
identically (§4.1), and a real clock is the one input that never does. Nothing about the
game reads it — it is a fact ABOUT the match. The opening is not counted; it plays the same
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
  are 180°-symmetric and tested to be — so this is the move order, not the ground. Which is
  why **it is a coin now** (§4.11): the player used to have it in every match ever played.
  Whether to compensate the second player beyond that is still an open design question.
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
  economy — every track on all eight colonies — was covered three times over inside three
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
- **The granary is measured at its MAXIMUM, against an EVEN record — and the maximum is
  the CLOCK, not the lid.** A player who empties the store every time it fills forages
  twenty-four hours a day whatever the lid says, so that is the ceiling, and what it has to
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
- The board: Corridor 9×9, the Hive waking on turn 14, a match expected to run about 45
  turns. The turn figure is an expectation, not a limit — nothing happens when it passes
  (§4.8). There were two others and they are gone (§ ONE BOARD).

**8d. WHERE A CURRENCY GOES WHEN THERE IS NOTHING LEFT TO BUY** (`platform/exchange.ts`).
Every sink in §8c is FINITE, and §8c measured whether they were the right SIZE without ever
asking what happens after them. Measured on the same tuned player: mycelium's sink (21,585
— chambers 3,745, colonies 1,840, the granary 16,000) is covered around **day 250** of a
440-day road, and pheromone's (14,400, the whole research tree) around **day 400**. From
those days each currency is a number that goes up on the top bar and buys nothing, for
ever — which is a reward that has stopped being one, and is exactly how it was reported.
- **THE FIX CANNOT BE MORE THINGS THAT CHANGE A MATCH.** Every match-affecting number here
  is capped on purpose, because progression must never become mandatory and the AI gets
  none of it (§4.8). Uncapping a chamber or a research track to make a sink would buy an
  endless economy with the one rule the game is built on.
- So the sinks point at the COLLECTION, the only thing here that does not end — and each
  currency keeps the job it already had. **Mycelium is BREADTH** (more colonies, more
  chambers, more room), so its endless sink is more ROLLS: `buyLarva()`, at
  `LARVA_MYCEL`. **Pheromone is DEPTH** (research makes one colony better), so its endless
  sink is making what you hold better: `fuse()`, three spares of one tier into one of the
  next.
- **PLAYING STAYS THE MAIN FAUCET.** A win pays a larva outright — 1.25 a day at two and a
  half matches on an even record — and the mycelium surplus (about 64 a day) adds a
  quarter of one at 250 each. At 150 it added nearly half again, which starts to read as
  the way to GET larva rather than as somewhere for the leftovers to go. It also has to
  stay clear of the shop, which sells three for a euro: a euro is about five days of this
  surplus. A test holds both ends.
- **THREE FUEL, NOT TWO.** The hatch's odds step by roughly 2.4× between rungs, so a
  two-for-one fuse would be BETTER than rolling — a player would stop wanting the hatch and
  start wanting commons, which is the opposite of a chase. Three is deliberately worse than
  the natural rate: fusing is what you do with what the hatch gave you anyway.
- **A WORN TRAIT IS NEVER FUEL.** `spares()` is bag-minus-benches, and it is what both
  `canFuse` and `fuse` ask. Burning one off a colony would change a loadout the player
  chose, silently, from a screen that is not the bench.
- **And it drains the bag's own end-state.** The hatch pays a Common six times in ten for
  ever, so a long-running collection is mostly duplicates pressing against `BAG_MAX` with
  nothing to do but be thrown away. Now they are the fuel.
- **The prices rise faster than the tiers do.** Against the ~42 pheromone a day left over:
  an Uncommon is a day and a half, a Rare four days, an Exceptional ten and a Mythic
  twenty-four — and that is the LAST step only. A Mythic fused from the bottom is 81
  commons and 5,170 pheromone, about four months of surplus. The low rungs are something to
  do this week; the top one is something to work toward.
- **Spending and producing are ONE call**, the same rule `hatch()` follows: a trade that
  spent and did not produce takes something for nothing, and one that produced and did not
  spend is free traits for ever.
- The fuse panel sits at the HEAD of the inventory, not its foot — a control under a list
  forty tiles long is a control nobody scrolls to, and this is an action on that list. A
  row appears only once its fuel is held; four rows that mostly say no is a panel that says
  nothing. It uses the app's own gold buy button, so a price reads the same here as on a
  chamber.

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
  (`COLONY_TAPER`, 0.78) makes the growth polynomial instead: a win pays 20% of a young
  colony, 7% of a thousand, 2.5% of a hundred thousand and 1% of five million. That is the
  one number to turn if the late road feels wrong, and it moves the whole curve rather
  than one end of it.
  - **Those four figures are HELD BY A TEST** (`colony.test.ts`), because they were wrong
    here for as long as the taper existed: this paragraph said 0.87 and 13 / 9 / 5 / 3
    while the code ran 0.78 and paid 20 / 7 / 2.5 / 1, and §8 four hundred lines up printed
    the right ones — two passages of this file disagreeing about the number the whole game
    is played for. The shape test that already existed passes either way; it only asks that
    the share FALLS. A reader cannot tell a measured number from a guessed one, so the
    curve is now pinned to the sentence that publishes it.
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
- **The road grows with it.** Every rung is a fixed multiple of the last, and two hundred
  and fifty of them run from a hundred troops to five million — the top came down from two
  trillion with the taper, because a road is only worth having where a career actually
  goes. A rung is named by its INDEX, not its size: "is this a multiple of five hundred?"
  only answers on an even ladder, and a claim key has to outlive a retune of the table.
  - **AND THE ROUNDING IS THREE SIGNIFICANT FIGURES EVERYWHERE**, which it was not under
    a thousand — there it rounded to the nearest TEN, two figures at a hundred. With two
    rungs to a chapter the step there was 15% and it never showed; at five checkpoints a
    chapter it is 4.4%, four troops at the first rung, and rungs one and two both landed
    on 100. Two checkpoints asking for the same colony is one nobody can ever be short
    of, and `stopReached(100)` answered 2.
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
  foraging add up to one victory at the same colony size, and the figure is
  `winnings(colony) / hours`. A flat "+40 an hour" is generous at forty troops and
  invisible at five million, and would have to be retuned every time the win curve moved;
  this way the taper in §8a is inherited for free. A test holds it at five sizes across all
  seven levels.
  **But that is OUR reference, and it never reaches the screen.** The player is told troops
  per hour and what a full store carries in. Pricing one thing the game gives them in
  another is not an explanation, and a test greps the whole room for the word.
- **A LEVEL BUYS TWO NUMBERS, AND MOSTLY IT BUYS THE LID.** The rate ladder has almost no
  room in it: nobody forages more than twenty-four hours a day, so a level worth one win
  per 24h is already level with playing and there is nothing above it. Squeezed into that
  span, seven levels were 8 hours apart out of 96 — a 9% step, which at the colony sizes it
  is bought at vanished into the one decimal the screen prints. It was reported exactly
  that way: "it produces 0.6 and on chapter 12 I can upgrade to again 0.6". The LID has all
  the room the rate does not, and it is what the once-a-day player actually collects. So
  the rate comes down 56 → 31 hours per win (0.9 → 1.6 troops an hour at chapter 10) and
  the store goes 6h → 24h (5 → 37 troops a visit at the same chapter). Two tests hold it:
  every level's full store is a quarter bigger than the one below, and **no two levels may
  print the same rate** at any colony size — the one decimal place is the whole bug.
- **The store still has a lid**, per level (`GranaryLevel.lid`, 6–24h). Without one a
  fortnight away pays a fortnight's foraging, which makes not playing the fastest way up
  the ladder. What it cannot do is bound the diligent player — only the clock does that —
  which is why the rate is tuned so a 24-hour day tops out at 97% of what playing yields.
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

1. Engine port + tests ✅ (all eight abilities implemented)
2. Canvas renderer driven by engine events ✅
3. Meta UI ✅ — every legacy screen is ported, including the **lucky hatch**, plus a
   profile card the legacy build could not reach. Built: home with its top bar and five-tab
   bottom nav, the three setup steps, Anthill, Antarium + per-species page, Colony/quests
   with the XP spine, Trophy Road, Challenges, daily challenge, Leaderboard, Settings, the
   slide-in menu, How to play, and the result card.
   The shop is built and sells through `platform/purchases.ts`: a `PurchaseGateway`
   interface with a `DemoGateway` that grants without charging. Swapping in RevenueCat is
   one new implementation of that interface — the screen and the grant code do not change.
   It sells only what the game can spend: mycelium, pheromone, larva, the Colony Pass and
   the premium colony. Skins are FOUND rather than sold — the hatch is their only source,
   the same rule traits follow.
4. Capacitor wrap → Android build ✅ — `capacitor.config.ts`, `platform/native.ts` and
   `npm run android`. `android/` is generated and gitignored; `npx cap add android`
   recreates it. The launcher icon comes from `public/icon-512.png` (Android Studio, or
   `capacitor-assets`); it is not committed because the platform directory is not.
5. Before release, some things are still owed and none of them is code: `SUPPORT_EMAIL` in
   `platform/support.ts` is a placeholder and must be a real address (the privacy page
   carries the same one, held by a test), and the Android launcher icon has to be set once
   in Android Studio from `public/icon-512.png` — `android/` is generated and gitignored,
   so it cannot be committed. The privacy URL for both listings is
   https://ilebaca.github.io/zombie-ants/privacy.html — and the Play Data safety form and
   Apple's privacy labels both need answering with "nothing collected, nothing shared",
   plus an IARC content rating. See "WHAT THE TWO STORES REQUIRE" for what the code side
   of that already holds.
6. RevenueCat in-app purchases — implement `PurchaseGateway` against it and hand it to
   `App`; nothing else moves. Needs, from Milan: a Play Console account, the products
   created there with these ids (`platform/purchases.ts`), and a RevenueCat key.
7. Play Console release

Later, server-backed: async PvP, ranked ladder, seasons. Determinism makes server-side
verification nearly free — keep it that way. Replays are already built and local (see
"A match is remembered" below); a server only has to store the records.

Also still local: **the save lives on one device**. `platform/backup.ts` is the honest
stand-in — the profile as one string a player can carry — and an account replaces it.

**9b. WHAT IS ALREADY BUILT FOR MULTIPLAYER, AND WHAT IS NOT.** Everything here works and
is tested with no server anywhere; the point of building it early is that the SHAPES are
decided by the game rather than by whatever backend turns up.
- **`engine/protocol.ts` is the wire format.** `Move` is one action as plain data — five
  verbs, which is the whole game. A match is `MatchSetup` (map, species, shapes, mods and
  the SEED) plus a list of moves; `replayMatch` rebuilds the board from it. No board ever
  needs to cross the wire, and a server can check a result it never watched.
- **`applyMove` REFUSES, and that is why it exists.** Every action function was written for
  a screen that only offers legal taps, so none of them ask whose turn it is — and
  `moveOrAttack` reads the attacker off the tile it is handed, so passed an enemy tile it
  marches the enemy's army. A client could play its opponent's turn. The turn, the
  ownership and the target are checked here against the same functions the screen uses to
  decide what to offer, so there is one answer to "is this legal" rather than two that can
  drift.
- **An action that produced nothing did not happen.** The engine says no with an empty
  event list (§5); reporting that as a success lets a client burn its opponent's clock with
  moves the board never felt.
- **`ui/opponent.ts` is where the enemy's turn comes from.** The match screen used to call
  the local search directly, which left no way in for a turn from another player.
  `AiOpponent` and `RemoteOpponent` both answer with the BOARD THEY LEFT BEHIND plus the
  events — the AI's own shape — so a remote turn lands through exactly the same code that
  lands a searched one. One landing path, so a remote match cannot drift from a local one.
  A refused move STOPS the turn: replaying the rest onto a board that has already diverged
  puts the two players on different boards, which is worse than a stall.
- **`platform/results.ts` is who decides who won.** Today the client does, which is fine
  against a bot and not fine the moment two people play for a ladder place — the colony and
  the currencies live in `localStorage`. `verify` replays the record and compares; it is
  the server's job, written here because it is pure and belongs to the game. It refuses a
  record containing an impossible move even when the winner matches, because a record that
  can carry arbitrary extra moves can carry anything.
- **A challenge ends in an OUTCOME, not a person** (`DuelOutcome`). Declined, timed out,
  offline and abandoned are ordinary answers a real opponent gives; an exception is for
  something going wrong. `subscribe` is the receiving half — offline it registers a
  listener and never calls it, which is honest, and it is there because a badge that can
  only change when the local code writes it is not a notification.
- **STILL MISSING, and it needs the server:** the transport itself, accounts and identity,
  and a clock — an async match has to survive both players closing the app, which means
  turn deadlines and a way to resume. `platform/duels.ts` carries the endpoint list a
  backend can be built against.

**TRAITS — THE COLLECTABLE HALF OF A COLONY** (`platform/traits.ts`, `ui/traits.ts`).
Chambers and research are BOUGHT: a straight line from mycelium to a number, the same for
every player who saves up. A trait is FOUND. It has a tier, there are fifty-three of them,
two players never hold the same set, and what you do with the ones you have is a choice
rather than a purchase.
- **Three things, all percentages.** Attack, defence, and a CHANCE that the ability comes
  back a turn sooner. Five tiers — common (grey), uncommon (green), rare (blue),
  exceptional (purple), mythic (red) — and the tier is the whole visual language: it is
  the tile's border and its mark, carried on a `--tier` custom property the screen sets
  from the table, so one place decides what a mythic LOOKS like and it is the same place
  that decides what a mythic is WORTH.
- **Five slots per colony and five for the anthill**, the same split the rest of the
  progression layer already has: research is per-colony, chambers are account-wide. A
  species trait fits exactly one colony's bench and a universal one only the anthill, so
  "worn somewhere else" is impossible by construction.
- **COLONY PASS OPENS TRAITS AND INVENTORY EARLY.** traitsOpen() includes pass ownership;
  hatchOpen() stays chapter 10 regardless of pass. The pass opens exactly the first trait
  slot on every bench before chapter 10. Later slots remain at chapters 20/30/40/50.
  The shared slotsOpen(chapter, pass) is used by equipping and pure wornItems/modsFrom,
  so the early slot actually contributes to matches and survives reloads or colony losses.
  Both hatch() and hatchMany() refuse before hatchOpen(), without rolling or spending.
  This is derived from the existing pass flag, including grants, purchases and restores;
  existing owners need no migration or second purchase.
- **THE SLOTS OPEN ONE EVERY TEN CHAPTERS** (`SLOT_STEP`, `slotsOpen`), on BOTH benches.
  Five handed over at once is a bench a player fills in an afternoon and never looks at
  again — the choice a trait is supposed to be only exists while there are more traits than
  room. Opened one at a time it is a decision every ten chapters instead: what comes off to
  make room, and what the fifth one is finally for. The first opens where traits do
  (chapter 10, or earlier with the pass) and the last at 50, so the bench is still growing on
  the final rung. `slotChapter` is derived from the step, so retuning the pace is one
  number and two lists cannot disagree.
  - **The same ladder on both benches.** The anthill's five and a colony's five open at the
    same chapters, because they are the same feature seen twice — a rule that differed per
    bench would be two rules to learn for one thing.
  - **A locked slot is DRAWN and NAMES ITS CHAPTER.** Five squares with two live is the
    shape of the bench a player is working toward; two squares is a bench that looks
    finished. And a number is something to play toward where a padlock only says you
    cannot — the same rule the granary's levels follow. The count reads against what is
    OPEN too: "0 / 5" on a bench with one slot is four empty ones nobody can see.
  - **A trait in a slot that has CLOSED is left where it is and stops counting.** A colony
    SHRINKS on a defeat, so a player can drop back under a boundary; clearing the slot
    would mean a loss silently costing a loadout they earned. `wornItems` counts the open
    slots only, and the trait comes back the moment they climb again.
  - **It gates the SLOT, never the hatch.** Every tier is rollable from the moment the
    hatch opens — what a player is short of is room, not rarity.
- **THE COOLDOWN CHANCES DO NOT SUM, and that is the one piece of arithmetic here worth
  arguing about.** Two 22% chances are not 44%, they are two draws — 1 − 0.78², or 39%.
  Summing them would let five mythics GUARANTEE the boon, and a certainty is not what the
  trait says it gives; it would also make the fifth copy worth as much as the first, when
  the whole shape of a stacked chance is that it is worth less. Attack and defence DO sum,
  because that is what a player expects of a percentage.
- **The roll is made in the ENGINE, off the seeded stream, ONCE per match** (`state.boon`,
  set in `createGame`). Not per cast — a chance re-drawn every time would bring the same
  ability back at a different speed each turn, which reads as a bug rather than as luck,
  and the AI's search would see a different answer from the board it is searching. Not in
  the platform either, or a real random number enters a game that has to replay identically
  from its seed (§4.1). It is snapshot/restored with the board like everything else.
  - **The stream is advanced whether or not there is a chance to roll.** A colony with no
    cooldown traits that SKIPPED its draw would shift every later scatter in the match, so
    two players with different traits would see different ability scatter from one seed.
- **What crosses into the engine is three FINISHED percentages** (`atkPct`, `defPct`,
  `boonPct`). A chamber and a research track are LEVELS and the engine owns the curve that
  turns a level into a number, because that curve is a rule of the game. A tier is not a
  level: what it is worth is a progression decision that will be retuned, so it belongs
  beside the prices. `TRAIT_PCT_CAP` in `engine/config.ts` is the floor under that — the
  engine refusing to let any table, or any hand-edited save, double a colony's punch.
- **Combat is still pure arithmetic.** A trait changes the numbers that go INTO `fight()`,
  never how it resolves. Same attack against same defence is still the same answer.
- **The AI still gets none of it.** `neutralMods()` spreads `NEUTRAL_MODS` rather than
  writing the fields out, or a field added to the engine is silently zero here and reads
  as a deliberate neutral value.
- **A SLOT HOLDS A UID, NEVER AN INDEX.** The bag is sorted, filtered and added to; an
  index would re-point every equipped slot at a different item the first time one was
  removed — a loadout the player did not choose, weeks later, with nothing to trace it to.
  `traitSeq` mints them and only ever goes up, past items already thrown away, and
  `normalise` floors it past the highest uid it can see: two items with one uid is one item
  the player can never take off.
- **The bag and the benches are rebuilt TOGETHER**, because they refer to each other. An
  item whose trait id is gone from the table is dropped; a slot pointing at a uid the bag
  does not hold is emptied; a slot wearing something that does not fit that bench is
  emptied; and one uid cannot occupy two slots. That is what lets every screen assume a
  filled slot always resolves to an item.
- **ONE SQUARE, IN BOTH HALVES.** A worn trait and a spare one are the same object, so a
  filled slot and an inventory tile are the same tile: the trait's own mark in its tier's
  colour, and under it the kind — sword, shield or clock — with what it is worth. Five
  across, which is what makes a collection something you take in at a glance rather than
  scroll through, and five across on a 320px phone is why there is no room for a name on
  it. The name survives as `title` and `aria-label`.
- **The CAP is printed beside every total, always.** A ceiling a player only discovers by
  watching a number stop moving reads as a bug in the game rather than as a rule of it.
- **The slots and the inventory share ONE screen** so slotting something and watching the
  total move is one gesture in one place. Tapping an empty slot ARMS it, so replacing one
  particular trait is two taps rather than a remove and an add; tapping it again disarms,
  or an accidental tap leaves the screen with no way out but Back.
- **THE INVENTORY IS ITS OWN SCREEN, in the drawer** (`buildInventory`). A bench shows
  only what fits THAT bench, so without it there is nowhere in the app that shows a
  collection AS a collection — a player with forty traits across ten benches could never
  see forty of anything. Grouped by bench rather than by tier, because "where does this
  go" is the question a collection raises and "what colour is it" is not; every group is a
  DOOR into the bench it names, and a worn trait is MARKED rather than hidden, or the
  number would change every time a loadout did.
- **The row that opens it carries PIPS, not a count.** "3 / 5" says how many and nothing
  about WHICH, and which is what a player checks before a match. Locked, it names the
  CHAPTER and drops its chevron — an arrow into a door that does not open is the row
  promising something the tap will not deliver.
- **THE LUCKY HATCH IS THE ONLY SOURCE, and that is the design.** A match pays mycelium
  and a colony; the hatch pays the one thing there is no other way to get, which is what
  gives it a reason to exist beyond handing out currency the player could have earned by
  playing.
- **Chapter 10 gates both.** A trait is a CHOICE between things you have found, and a
  player handed one in their first hour has no collection to choose from and no idea what
  +2% defence is worth.
- **`Species.trait` is a different thing and the species page now says so.** That field is
  lore ("Pheromone mask — soldier counts hidden until contact") and it was labelled
  "Trait"; with equippable Traits on the same page, one word for two things is the screen
  contradicting itself. It reads "Signature" now.

**EIGHT COLONIES — THE WEAVER ANT IS GONE, AND SO IS SPREAD.** It was removed outright
rather than hidden, which is the same decision the three maps got (§ ONE BOARD): a colony
left in the type but out of the game is a thing every screen has to remember to skip. What
went with it: the species row, `Spread` and `castSpread`, `onEnemyHalf` (Spread was its
only caller, and the AI's move generator its only other), the `silk` skin style and its
two drawings, the Weaver's five traits, its two skins, its palette, its price and its
field notes.
- **A SAVE SURVIVES IT WITHOUT A MIGRATION, because `normalise` was already the trust
  boundary** (§12). A profile that owned the Weaver, wore one of its skins or carried one
  of its traits comes back playable: the bag and the benches are rebuilt together and an
  item whose trait id is gone from the table is dropped, a look naming a colony that does
  not exist falls back to basic, and a save stripped of every species is repopulated. That
  is exactly what those rules were written for, and this is the first time one of them has
  had to do it for real.
- **THE CHALLENGE IT FIELDED MOVED RATHER THAN GOING WITH IT.** "Hold the Line" was played
  as the Weaver; it is the Carpenter now — the fortress, whose Fortify braces the whole
  colony, which is a better read of that objective than the expansionist ever was. The ID
  is unchanged, so a player who has beaten it keeps it beaten (§ CHALLENGES ARE A LADDER:
  a rung is remembered by id, never by index).
- **IT MOVED A BALANCE NUMBER, and that is the part that was nearly missed.** Pheromone
  buys exactly ONE thing, so its whole sink is the research tree — and taking a colony out
  took an eighth of that away while the income feeding it did not move. Supply went to
  **1.40x** of the sink, outside the 0.7–1.3 band §8c holds it to. `researchCost`'s STEP
  went 35 → 40 (the base stays 40, so a first level costs what it always did and it is
  DEPTH that got dearer), which puts it back at 1.28x. `economy.test.ts` is the only
  reason this was seen at all — nothing else in the suite would have blinked.
- **THE COUNT CAME OUT OF THE COPY.** The manual's section was headed "Nine colonies" and
  the tour said "Nine real ant species", both of which were lying the moment this landed.
  A number written into a sentence is a second table to keep in step (the rule the manual
  already follows for every figure it reads out of `config.ts`), so neither counts now.
- **LEGACY AND THE GDD STILL HAVE IT.** `legacy/zombie-ants-pro.html` is the original
  build kept as the behavioural and visual source of truth (§1) and `game.css` is a
  verbatim copy of its `<style>` block with a test comparing them line by line — editing
  it would be rewriting the reference this port is checked against. The GDD's prose was
  corrected where it counts the colonies; its record of what the legacy build shipped was
  not.

**NINETY-EIGHT AVATARS — THE ONE THING COLLECTED THAT IS NOT ABOUT A COLONY**
(`src/ui/avatars/`, `ui/avatars.ts`, `platform/avatars.ts`, `ui/avatarpicker.ts`). A skin
says what the Fire Ant looks like; an avatar is the face beside the player's OWN name — on
the top bar, on the profile, and one day across the board from somebody else. So it
belongs to the save rather than to a species, and it is never worn by an opponent.
- **THE FOLDER IS THE TABLE, the seventh time**: `src/ui/avatars/av43.webp` IS avatar
  `av43`, resolved by a build-time glob. A file whose name is not in the catalogue is
  IGNORED and an id with no file keeps the drawn head — the same null fallback the chrome
  marks and the colony cards follow, which is what let the table and the art land apart.
- **THE ART IS IN `ui/` AND THE TABLE IS IN `platform/`**, the split every collectable
  here already has. Which avatar is free, which chapter pays which and how rare one is are
  PROGRESSION decisions that will be retuned; where the picture lives is not. `platform/`
  holds ids and never a url, so it never has to know the folder exists.
- **THEY ARRIVE THREE WAYS, and the three lists are the whole of the design.** TEN are
  there from the first launch (`FREE_AVATARS`) — deliberately the PLAIN ones, ordinary
  workers in a range of colours, nothing with a costume, so none of them reads as
  something that was earned; a picker with one entry is not a choice. FIFTY are on the
  COLONY ROAD, one per chapter (`roadAvatar`), asked for in those words. THE REST —
  thirty-eight — are the hatch's lowest rung, and `HATCH_AVATARS` is DERIVED from the
  other two: a third hand-kept list is a third chance for an id to be in two places or in
  none, and a test gives every avatar exactly one way in.
- **THE ORDER IN `ROAD_AVATARS` IS THE ONLY THING THAT DECIDES WHICH CHAPTER PAYS WHICH**,
  and it climbs — small charm early, the showpieces in the last ten. "The best ones" is a
  judgement about pictures that only a person looking at them can make, so moving an id
  between the lists, or along the road, is an edit to that one file and to nothing else.
- **THE AVATAR IS THE BOTTOM RUNG, WHICH IS THE SKIN RULE STOOD ON ITS HEAD.** A skin is
  the top two rungs, so a roll there pays a skin while one is locked (§ THE LUCKY HATCH);
  an avatar is the LOWEST rung, so a common roll pays an avatar while one is locked.
  Neither carries a chance of its own, which is the only way the odds printed on the
  screen can be the odds the game uses. `AVATAR_TIER` is `TIER_IDS[0]`, derived rather
  than typed, so a retune of the ladder cannot leave it pointing at the wrong end.
  It falls back to a common TRAIT when the collection is finished, exactly as `rollSkin`
  does at the other end — the last avatar found is never the hatch getting worse.
- **THE ROAD PAYS IT AT ONE CHECKPOINT IN FIVE, NOT AS A SIXTH THING** (`AVATAR_RUNG`, 3).
  The chapter's PURSE is unchanged and is split between the four checkpoints that still
  pay currency, so the whole road still pays exactly what it paid before — to the troop,
  which `economy.test.ts` would otherwise have caught. The closer takes what is LEFT
  rather than an eighth of its own, so a chapter pays its purse however the shares round.
- **BOTH TRACKS RESERVE THAT RUNG FOR THE SAME AVATAR.** Their currency purses
  remain split across the other four stops. The road now draws the tracks separately;
  this existing payout table is preserved until rewards are deliberately retuned.
  Claiming both keys does not duplicate an avatar in the collection.

- **THE SAVE HOLDS A NULLABLE CHOICE AND THE ACCESSOR IS NEVER NULL**, which is the
  `lookFor` shape: `profile.avatar` is null for "has not chosen" and `store.face` answers
  `DEFAULT_AVATAR` — a real painting, the plainest of the free ten. The drawn worker is
  left as what shows when a FILE is missing, which is the folder's own fallback: it reads
  fine at thirty pixels and like a placeholder at ninety-six.
- **A FREE ONE IS NEVER STORED AS FOUND**, the rule a basic look already follows. It is
  not something that happened to this player, and storing it would make "how many have I
  collected" start at ten for a colony that has collected nothing. `normalise` owns that
  rule and the store methods do NOT restate it — `update()` re-normalises every write, so
  a guard in `findAvatar` is unreachable code dressed as a rule (the mutation that deleted
  it passed every test, which is how it was found). What `findAvatar` DOES guard is the
  id being in the table at all, because that one is observable: its null is what stops the
  hatch raising a prize card for a face that was never stored.
- **`avatarFace` ANSWERS WITH TWO DIFFERENT TAGS**, an `<img>` where the file exists and a
  `<canvas>` where it does not, so every box that sizes one must size BOTH — the trap the
  match history and the chrome marks are already on record for. And it sets the canvas's
  width and height as ATTRIBUTES, never inline styles: an inline style outranks the sheet.
- **THE PICKER'S WHOLE STYLESHEET BLOCK WENT MISSING ONCE, AND THE SUITE STAYED GREEN.**
  It was dropped resolving a `skin.css` merge conflict — main had been reworked directly
  and the conflicted hunk was taken wholesale — and **1,591 tests passed**. What the
  player got was ninety-eight full-colour squares at the file's own size, no rounding, no
  gaps, and locked faces indistinguishable from owned ones; reported from a phone, which
  was the only place it was visible. jsdom has no layout, the markup never changed, and
  `buildAvatarPicker` went on producing exactly the right elements. **A stylesheet that is
  simply ABSENT is the one regression nothing else in this suite can see**, which is why
  `css-sanity` now holds the picker's SHAPE — five across, a rounded square tile, a locked
  face greyed AND darkened, the worn one the only coloured edge, both tags sized.
- **THE FACE IS THE SAME SHAPE EVERYWHERE IT IS DRAWN** (`--av-r`, 18%), asked for
  directly. It was a DISC in the top bar, on the profile, in that screen's avatar row and
  on the picker's hero, and a rounded SQUARE only in the picker's grid — so the thing a
  player picks as a tile then appears as a circle in all four places they actually see
  it. A PERCENTAGE, never a length: the face is drawn at 26, 30, 46, 76 and 96 pixels,
  and one radius in px is nearly a circle on the smallest and barely a corner on the
  largest, which is the opposite of what was asked for. 18% is the grid tile's own
  proportion (12 of 65), so the tiles did not move and everything else came to them.
  The top bar's disc was the DESIGN's (§ THE HOME SCREEN IS DRAWN TO A DESIGN) — a
  flagged deviation, kept. The ROAD's checkpoint stays a circle, because every reward on
  that path is one and a square there would be the single odd shape on the road.
- **AND EVERY TILE IS FRAMED, not only the worn one.** The art is ninety-eight different
  full-bleed squares, so with no edge the grid reads as one sheet of colour with no seams.
  The worn tile changes that edge's COLOUR rather than adding one, or it would be the only
  tile a different size from the other ninety-seven.
- **THE LEGACY SHEET OWNS `.avatar`, AND IT IS A 40px DISC.** `game.css` line 214 is
  `.avatar { width: 40px; height: 40px; border-radius: 50% }`, so that string is STYLING
  rather than a label (§10) — and borrowing it as a modifier collapsed the ten-hatch
  card's avatar rows to a 40px circle with both lines of text at ZERO width. The two boxes
  that survived it (`.hatchprize`, `.rd-prize`) only did so because `skin.css` sets their
  own size later, which is luck. The modifier is `.avprize` now, and a test walks the
  picker, the road and BOTH hatch cards asserting nothing borrows `.avatar` — the first
  version of that test walked only the first two and the mutation sailed through it.

**AND EVERY FACE HAS A NAME** (`AVATAR_NAMES` in `platform/avatars.ts`). Asked for
directly, with the picker's hero in mind: "instead of the road name it has to be the name
of the icon — look at every icon and give it a name based on what's on it, make some fun
names, not classic."
- **THEY ARE READ OFF THE PICTURES, one at a time**, which makes them the second thing in
  that file that cannot be derived from anything — the first being the ORDER of
  `ROAD_AVATARS`. A bedsheet ghost, a snail with a moon on its shell, an ant that has
  been in amber since the Cretaceous: the name says what you are looking at and has a bit
  of fun doing it, because ninety-eight entries of "Red Ant 14" is a spreadsheet rather
  than a collection. Renaming one is an edit to that table and to nothing else.
- **THE TABLE IS IN `platform/` with the other three lists**, because that file is the one
  catalogue of what an avatar IS and it still holds no url. A second table in `ui/` would
  be a second place to keep in step the day an id moves.
- **A MISSING ENTRY FALLS BACK TO THE ID**, never to nothing: a hero with a blank line
  under it reads as a screen that failed where `av43` reads as a face whose name has not
  been written. A test holds that all ninety-eight have one and that no two share one —
  two faces with one name is a collection a player cannot talk about.
**AND A LOCKED FACE SAYS HOW IT IS GOT, ON A TAP** (`route`, `showHint`, `hintSide` in
`ui/avatarpicker.ts`; `.av-hint` in `skin.css`). Asked for directly: "if a player taps on
an icon that he doesn't have it should pop up a message above it that says how can he get
that icon."
- **THE SENTENCE WAS ALREADY THERE AND NOWHERE A FINGER COULD REACH.** Every tile has
  carried its source in `title`/`aria-label` since the screen was built — and a phone has
  no hover, so on the one device this game is played on, the locked nine-tenths of this
  screen said nothing at all.
- **SO A LOCKED TILE IS NOT DISABLED ANY MORE, which reverses what stood here.** It was,
  under "a locked tile is DISABLED rather than refusing on tap with a toast — one
  mechanism, and a visible one". That argument still holds against a TOAST; it does not
  survive the tile having something to say, and a disabled button dispatches no click at
  all, so the tap had nowhere to go. What still has to be true is that pressing one does
  not WEAR it, and a test holds exactly that.
- **ONE DELEGATED HANDLER, because three things share one press** — wearing a face,
  raising a bubble, and putting one away. Split between a per-tile `onclick` and a
  listener on the page they fight over the same click: the tile's raises the bubble and
  the page's, firing later up the same path, takes it straight back down.
- **THE OPEN BUBBLE IS THE STATE**, found by querying the grid. A field on the screen
  would have to be cleared on every render — the grid is rebuilt whole when a face is
  worn — and a stale node reference is the fault the tour's "look the target up on every
  measure" rule exists for. A second tap on the same face puts it away, because a bubble
  dismissible only by tapping something else is one to be stuck with.
- **AND WEARING ONE PUTS IT AWAY BY REBUILDING, not by a second `remove()`.** That line
  was there and the mutation deleting it passed every test — `render()` throws the grid
  out and the bubble with it. Unreachable code dressed as a rule, the ability card's clock
  guard again.
- **IT IS PLACED BY MEASUREMENT, and that is a deliberate exception** to "laid out, never
  measured". The laid-out answer does not work: `.av-t` carries `overflow: hidden` to clip
  its picture to the rounded corner, so a bubble inside one is cut off at the tile's own
  edge — the same clip the top bar's tap targets are on record for. Positioned against the
  GRID, `offsetLeft`/`offsetTop` give the geometry with no column arithmetic in the
  TypeScript and nothing for the stylesheet's `repeat(5, 1fr)` to drift against. A
  measured position goes stale on a resize, which is fine here and nowhere else: the
  bubble lives for one tap.
  - **IT IS CLAMPED INTO THE GRID**, or a bubble centred on the first or last column hangs
    past the screen — and the screen is the scroller, so that is a clipped sentence and a
    sideways scrollbar. Measured at 390 wide: 0.0px inside the left edge on column one and
    0.3px inside the right on column five. The TAIL is what keeps it pointing at the right
    tile once the box has been pushed back in, and it lands on the tile's centre to within
    half a pixel.
  - **AND IT FLIPS UNDER THE TILE ON THE FIRST ROW** (`hintSide`). There is nothing above
    that row but the "Collected 23 of 98" heading, and the bubble landed across it with
    half the count behind it — a sentence written over another sentence is worse than one
    on the other side of what it points at. The tail turns over with it.
  - **`hintSide` IS A PURE FUNCTION OF TWO NUMBERS, so a test can ask it both questions.**
    jsdom has no layout: every offset there reads 0, which is the no-room case, so a test
    of the placed element could only ever see one of the two answers. Where the bubble
    actually sits was checked in a browser.
- **IT TAKES NO TAPS** (`pointer-events: none`) and is `aria-hidden`. A bubble that
  swallowed a press would be a lid over the tile behind it and over the press meant to
  put it away; and the sentence is already the tile's own `aria-label`, so announced again
  it reads as two different faces.
- **ONE FUNCTION HOLDS BOTH WORDINGS** (`route`). "Colony Road · chapter 5" is a fact
  about a face you HOLD and "Reach chapter 5 on the Colony Road" is the route to one you
  do not — two sentences for two states, and written as two functions they would be two
  copies of the same three branches.

- **AND IT REPLACED THE SOURCE ON THE PICKER'S HERO.** That line said where the avatar
  came from — "Colony Road · chapter 5" — which is a fact about a face you have NOT got,
  and the hero is the one being worn. The source is still on every tile and under the
  grid, which is where somebody asking "how do I get that one" is looking; the tile's
  label leads with the name now and keeps the source behind it.
- **THE COUNT IS PRINTED ONCE**, directly over the grid it counts — reported as
  "collection 23/98 two times, remove the top one". It rode above the hero as well, and
  a number said twice on one screen reads as two different numbers until it is checked.
- **AND THE ROAD AND THE HATCH NAME IT TOO.** A checkpoint said "A new avatar" and both
  hatch cards said "Avatar": every other reward on the road states exactly what it pays
  and every other prize in a ten-hatch names itself, so those were the two that would
  not — on the one reward with a name of its own.

**THE PROFILE PRINTS THE COLONY IN FULL** (`pf-colony-n`). Asked for directly: "we need
to see the exact colony number, not 2K — that's shortened for other screens like the home
screen." `compact()` exists because the figure rides a 30px banner over artwork and a chip
in the chrome, where seven digits do not fit (§8a); the profile is the one screen that is
ABOUT the number, with a whole card for it, and "2K" is any colony between 2,000 and
2,099. The size clamps below about 470px wide so `5,000,000` still fits a 320 phone — the
upper bound is the 42px it has always been, so nothing wider changes.

**AND A SPECIES FACE STANDS ON ITS RARITY** (`antPortrait` in `chrome.ts`). Asked for
directly: "wherever the icons of the species are shown they need to be shown with their
respective coloured backgrounds that shows rarity." The Antarium has painted a colony's
tile in its tier since that screen was drawn to the design (§ THE ANTARIUM), and every
other place a face appears — the profile's collection strip, a friend row, the ladder, the
opponent search, the sign-in roster, the result card, the match history — drew the same
head on whatever the page happened to be, so one screen said the rarity in colour and
twelve said nothing.
- **It is set in `antPortrait`, not at the calling sites**, which is the whole reason that
  function exists (§7): a background per screen is twelve places to fix when a rung's
  colour moves, and the twelfth is the one that gets missed.
- **INLINE, because the rung is read off the SPECIES** and no stylesheet can know which
  rung a given face is on — and it has to be set on BOTH tags, since a painted colony
  answers with an `<img>` and a drawn one with a `<canvas>` (§ A COLLECTION CARD).

**THE PROFILE IS DRAWN TO THE DESIGN TOO** (the PROFILE block at the foot of
`skin.css`). The fourth screen brought into the SHARED DESIGN LANGUAGE, after home, the
shop and the Antarium — and the FIRST that was not handed over as a mock-up, asked for
as "recreate here how we did blocks in the home, shop, and antarium".
- **NOTHING NEW WAS NEEDED, which is the point of there being a language at all.** Every
  block is `--hud-card` on `--r-card` wearing the ledge and the gloss, with the four type
  sizes, `--fs-hero` on the one line that is a NAME, and the two gaps. Like the shop and
  the Antarium and unlike home, it does not ride `--u`: a column of cards grows its
  COLUMN and keeps its TYPE.
- **THE RECORD IS ONE CARD CUT BY HAIRLINES, not six tiles.** Six ledges in a block is a
  pile of objects where the screen means one table, so the grid carries the ledge and the
  1px gaps over the chrome's own dark are what rule it.
- **AND THE AVATAR HAD A WHITE FRAME ROUND IT, because `.pf-face` is a BUTTON.** It
  became one the day the picker landed and the UA's own outset border came with it —
  reported from a phone as "some whiteish frame behind the image", and invisible to every
  test in the suite because jsdom has no user-agent stylesheet to apply. A box whose
  entire content is a picture has nothing to put a frame around. `css-sanity` holds the
  reset, and sweeps this block for its type sizes, its radii and its marked ledges the
  same way it sweeps the other three.

**AND THE OTHER NINETEEN CAME OVER AS ONE REMAP** (the EVERY OTHER SCREEN block at the
foot of `skin.css`). Four screens had been drawn to the shared language and the rest were
still in the app's FIRST one — deep forest green panels on a deep forest ground, 14px
corners, no ledge. Asked for directly: "do the design adjustments for all other screens
as well that we haven't done already." Half the app was green and half was charcoal,
which is the one thing a player cannot not see.
- **IT IS A REMAP, NOT NINETEEN BLOCKS.** Those screens carry about four hundred class
  names between them, and every one of their rules already reads its surface, its ink
  and its corner out of a TOKEN — `--panel`, `--ink-soft`, `--r-lg`. So the whole of the
  colour and the form is ONE rule redefining those tokens inside those screens, and
  every rule written against them picks the new value up. Enumerating the classes would
  be thousands of lines, nineteen chances to miss one, and a second place each screen's
  look is decided. The sweep that holds it is a different shape from the other four's:
  what it checks is that each remapped token points at a SHARED one.
- **WHAT A REMAP CANNOT REACH IS THE TYPE**, because a size written as `13px` reads no
  token. So the four sizes reach the furniture every screen SHARES — the header, the
  section labels — and a screen's own copy keeps its own measure until that screen is
  drawn to a frame of its own. A deliberate stopping point: shrinking body copy to a
  token with no mock-up to check it against is how a readable list becomes a small one.
- **THE HEADER IS DRESSED FOR EVERY SCREEN, not for the nineteen.** None of the four
  dressed blocks had ever touched `.screentop`, so the shop's title was the first
  language's 21px bold while the Antarium's banner a swipe away was the display face at
  22 — the same line, two faces, two screens. It is `--fs-hero` now, which is what that
  size is for, and the back arrow is a card with the ledge like everything else raised.
- **AND THERE IS ONE GROUND FOR THE WHOLE APP.** The dressed four sat on the first
  language's green-black `--bg0` while the remapped nineteen sat on the design's chrome,
  and two neighbouring tabs of one deck cannot be two different colours of nothing.
  `body, .screen` is `--hud-face`, the colour the top bar and the tab tray are cut from.
- **THREE THINGS WERE WRONG ON THE FIRST PASS AND ONLY LOOKING FOUND THEM.** Each is a
  case of the shared card list catching something that is not a card, and each is now
  held by its own assertion:
  - **The anthill's earth is not a surface.** It is a cross-section of soil with
    chambers cut into it, so the excavation summary written ON it came up as a tile
    floating in front of the dirt — and it sits over the mound, so a raised one covered
    the nest's entrance. The summary and the granary's store stay flat; the CHAMBERS are
    cards, which is what the screen wanted all along.
  - **A paragraph is not a card.** The manual's prose was in the list, so every sentence
    in How to play became its own raised tile and the page read as a wall of objects —
    the exact fault the no-shadows decision was taken to fix (§10). Its FIGURES stay
    cards, because a figure is a picture of the board sitting on the page.
  - **An empty state is a well, not a tile.** "Nothing found yet" raised on a ledge is a
    thing to press that is not one.
- **AND THE ODDS PANEL'S TIER FRAMES WERE NEARLY FLATTENED.** `.hp-tier` went into the
  card list and painted all five rungs the same charcoal — undoing the fill that is the
  whole point of them (§ THE LUCKY HATCH). Nothing in the suite would have said so.
- **THE DESTRUCTIVE ROWS WERE MEASURED AND LIFTED.** Reset, Delete and Restore are
  `--danger` ink on a 7% white wash over the card: 3.44 against the old green panel,
  3.92 against the design's — better, and still under AA at 12px. Mixed toward white it
  is 5.2. It is the INK that moves, not the token, because `--danger` is a FILL
  elsewhere and a paler one would want dark text on it.
- **TWO SCREENS ARE DELIBERATELY OUT OF IT.** The Colony Road is drawn to a design of
  Milan's own, made directly on `main`; and the match's chrome is glass over a painted
  region (§ THE GROUND IS THE WHOLE SCREEN) with a block of its own.

**AND THEN A TITLE WAS A BLOCK, AND EVERY BLOCK WAS PADDED THE SAME** (the block of that
name at the foot of `skin.css`). Three reports in one line against the remap above:
"stand-alone titles don't have background or anything from these blocks", "any block
should have proper and uniform padding and margins", and "check the match to [the
in-game] screens and try to keep it clean".
- **THE FIRST TWO ARE THE SAME FAULT SEEN TWICE.** A token remap moves every SURFACE and
  leaves behind everything that reads no token: what each card PADS itself by — six
  different answers across the app, 10, 12, 12/10, 12/14, 14 and `16px 14px 18px` — and
  the screen TITLE, which was never a card at all. So a page was a stack of plates with
  one bare line of type at the top and no two plates the same inside.
- **THE HEADER IS A BLOCK NOW, and the back arrow is a WELL inside it.** A plate on a
  plate is a box in a box, so the arrow takes the language's own "button cut into a
  card" and stops being a second raised object. The rule is UNSCOPED like the title rule
  it joins: home has no `.screentop` and the match's header is its own element.
- **ONE PADDING, and it is the gap the screens are already spaced by** (`--block`). A
  WRAPPER is deliberately not in the list: `.newscard` bleeds a picture to its own
  edges, `.setgroup` and `.frpanel` hold rows that pad themselves, and the Antarium's
  `.ccard` is nothing on purpose — padding any of those puts a margin inside a box with
  no content of its own.
- **AND ONE GAP UNDER THE HEADER.** Measured across nine screens it was 2, 4, 12, 38 and
  44: every `.screenbody` had its own top padding, the wrappers inside added theirs, and
  on two screens the first block's own margin was added on top. The BODY owns it and the
  wrappers own none — and whatever is FIRST has its top margin zeroed, because the shop's
  demo notice carries `margin: var(--sp6) 0 0` of its own and that was 24px of nobody's
  gap.
- **A NOTE IS A WELL.** The demo notice, the pass note and the ladder's disclosure were
  each a tinted box in a colour of their own — blue over a charcoal page reads as a
  different material rather than as a quieter one.
- **AND THE MATCH IS THE SAME APP.** It was the one screen left in the first language:
  three dark green pills, a green clock card and four action tiles each filled with a
  different colour, over artwork every other screen had stopped sitting on. What does NOT
  change is the rule that screen already has — the strips are glass and the controls on
  them are OBJECTS (§ THE GROUND IS THE WHOLE SCREEN) — so every chip, the clock and
  every button keeps a solid fill; it is the design's fill now.
  - **THE COLOUR MOVES OFF THE SLAB AND ONTO THE INK.** Four buttons in four fills is
    four objects made of four materials, and what the colour is actually saying — which
    action, and whether it is armed — is said by the mark and the word, which is where
    the eye already is.
  - **ARMED IS A FRAME, NOT A WASH.** `.on` filled itself with 22% of the colony's own
    glow, which over ten painted regions is ten different browns; an inset ring is the
    same brightness on every one of them. It has to REPEAT the ledge in the same
    declaration — a box-shadow is one property, so an armed state that forgot would
    quietly flatten the button it is marking.
  - **AND END TURN IS THE ONE BRIGHT THING**, the rule home follows with PLAY.
- **THE SETUP SCREEN'S BLOCK IS ONE LEVEL OUT.** `setupSteps` is appended BESIDE
  `screenHeader` rather than inside it, so a plate on `.screentop` left the two step dots
  just below the card's bottom edge, reading as clipped by it. The plate is on
  `.setuptop`, which is the title AND its rail — and they belong together: the rail says
  which of the two steps the title is naming.
- **AND THE INVITATION IS IN THE FLOW.** It was `position: absolute; top: 0` with the
  header reserving a hand-measured 78px for it — two numbers that have to agree, and the
  day the bar became a card with the shared padding they stopped. As a block in the
  column it takes its own room and the gap under it is the one every other block has.

**AND THEN THREE OF THOSE DECISIONS CAME BACK THE OTHER WAY.** Reported against that
build, one message each, and every one of them is now the rule:
- **A TITLE IS NOT A BLOCK.** "These main titles on top should NEVER be blocks like
  other content. They are stand-alone with no background or frames. Just title, also
  remove the small subtitle as well." So the plate is off `.screentop`, the plate that
  had moved out to `.setuptop` on the setup screen is gone with it, and the back arrow
  is a CARD again rather than the well it became inside one.
  - The reasoning is worth keeping, because it is the opposite of the rule every other
    box on these screens follows: a title is not a thing you press or a thing that holds
    something — it NAMES the page, and a name in a frame is a label on a lid.
  - **THE SUBTITLE IS OUT OF THE MARKUP, not hidden.** `screenHeader` stops building it
    and `sub`/`subId` are off `HeaderOptions`, so the nineteen screens that passed one
    had to drop it and the three dead `.screensub` rules came out of `skin.css`. A line
    nobody wants, left in the type behind a `display: none`, is a line the next screen
    writes again.
  - **ONE OF THEM WAS CARRYING A FACT.** The avatar picker's subtitle was the collection
    count, which is the one number that screen is ABOUT — it is a section label over the
    grid now. A subtitle is the wrong place for content; deleting the content with it
    would have been the wrong fix.
- **AND THE DARK BEHIND THE CHROME IS THE DESIGN'S.** The status bar and the home strip
  came back green: those are painted by the SYSTEM from `theme-color` and the manifest,
  which no stylesheet reaches, and both still said `#0e1a12`. They are `#1c1e25` now,
  and so is the cover's own ground in `index.html` — a cold boot flashed the old colour
  for two seconds before the app it covers.
- **AND A BLOCK WEARS NO STROKE.** "I see a small outline stroke for the blocks, we
  don't use that — remove it everywhere. We just sometimes have that stroke if the
  element is SELECTED." TWO different things were drawing one:
  - The first language outlines a panel with `1px solid var(--line)`, and the remap
    pointed `--line` at a pale white — so every one of those strokes survived and became
    visible against the design's dark card. A sweep clears them and exempts exactly the
    states a stroke is for: `.on`, `.armed`, `.worn`, `.sel`, `.active`, `:focus-visible`.
  - **AND THE REST OF IT WAS THE GLOSS, which only a measurement would have found.**
    `border` computed as `none` on every card and the edge was still there. On a rounded
    box a 2px white inset at the TOP carries round both corners and reads as an outline
    starting down each side: measured on a settings row, the top four device pixels were
    `126,126,130` against the card's own `40,41,48`, with the left and right edges clean.
    `--hud-gloss` is off every card in the app, home's included — the LEDGE is what says
    a thing is solid (§10), and it stays. What still wears it is the tab tray's shelf,
    which is chrome rather than a block and was asked for by name.

**AND THEN A BLOCK NEVER HOLDS BLOCKS** (the block of that name at the foot of
`skin.css`). Four more reports against that build, and the first two are one rule:
"reaching us part looks weird — maybe also just have each block, and their parent should
have no design attributes", and "each request should be a block, their parent don't need
to have those attributes".
- **THE REMAP BROUGHT EVERY SURFACE OVER BY NAME, AND SEVERAL OF THOSE NAMES ARE
  CONTAINERS** — a stack of settings rows, the friends list, the fuse panel, Support's
  contact box. So a row with a face, a corner and a ledge sat inside a parent wearing the
  same three, and because the ledge is drawn 3px RIGHT and 4px DOWN with no blur, every
  row's shadow hung out past the parent's padding: the rows read as too wide for the
  panel holding them. That is the "looks weird", and it is the same fault the Antarium's
  `.ccard` was already deliberately nothing to avoid.
- **THE CONTAINERS CAME OUT OF THE LISTS rather than being overridden after them**, so
  there is one place that decides what a block is. What is left in the new block is the
  handful that carry a face in their BASE rule (`.fusebox`) and the gap the stacks are
  spaced by — `--inrow`, because a gap has to clear the LEDGE as well as the row, and the
  6px and 9px each screen had picked left one row's shadow on the next row's top edge.
- **SUPPORT'S CONTACT BOX IS A NEW CLASS, not an exception.** `.spbox` is also the
  COMPOSER, which has real content of its own and is still a card; the contact stack is
  `.spfacts` and is nothing. One class doing two jobs is what would have forced an
  override.
- **AND `.fb-row` HAD NO SIDE PADDING OF ITS OWN**, because `.fusebox` carried it. With
  the box gone the gold price button sat flush against the row's edge, so the row joined
  the shared padding group. Anything taken out of a padded container has that trap.
- **THE INVENTORY'S GROUP HEADINGS ARE TITLES**, asked for in the same breath: "same goes
  for these titles, they should just be text with no background or shadow." They are
  DOORS into a bench, which is why they were plated — but a door drawn as a slab in a
  column of slabs is one more block in the stack, and what tells it from the tiles under
  it is that it is a line of type with a chevron. Same answer as the screen title.
- **AND A PICTURE IS NOT A BLOCK.** "Images don't need to have background and drop
  shadow, those block attributes — just have image there with the description." The
  manual's figures went into the card list on the reasoning that a figure is a picture of
  the board SITTING on the page; it reads the other way round, because the drawing has
  its own edges and its own ground, so the plate is a frame round a frame and the ledge
  is a shadow under something that is already an object.
- **THE ANTHILL'S HEADING OWNS THE GAP UNDER IT**, which is the one place the container
  cannot. Every other screen here is a column of blocks with `gap: var(--block)` on the
  scroller, so a heading must NOT carry a bottom margin or it doubles. The anthill's
  scroller is a continuous DRAWING — the mound and the shaft under it have to touch — so
  a gap there would cut the nest in half, and the bench at its foot was the one block on
  that screen with its label sitting flat on it.
- **AND THE SHAFT CARRIES NO DEPTH NUMBER.** It counted the levels 1-6 down the side of
  the nest: a number for a thing nobody is choosing between, when the chambers are named
  and are read top to bottom. Reported as "there are numbers from 1-6 for some reason".
- **TWO THINGS WERE FOUND BY LOOKING, not by the report.** The FAQ's question came out
  CENTRED with the chevron tucked against the end of the text — the tap-floor rule gives
  seven controls `display: inline-flex; justify-content: center`, which is right for the
  six that are CHIPS and wrong for the one that is a full-width ROW, whose own rule had
  said `space-between` all along and simply came first. And `.spfact-link` declared three
  grid columns while Privacy and Terms add a chevron as a FOURTH child, so the arrow
  wrapped onto a second row under the mark.

**EVERY POP-UP IS THE SAME APP** (the block of that name at the foot of `skin.css`).
Reported from a phone against the result card: "End game pop up isn't designed the same
way with same colours as new design. Make sure all pop ups are."
- **A POP-UP IS NOT A SCREEN, which is the whole of why it was missed.** Both the token
  remap and the shared card recipe are scoped to the nineteen SCREENS, so the result card
  kept the legacy sheet's green `--panel`, its 24px corner and its 1px `--line` stroke
  while every screen behind it had been charcoal for weeks. `.overlay` (the result card
  and the what's-new card) and `.rd-pop` (the Colony Road's claim confirmation) join the
  REMAP LIST rather than getting a mapping of their own — two places deciding what a
  surface is made of is how the app ended up half green in the first place.
- **AND THE ROAD BEING ITS OWN DESIGN DOES NOT EXEMPT ITS POP-UP.** The Colony Road is
  deliberately out of the remap (§ TWO SCREENS ARE DELIBERATELY OUT OF IT), and that is
  about the ROAD — the rail, the discs, the chapter plates. A confirmation card over it
  is app chrome, and it was the second thing still wearing the first language.
- **WHAT IS INSIDE A POP-UP IS A WELL, not a second card.** A card on a card is a plate
  on a plate, so the payouts and the facts are cut INTO the surface. The facts grid is
  ruled by its own background showing through 1px gaps, so it has to be DARKER than its
  cells: left on `--line`, which the remap points at a pale white, it drew four bright
  lines across the quietest block on the card.
- **The scrim is the design's neutral dark**, not the old language's green-black: over ten
  painted regions a green cast reads as a tint rather than as dark.
- **AND THE TUTORIAL'S BUBBLE IS A POP-UP TOO** (§10a), reported in the same words one
  build later: "tutorial popups needs to be designed in a same manner as the rest of the
  app, good example is game end pop up screen." It is the one card in the app that is not
  a `.screen` and not an `.overlay` — a panel the tour builds over whatever is underneath —
  so it was the last thing still wearing the first language's green panel and 14px corner.
  `.tourwrap` joins the REMAP LIST with the other two, and the bubble takes the shared card
  recipe, its button the `--hud-go` slab every primary action wears. Its SHADE is the
  pop-up scrim's own neutral dark for the same reason, over the same ten regions.

**A RESOURCE IS ALWAYS THE PAINTED MARK** (`RESOURCE_MARKS`, `resourceMark` in
`chrome.ts`). Asked for directly in the same breath: "everywhere where we show resources
their official icon should be like it is on the home screen. Exception is the shop
purchase options."
- **IT OVERTURNS HALF OF AN EARLIER RULE, deliberately.** § THE PAINTED CHROME MARKS
  settled that a mark is painted in the CHROME and still drawn in the BODY, because the
  painted set is chunky colour art sized for a 36px tile and the same picture at 15px
  inside a line of text reads as clutter where a flat glyph reads as punctuation. That
  still holds for every mark naming a SCREEN or an ACTION. It does not hold for a
  CURRENCY: the top bar is where a player learns what mycelium looks like, and a price, a
  reward and a payout are the same object counted somewhere else — drawn flat in nine
  places and painted in the tenth they read as two different currencies. Recognising it
  at a glance beats the punctuation argument on the one mark that has to match across
  screens.
- **THE SHOP IS THE EXCEPTION AND ALREADY WAS.** A purchase tile shows the SHELF art
  (`ui/shelf.ts`) — a painted pile of the stuff, which is a picture of what is being
  bought rather than the mark for it.
- **ONE FUNCTION, and it is `hudMark` with its fallback kept**, so a resource whose file
  went missing is still a mark rather than a hole. Nine call sites moved: the header purse
  chip (which was already painting pheromone and drawing mycelium — the two currencies
  rendered in two families, in one chip row), every price button, the challenge reward,
  the hatch's purse and fuse rows, the league prize column and the result card's payouts.
- **THE COLONY AND THE XP ARE NOT RESOURCES** and keep their drawn glyph on the result
  card, which is also what lets them be TINTED: `.pay-colony svg` colours the mark green
  or red by whether the colony went up, and an `<img>` cannot take `currentColor`.
- **THE SWEEP IS THE RULE.** `icon("mycel", 13)` produces a perfectly good mark in the
  wrong family on one card out of ten, and nothing a rendering test can see would notice;
  `hud.test.ts` walks every shipped file and fails on any of the three drawn with `icon`.
  The list itself is tied to the three purse fields on the profile, because shrinking the
  list is otherwise a silent way to stop guarding one — which a mutation proved.
- **AND A TEST NAMED THE TAG AGAIN.** `meta.test.ts` asserted `.mycelchip svg`, which was
  true for exactly as long as the currency was drawn and failed the day it was painted,
  with the chip perfectly correct. What a box owes is A MARK: `svg, .hudmark`. Third time
  this file has had to write that sentence.

**AND A POST SAYS WHETHER IT HAS BEEN READ** (`profile.newsRead`, the `.read` rules in
`skin.css`). Asked for directly: "we should have a way to know which is read and which
not — read ones should not be so prominent."
- **READ MEANS OPENED, and that is why it is a NEW FIELD rather than the stamp.**
  `newsSeen` answers "has anything landed since you last looked", which is all the
  drawer's badge needs — and it is set by ARRIVING at the feed, and by the what's-new
  card two screens earlier. Read off that stamp the whole screen comes up dim on the
  first visit, which is what the first version did. `newsRead` is the set of post ids the
  player has actually opened.
- **THE OPEN POST IS NEVER THE DIM ONE.** It is being read now, and a card greying out
  under the finger that opened it reads as the tap having failed. It IS marked read, so
  it loses its "New" at once and dims as soon as it is shut.
- **THE MARK IS A FILLED PILL, not coloured type.** The tag beside it is already green
  type on an "update" post, which is most of them, so two green words on one line read as
  one label cut in half. Dark ink on the green measures 10.9:1.
- **AND THE DIMMING IS A COLOUR FILTER ON THE PICTURE, never opacity** — the rule the
  Colony Road's claimed rewards already follow, because a transparent picture shows the
  page through itself and reads as a drawing that failed rather than one that is behind
  you. The ink stops at `--hud-mute` (5.3:1 on the card); the next step down is 2.7,
  under AA, which is a post a player cannot read rather than one they have.
- **`normalise` IS WHAT KEEPS THE LIST UNIQUE, not the guard in `readPost`.** The screen
  calls `readPost` on every redraw for whatever stands open, and the early return there
  only saves the WRITE — a mutation deleting it passes every test, because `update`
  re-normalises. The list is also filtered to the ids this build carries, so a post
  dropped from the table cannot keep its id in a save for ever.

**ONE RARITY LADDER, FOR EVERYTHING THAT HAS ONE** (`engine/tiers.ts`). There were TWO and
they disagreed. Traits ran common / uncommon / rare / exceptional / mythic in grey, green,
blue, purple and red; colonies ran "Founding castes" / "Rare colonies" / "Elite castes" /
"Mythic" in green, blue, purple and GOLD. So the same rung had two names on two screens,
and the top rung had two different colours — a player who learned that red means "the best
thing in the hatch" then met a gold Mythic colony in the Antarium and had to learn it
twice. A rarity is a promise about how hard something is to get; it has to mean one thing.
- **The ladder is the vocabulary; what a rung is WORTH stays in `platform/`.** A trait's
  percentages, a colony's price band, the weight a hatch rolls it at — those are
  progression decisions that will be retuned and they belong beside the prices. The names,
  the colours and the order are one table in the engine, because `render/` and `platform/`
  both need them and may not import each other (§3).
- **`TIERS` in `catalogue.ts` is DERIVED from it**, glow included (the tier's own colour at
  low alpha), so a retune cannot move a colour on one screen and not the other.
- **COMMON IS HELD OPEN.** There is no grey colony yet and there will be, so the three a
  player starts with are Uncommon and the rung below is left empty rather than the ladder
  renumbered — renumbering is exactly how a rung ends up meaning two things again. A test
  holds that no colony has taken it.

**SKINS — WHAT A COLONY LOOKS LIKE** (`engine/skins.ts`, `platform/skins.ts`, the picker in
`ui/species.ts`). Every colony has THREE looks: the one it is born with and two that are
found. A look changes nothing about the game — no stat, no rule, no number that reaches
`fight()` — and that is the whole point of it: it is the one thing a player can collect
that costs an opponent nothing.
- **THE CATALOGUE IS IN THE ENGINE, and that is not where you would first put it.** The
  drawing is in `render/`, the ownership is in `platform/`, and those two may not import
  each other (§3) — so a table both need has to sit under both, and under both is the
  engine. It is the same kind of thing `SPECIES` already is: a name, some copy and some
  tags the engine itself never reads. Second reason: a match record carries the setup, so
  a replay of somebody else's match should be able to show the colony they fielded.
- **A LOOK IS FOUR TAGS, all drawn, none loaded** — `style` (an overlay on the ant), `hill`
  (the nest's shape on the board), `pal` (an optional recolour) and `tier`. **`pal` is the
  one that carries furthest**: an overlay is a few pixels on a portrait, a palette is every
  tile the colony holds on a board somebody stares at for ten minutes.
- **A SKIN IS ONLY EVER PURPLE OR RED.** Every found look sits on the top two rungs of the
  ladder and nothing below, which is what makes one hard to get — and it means a skin needs
  no chance of its own at all (see the hatch). In rarity order, so the picker reads left to
  right: the COLOURWAY is the Exceptional one and the drawn OVERLAY is the Mythic one. The
  overlay is bespoke art per colony and the colourway is three hex values, and it paces
  well that way round — the change a player sees across the whole board arrives first, and
  the special one is what they carry on hatching for.
- **NO SKIN MAY LOOK LIKE ANOTHER COLONY.** An opponent always fields its basic look, so a
  palette landing on another species' own colours is not a skin — it is a colony you cannot
  identify across the board. FOUR did on the first pass: a pink Leafcutter read as a Demon
  Ant, a gold Weaver as a Pharaoh, a cream Leafcutter as a Ghost, and an indigo Army as a
  Carpenter. `skins.test.ts` measures every palette against every species' body colour, and
  it is the only reason the last two were ever found. (The Weaver is gone — see below —
  but the lesson is the reason the test exists, so the example is left as it was found.)
- **AND NEVER GREY.** The board greys out tiles it has cut off, so a grey colony reads as
  permanently disconnected. That is what pushed the Fire Ant's colourway from ash to ice.
- **A SKIN IS NOT AN ITEM, which is why it never reaches the inventory.** A trait has a
  uid, sits in a bag and can be worn on one bench at a time; an appearance has none of
  that. Finding one twice is finding it once, `profile.skins` is a set of ids and
  `profile.look` is what each colony is wearing — absent meaning basic. `normalise`
  rebuilds the two TOGETHER, because a colony cannot wear a look it has not found and
  certainly cannot wear another colony's; both fall back to basic, which is the one look
  every colony always has. A basic look is never STORED as found, or "how many skins does
  this player have" would depend on how many colonies they own.
- **Wearing basic is CLEARING the field**, never writing its id. Two ways to spell one
  state is two states to keep in step.
- **`ProfileStore.lookFor()` is the single answer to "what does this colony look like"**,
  and `lookCol()` in `render/palette.ts` is the single answer to what colours it is drawn
  in. That is what stops the board, the portraits and the pickers disagreeing.
- **The renderer repaints the factions ITSELF**, in its constructor and in `reset` — which
  ran on the bare species and quietly undid the colour `startMatch` had just set, so a
  skinned colony wore its own nest shape in the base species' colour. `looksOf` settles the
  looks BEFORE `paint()`. Anything else that calls `setFactionColor` has the same trap.
- **The plate beside the nest wore it too**, and that head is gone now (§ WHO IS PLAYING):
  it was the one mark left on the board still drawn in the species' colour, and the fix
  was to have it wear the look before the row itself was removed.
- **The AI always fields the basic look.** Not a fairness rule (a skin cannot affect a
  fight) — it is so an opponent reads as the species it is, and so the one colony on screen
  wearing something found is the player's.
- **The picker shows all three, and a locked one is DRAWN.** Greyed, not hidden: seeing the
  two you have not found is the reason to keep opening the hatch. The state is WRITTEN
  ("Worn" / "Wear" / "Locked") because worn and owned-but-not-worn are one hairline apart,
  and each card names its RARITY in the ladder's own colour — a locked card that does not
  say which is a chase with no idea how long it is. The worn one is the only card that is
  FILLED, so the rarity edge and the worn state can never be confused.

**THE LUCKY HATCH** (`ui/hatch.ts`, `platform/traits.ts`). The artwork in the middle of
the screen, the larva you have above it, one button under it. That is deliberately the
whole interface: the hatch does exactly one thing, and every control that is not "hatch"
is a control competing with it.
- **THE DRAWN EGG AND ITS CAPTION ARE GONE, asked for directly.** There was a gold mark
  on a dashed, gold-tinted disc in the middle, and a line under it saying every trait and
  every skin was in there. The screen's own painting already has a LARVA in the middle of
  it, so the mark sat on top of the picture it was duplicating — and the sentence under
  that was a third thing saying what the odds row below already says.
  - **WHAT IT COST WAS THE ROCKING, AND THE LARVA IS AN ELEMENT NOW SO IT IS BACK.** The
    egg was the only thing that moved while the roll resolved; a PAINTED larva cannot
    move, because it is part of a full-screen background. So the chamber was repainted
    EMPTY and the animal is an `<img>` in the stage — which is exactly what that note
    said whoever wanted the movement back would have to bring.
    - **IT IS SIZED AGAINST THE BURROW, and that is the second answer to this.** The
      first was `24vw` — the width the larva was PAINTED at in the stand-in background,
      which made the swap from paint to element invisible. The real chamber has a wide
      open mouth in the middle of it, and a 94px animal in that read as something
      dropped down a hole rather than as the thing the screen is about. `min(40vw,
      215px)` is a little over a third of the opening, checked on a phone and a tablet.
      A `vw` is still the file's own width, because the picture is `cover` and a phone
      is relatively wider than the file; the CAP is for a tablet, where cover turns over
      to scaling by HEIGHT and an unbounded `vw` puts the animal through the walls.
    - **IT WRIGGLES, IT DOES NOT SPIN**, which is the same rule the egg followed: a spin
      is what a loading indicator does, and nothing here is loading — the answer was
      decided before the animation started.
    - **IT IS THERE EXACTLY WHEN YOU CAN HATCH ONE.** The picture is the hatch you are
      holding rather than decoration, so an empty purse leaves an empty burrow and the
      button under it is the one thing on screen saying what to do about that.
    - **AND `busy` IS CHECKED FIRST, which is not belt and braces.** `store.hatch()`
      SPENDS before the screen redraws, so a player opening their LAST larva has none
      left by the time the wriggle would start — read off the purse alone, the animal
      vanishes on the press and the hold plays over an empty burrow. While it is
      wriggling it is the one being hatched.
  - **THE PRIZE IS A FULL-SCREEN POP-UP**, asked for directly. It used to land in the
    middle of the chamber at about the size of the larva it replaced, which made the best
    thing that happens in this feature the same size as the thing that was already there.
    - **THREE WAYS OUT AND ALL OF THEM CLOSE IT.** A tap anywhere dismisses it, because a
      card that has been read is in the way and hunting for its corner is a tax on every
      hatch; the X is for anyone who looks for one, since a full-screen card with no
      visible way out reads as something gone wrong; and the button to the inventory
      closes on the way, or the card would be standing there on the way back. That they
      all close is what makes it SAFE: a press wobbles and the browser fires the click on
      the nearest common ancestor of where it went down and where it came up (§ A PRESS
      THAT GOES DOWN ON ONE ELEMENT), so a thumb that starts on the button and lifts on
      the dark lands on the backdrop — and the worst that does is close without
      navigating, which is what the backdrop does anyway.
    - **THE SCREEN IS WHAT IS RAISED, NOT THE CARD.** `.screen` is `z-index: 20` in the
      legacy sheet and `#mainNav` is 60 in the same stacking context, so a card INSIDE
      the screen cannot out-stack the tab bar at any z-index of its own. It came up with
      five tabs still lit along the bottom of it. `#luckyhatch.popped` lifts the screen,
      and only while a prize is up.
    - **AND IT STAYS INSIDE THE SCREEN** rather than going on the body, so leaving the
      hatch takes it with it — a full-screen card left standing over wherever the player
      went is far worse than the fault it fixes. The same reason the hold's timer checks
      `root.isConnected` before raising one at all.
    - **The scrim is .96, not .88.** The chamber behind it is LIT — a pale larva in the
      middle of the frame — and it read straight through the prize's own disc, which is a
      ring with a 14% wash of the tier colour in it rather than a plate. The point of the
      pop-up is that the tier's colour is the only thing on the screen.
  - **THE TWO FILES ARE THE REAL ARTWORK** (`ui/backdrops/hatch.webp`, `.../larva.webp`).
    They were STAND-INS for a while — the chamber was the old painting with the larva
    keyed out of it and the hole filled by relaxing Laplace over the patch, and the
    cut-out was that keyed larva at 218px — and the note here said dropping the real
    pair in at the same names was the whole remaining change. It was: the files landed
    and nothing but their two sizes moved.
    - **The larva is TRIMMED TO ITS INK and resized to 720 wide.** The element is at
      most 215 CSS pixels, which is 645 device pixels on a 3x phone, so the 1080 it
      arrived at is two and a half times more picture than any screen asks for — and
      the service worker precaches every byte. Trimmed because `transform-origin: 50%
      55%` is measured against the BOX, so transparent margin in the file would move
      where the wriggle pivots.
  - **AND THE CHAMBER CARRIES A VIGNETTE, asked for directly**: everything but the very
    middle is dimmed, so the burrow reads as a hole in the ground with one thing lit in
    it rather than as a wall of soil the larva happens to be in front of. Two stops, out
    to a third of the radius untouched and near-black at the corners — one hard edge
    reads as a spotlight.
    - **IT IS A SECOND LAYER ON `#luckyhatch` ITSELF, never a `::after`.** A gradient IS
      a background image, and the blanket (§10) clears every pseudo-element's with
      `!important` and NO exemption at all — so a vignette written there is silently
      nothing, which is the trap `#home::after` is already on record for. The screen is
      one of the four exempt selectors and `background-image` stacks, so the wash rides
      in FRONT of the picture in the same declaration. Layer order is front-to-back,
      which is why the gradient is written first, and a test holds that order.
    - **AND THE TEST THAT ALREADY GUARDED THIS NOW READS THE BLANKET.** `css-sanity` has
      a sweep for gradients the blanket would clear, and its exempt list was the literal
      string `#home` — right while home was the only picture in the app, and wrong the
      moment a fourth exemption landed as a CLASS. It parses the `:not(...)` list out of
      the blanket rule itself, so the two cannot drift; a pseudo-element is never exempt
      however its own element is spelled.

  - **THE BUTTON STAYS SOLID WHILE IT IS HATCHING.** It is disabled for the whole hold and
    `[disabled]` carried `opacity: .7`, so the one filled slab on a screen that is
    otherwise a lit painting went SEE-THROUGH at exactly the moment the player is watching
    it — reported as the button going transparent. It darkens its own FILL now, which says
    working without saying gone; the `out` state has no fill to darken, so that one dims
    its ink instead. `css-sanity.test.ts` holds that the rule sets a background and never
    an opacity.
  - **AND THE NOTE UNDER THE ODDS BREAKS AT THE COMMA.** As one string it wrapped wherever
    the column ran out — mid-clause, on a different word at every width, which reads as a
    paragraph that did not fit. The two halves are their own elements (`.ho-line`), so
    what is paid is one line and the condition on it is the next, at every width.
  - **AND THE FIVE TIER FRAMES ARE FILLED, with a dark shade of the tier itself.** They
    were `color-mix(… var(--tier) 10%, transparent)` — a wash over whatever was behind
    them, which on the hatch is a lit chamber, so the rarity was the border and the fill
    was the painting. Mixed into the SOIL instead, each frame is a dark version of the
    colour it names, the same on both screens that show this panel.
    - **BOTH LINES ON IT HAD TO COME UP, and that is measured** (§ CONTRAST IS MEASURED).
      Against a 26% shade of its own tier the name fell to **4.22** and the Exceptional
      figure to **3.95**, both under AA — on the near-black they used to sit on, both
      cleared it easily. The name reads at `--ink-soft` and the FIGURE is the tier lifted
      toward white, which is the only way to keep the colour saying which rung it is while
      separating it from a fill made of that same colour. The two converge as the fill
      gets richer, so this is a ceiling rather than a preference: with the figure left at
      a flat tier colour the richest fill that still clears AA is 14%, which is barely a
      fill. The DOT stays the pure tier — it is the swatch, and nothing is read on it.
  - **AND A HANDFUL IS TEN** (`BULK`, `ProfileStore.hatchMany`), asked for directly. Ten
    is the number a player counts larva in once they have more than a few, and ten rolls
    at the printed odds is where the row below stops being a table of chances and becomes
    something they have watched happen.
    - **IT IS ALWAYS ON THE SCREEN, and DISABLED when the purse cannot cover ten.** It
      was drawn only once the batch was affordable, which this file argued for as the one
      place the screen departs from "a dead button is a dead end" — the main button
      already never says no, and a second one under it mostly reading "you cannot" is a
      control competing with the one that can. Asked for directly the other way, and the
      argument was wrong about what appearing and disappearing costs: a shortcut a player
      saw once and cannot find again reads as the screen having lost it, where a price
      they cannot pay yet reads as something to save up to. It sits UNDER the main button
      and quieter either way — an outline rather than a slab — because this is a shortcut
      THROUGH the screen's one action rather than a rival to it.
      - **THE DISABLED ATTRIBUTE IS THE WHOLE MECHANISM**, not a second guard inside the
        handler, which is the setup arrows' lesson: a click on a disabled button is never
        dispatched, so a test that tapped it and found nothing had happened would pass
        against a handler with no guard at all. What the test asserts is `disabled`.
      - **AND THE BORDER DIMS WITH THE INK.** It is an OUTLINE, so greying only the label
        leaves a dead price inside a live green frame — which is exactly what the button
        above it looks like while it is hatching. It keeps its PRICE, because the price
        is the whole reason it cannot be pressed; measured at **6.55** over the chamber
        and **4.72** against the brightest ground inside its own box, so it is still read
        rather than merely present. `css-sanity` holds the border, because the attribute
        is set either way and nothing a jsdom test can see would notice.
    - **THE ROLLS ARE NOT INDEPENDENT, so it is `hatch()` in a loop on purpose.** A skin is
      rolled against the collection AS IT STANDS, so committing each roll before the next
      is what stops a batch paying the SAME skin twice; ten rolled against one snapshot
      would hand out duplicates of the rarest thing in the game. The purse is checked ONCE
      for the whole batch — a run that paid for six and stopped would be a button that did
      not do what it said — and the store refuses too, not just the screen (§9b).
    - **TEN IS A TABLE, ONE IS A COLOUR, and they are two different cards.** One prize is
      the tier's colour filling the screen; ten of those would be a scroller the player
      has to travel through to see what they got. Each roll is one ROW — the mark in its
      tier, the name, what it is worth — in TWO COLUMNS of five, the whole handful read at
      a glance. `haul` is a second field rather than `found` becoming a list, because a
      list of one would draw the table for an ordinary hatch and lose the moment.
    - **IN THE ORDER THEY ROLLED, never sorted by tier.** Sorting puts the best one at the
      top of every batch, which turns the one moment worth having — finding the good one
      in the list — into a header.
    - **AND A SKIN IN THE BATCH SAYS WHERE IT WENT.** Five rolls in a hundred means about
      four batches in ten carry one, so it is the common case rather than an edge — and
      the button under the card points at the INVENTORY, which is the one place a skin
      will never be (§ A SKIN IS NOT AN ITEM). The card names it and the note says it is
      worn on the colony's own page.
    - **The cue is the LOUDEST roll in the batch**, the same rule `loudestOf` follows on
      the match screen: ten cues on top of each other is a rattle, and a mythic among
      commons has to sound like the mythic.
    - **It holds for exactly as long as ONE roll does.** The wriggle says the screen is
      working rather than measuring anything, so ten times the wait for ten times the
      larva would be the shortcut costing more time than the ten taps it saves.
  - **AND THE ODDS PANEL LOST ITS HEADING HERE, but never in the shop.** It sits under a
    button that says Hatch, beside a purse counting larva, on a screen titled "Lucky
    hatch" — "Chances" was a label on the only thing it could be the chances of, and it
    cost a line the screen needed once a second button went under the first. In the SHOP
    it is a row of percentages under a PRICE and a disclosure with no subject is worse
    than none, which is the store requirement the panel exists for (§ LOOT BOX ODDS GO
    BEFORE THE PURCHASE). `buildOdds` takes an empty heading and draws none; two tests
    hold the two halves.
  - **The stage keeps its room**, so nothing below it moves as larva come and go, and the
    LOCKED state kept the ring the egg used to lend it under its own name (`.hatchlock`).
- **LARVA IS THE THIRD CURRENCY AND IT IS SHOWN HERE AND NOWHERE ELSE.** It buys exactly
  one thing, so it does not ride the top bar beside the two a player spends every day — a
  figure in the chrome that the chrome offers nothing to spend on is a question the
  interface never answers. The plus sign beside it opens the shop AT the larva shelf
  (`#shopLarva`): a tap that asks for larva and lands at the top of a shop selling five
  other things has not been answered.
- **SPENDING AND ROLLING ARE ONE CALL** (`ProfileStore.hatch`). A hatch that spent and did
  not roll takes something for nothing; one that rolled and did not spend is free traits
  for ever. The screen owns only the drama.
- **A WIN PAYS ONE LARVA, so the hatch is played for rather than bought.** Until it did,
  larva was purchase-only and the whole collection — fifty slots across ten benches — was
  shut to a player who never spent money, which is the one thing a feature built on
  finding things must not be. One per win and no more: at two or three matches a day
  winning about half (§8c) that is roughly a hatch a day.
- **THE ODDS ARE PRINTED ON THE SCREEN.** 60 / 25 / 10 / 4 / 1, common down to mythic, and
  `tierOdds()` derives them from the same table the roll uses rather than restating them —
  a printed chance that has drifted from the real one is the game lying about the only
  thing a player has to go on. A hatch that hides its odds asks somebody to keep spending
  on a distribution they can only guess at, and the guess is always that the good one never
  comes; printed, one in a hundred is a target. The weights ARE the percentages (they sum
  to 100) because this number is read by a person, and a test measures forty thousand real
  rolls against what the screen says.
- **A SKIN IS THE TOP OF THE LADDER, NOT A CHANCE BESIDE IT.** It carries a rarity like
  everything else the hatch pays, and only ever Exceptional or Mythic — so ONE roll decides
  both: the tier is rolled exactly as it always was, and a roll at one of those two pays a
  SKIN of that tier while one is still locked. That is 5 hatches in 100. It needs no second
  number, which is the only way the odds printed on the screen can be the odds the game
  actually uses.
  - **It falls back to a trait of the SAME tier**, never to nothing and never to a lesser
    one. The last skin found must not be the moment the hatch got worse, and a Mythic roll
    paying a purple skin would be the card lying about what just happened.
  - The note under the tier row NAMES the two tiers rather than restating a percentage,
    because a percentage there is a second number that can drift from the row above it.
- **A skin's prize card is the colony WEARING it**, and the way out points at that colony
  rather than at the inventory — a skin goes nowhere, so there is nothing to go and look at.
- **THE POOL IS WHAT THE PLAYER HAS** — the universal traits and every colony they own. A
  mythic for a colony they may never buy is a mythic they cannot use, and the whole point
  of the top tier is that finding one is the best thing that happens in the feature. The
  roll is uniform over the TRAITS rather than over the pools: a colony's five and the
  universal eight are different sizes, so picking a pool first would make a universal
  trait rarer the more colonies you own — a collection that gets worse as it grows.
- **THE MOMENT IS THE FEATURE.** A roll that resolves instantly is a number changing, and
  a collection nobody feels collecting is a spreadsheet. So the roll is HELD — the egg
  used to rock through it, and never spin, which reads as a loading spinner — and then the
  tier's COLOUR arrives before the trait is named. The colour is the answer, which is the
  whole reason the tiers have colours.
- **With no larva the button is not disabled, it is the way to buy some.** A dead button is
  a dead end. And the prize says where it went, with the way there: a reward that lands
  somewhere the player has to go looking for is a reward they will not find.
- **Re-entry is stopped by the BUTTON being disabled**, not by a flag re-checked in the
  handler as well — one mechanism, and the one a player can see.
- **IT IS SHUT UNTIL TRAITS ARE (chapter 10), and that is not tidiness.** Larva buys traits
  and nothing else, so a hatch open before the benches are would sell a player something
  they cannot equip on any colony — which is the one thing a shop must never do.
- **The shop sells larva now**, and the test that used to forbid it was rewritten to hold
  the real rule instead: every product is bought against a real store and has to MOVE the
  save. A list of allowed grant keys has to be remembered; a purchase that changes nothing
  fails by itself. Cosmetic rolls are still not sold — there is no cosmetics pool, so there
  is nothing to hand over.

**A MATCH IS REMEMBERED, AND CAN BE WATCHED BACK** (`platform/history.ts`, `ui/history.ts`).
Nothing kept a finished match: the result card came up, the colony moved, and every game a
player had ever played was gone. Determinism is what makes this nearly free — the record is
the SETUP and the MOVES, and `replayMatch` rebuilds the board from them (§9b), so a replay
is the same twenty bytes a server would verify a result from.
- **The record is written where the moves are MADE, not derived afterwards.** `MatchScreen`
  pushes a `Move` as it plays each one, the AI's included — `aiTurn` reports what it chose
  through the worker, because the search runs on a COPY and the move that lands on the real
  board has to be the move that goes in the record.
- **A record that will not fit is DROPPED, never truncated.** `fitRecord` keeps the match
  and throws the moves away past `RECORD_MAX_MOVES`; half a record replays to a board the
  match never reached, which is a game nobody played presented as one somebody did. A row
  with no moves is still listed — the facts are the point of the list — it simply does not
  offer a replay it cannot give, which is the difference between a quiet row and a dead
  button.
- **It rides with the HERO, above the record.** The row into it began under the collection
  — three doors and a strip of nine heads deep — so from the top of the profile it did not
  exist at all, and the career stayed a count with no way into the matches it was counting.
  Everything under "Record" is a summary OF these matches, and the way into a summary
  belongs beside the thing it summarises. The row carries the COUNT, because how many there
  are to look at is the reason to open it.
- **The list reports what a match PAID.** The colony is the number the whole game is played
  for (§8a), so the right-hand column is the delta, in the losing colour when it cost.
- **The player rewinds by REBUILDING.** The engine has no undo, so Again folds a fresh
  opening board onto the one the renderer is holding (`restore(state, snapshot(...))`) —
  the same trick the AI's searched board lands by, which is why the renderer needs no
  rewind of its own. And a refused move LATCHES: skipping it and playing the rest would put
  the remainder of the record onto a board that has already diverged.
- **No opening.** `playIntro()` is a match STARTING; replaying it every time a row is
  opened is an animation nobody asked for twice.
- **IT IS WATCHED ON THE GROUND IT WAS PLAYED ON.** The replay was handed no picture at
  all, so every match in the list came back on the game's own DRAWN forest floor however
  far down the road it had been fought — reported as "playback shows old map". The chapter
  comes off `colonyBefore`, the colony the match OPENED with, which is what the road said
  at the time; today's colony would re-dress every old match in the region the player
  happens to be standing in now. The lookup is done in the SCREEN, because which picture
  belongs to which stretch of the road is a progression decision and `render/` may not
  read one (§3).
- **`normalise` destructures the record OUT before rebuilding an entry.** Spreading the
  stored object copied a malformed `record` straight through, and re-adding a good one
  never removed it — so `canReplay` read `.moves` off a string. Any normaliser that both
  spreads and conditionally re-adds a field has that trap.

**ACCOUNTS — A COLONY YOU CAN SIGN BACK INTO** (`platform/accounts.ts`, `ui/signin.ts`).
Everything a player had lived in ONE save under one key, so a device held exactly one colony
and there was no such thing as signing in: the game opened whatever was there. That is fine
until somebody wants a second colony, hands the phone to a friend, or clears a browser and
wants to know which of those two things just happened.
- **THERE IS NO SERVER AND THIS DOES NOT PRETEND THERE IS.** An account is a save SLOT on
  this device with a name and a code on it. What it buys is real — several colonies on one
  phone, and a sign-out that destroys nothing — and what it does not buy is carrying a
  colony to another phone. `backup.ts` is still the honest answer to THAT, and the two are
  deliberately different features: an account gets you back into your save, a backup code
  MOVES it. `AccountService` is the interface a real one arrives through, the same seam
  `Matchmaker`, `PurchaseGateway` and `SupportGateway` already use.
- **THE SAVE THAT IS ALREADY THERE BECOMES ACCOUNT ONE**, keeps the key it has always had,
  and is signed in (`adopt`). Without it the first launch of this build shows a sign-in
  screen to a player whose colony is sitting right there under the old key with no way to
  reach it — the update would read as the game having deleted everything. It runs once,
  and a device with no save at all gets a clean sign-in screen exactly as it should.
- **`ProfileStore` TAKES A KEY.** It was a module constant, which is what made one device
  one colony. Each account has its own, so two saves can never half-merge.
- **THE CODE IS THE CREDENTIAL AND IT COMES OFF THE SAVE.** `profile.playerId`, already
  minted, already printed in Support, already drawn from an alphabet with the ambiguous
  characters left out because somebody reads it off a screen. A second one minted by the
  account layer would be two codes for one colony, and the one on the Support screen would
  not sign the player in. **There is NO password**: nothing local protects a save from
  anybody, and a password is a way to LOSE a colony rather than to keep one.
- **AND THE SIGN-IN SCREEN ASKS FOR NO CODE.** One was built and removed. Every account is
  local, so the roster already lists every colony a code could possibly match — a box that
  can only find what is on screen beside it is the screen pretending to be a login form for
  a server that does not exist. The rows ARE the sign-in; the note points at the save code
  for the thing a code cannot do.
- **A row carries the colony's SIZE**, read off the save rather than off the account row.
  A list of names says nothing about which save has been played, and the colony is the
  number the whole game is played for (§8a). Off the save, because Settings can rename one
  and a second copy in the roster is one more place for the two to disagree.
- **AN ACCOUNT NUMBER ONLY EVER GOES UP** (`SEQ_KEY`), never derived from the roster:
  forgetting an account would otherwise hand its number — and therefore its save KEY — to
  the next colony created, which would open on the deleted one's leftovers. Same trap
  `traitSeq` exists for, same fix. `seen` is stamped strictly past every other account too:
  two sign-ins inside one millisecond are ordinary, and a "most recent first" picker that
  can tie moves on its own.
- **Signing out destroys nothing**, which is the whole difference between it and the reset
  row two headings below it in Settings — and the row says so, with the code on it.
- **A STORE HANDED TO `App` IS THE COLONY**, and skips the gate. That is what every test
  and every tool does; left to itself the shell opens the signed-in account and shows the
  sign-in screen when there is none.
- **`enter` goes through `signIn`, never straight to `storeFor`.** Opening the store reads
  the save but signs nobody in, so the next launch would show the picker again.

**THE COPY CANNOT LIE ABOUT THE RULES** (`engine/species.ts`, `engine/config.ts`). Every
ability description carried its own hand-typed copy of the numbers it describes, and one
was wrong for as long as the game existed: **Venom Rain promised "10 troops/turn" while the
engine took 7** — ported verbatim from the legacy build, wrong in both, invisible because
nothing compared the sentence to the rule. The other eight were right, which is worse: it
looked like a system.
- **The numbers moved to `config.ts` and the sentences are BUILT from them.** That file
  imports nothing, so the rules read them and the copy interpolates them; a balance change
  cannot leave the game lying about itself. It is the rule the manual has followed from the
  start ("the numbers are read from `engine/config.ts`, never typed out"), applied to the
  one screen that had escaped it — and `abilities.ts` had them as bare literals anyway, so
  naming them was owed regardless.
- **The test moves a constant rather than restating it.** Asserting the sentence contains
  the current value passes just as well when somebody types that value back in as a
  literal, and only breaks on the day it is retuned — which is the day nobody is looking.
  `ability-text.test.ts` checks the description follows the constant AND does not contain
  the number either side of it.

**THE GAME IS INSTALLABLE, AND IT HAD TO BE** (`index.html`, `public/`, `tools/icons.ts`).
There was no manifest, no icon and no iOS meta — while `ui/keepsafe.ts` was walking iPhone
players through Add to Home Screen, which is the only thing that stops Safari deleting
their colony. Following those instructions gave a blurry screenshot that opened in browser
chrome, and because it was not standalone `isInstalled()` stayed false: **the warning kept
nagging the one player who had already done what it asked.**
- **An installed display mode is what the app's own detection depends on**.
  iOS also uses the Apple standalone meta tag and navigator.standalone.
- **BOTH the manifest and `apple-mobile-web-app-capable`**, because older iOS does not read
  the manifest — and `apple-touch-icon` must be a PNG, since iOS ignores an SVG there.
- **Every path is RELATIVE.** The build sets `base: "./"` so one bundle runs under the
  Pages project path and inside the Capacitor shell; an absolute `/zombie-ants/` points at
  nothing in the second. A test holds it, and it was checked against a real sub-path server.
- **THE ICON IS A COMMITTED IMAGE, and that is deliberate.** Almost everything else is
  drawn at runtime; an icon cannot be, because the OS needs a file before a line of our
  script runs. (The home artwork and the regions are the others.) **It is a PAINTING now**
  — `assets/icon.png`, the source, committed beside the five PNGs `tools/icons.ts` cuts
  from it. It used to be RENDERED from the game's own `antHead` so it could not drift from
  the ant on the board, and the argument reverses with a painted mark: a drawing somebody
  made cannot be derived from anything, so the source is kept and the tool only resizes.
  Still a TOOL, not a build step — an icon has to be stable, because people find an app by
  it — and still excluded from typecheck and lint because it imports Playwright (§11).
- **EVERY SIZE IS THE WHOLE PAINTING, THE MASKABLE ONE INCLUDED — the MARGIN IS PAINTED,
  not added here.** Android may crop a maskable icon to a circle inscribed in the middle
  80%, so the first version insetting the picture 8% on three sides and stretched its own
  one-pixel border out to fill the margin (a nine-slice; a blurred blow-up drags the ant's
  reds across it, and a flat fill or a guessed gradient seams exactly where the inset
  stops; the bottom had to stay flush because the body runs off the edge there and clamps
  into a red block). All of that is gone: the artwork is composed with the head well
  inside its own frame, so insetting again pads a picture that is already padded — asked
  for directly, "do not expand it yourself further". The rule for whoever paints the next
  one is that the margin belongs in the FILE. Checked at 96px and 48px under both a
  squircle and a circle mask, which is the only size any of this is ever seen at.
  - **AND THE ANTENNAE ARE CLIPPED UNDER A CIRCLE MASK — on both paintings so far.** The
    head is whole and reads cleanly at 48px either way; what the circle takes is the outer
    segment of each antenna, because they reach to within a few percent of the sides. It
    is recorded rather than fixed, because fixing it here means insetting the picture
    again, which is the one thing that was asked against. The margin belongs in the file.
- **FULLSCREEN IS AN INSTALLED WINDOW MODE** (`public/manifest.webmanifest`).
  - The manifest sets `display: fullscreen` directly. Browsers have a standard fallback
    chain: fullscreen → standalone → minimal-ui → browser. The old claim that display
    had to stay standalone was incorrect and prevented fullscreen on browsers that
    ignored display_override. iOS retains the Apple standalone meta tag.
  - Manifest fullscreen and the DOM Fullscreen API are different. In a fullscreen
    installed window, document.fullscreenElement can be null and fullscreenEnabled
    can be false. Never infer the launch mode from those DOM properties.
  - An installed window already launched fullscreen must not also request DOM
    fullscreen on game taps. Android owns that window's immersive lifecycle.
    Standalone fallback installs also leave the display mode to the host.
  - isInstalled() recognizes fullscreen, standalone and minimal-ui.
  - The native transient-bar policy belongs to the host, not CSS. A locked-height
    surface can still be clipped if the host actually shrinks its content window.
    Browser tests that only override innerHeight do NOT test that failure.
  - **One stable installed surface**: calibrate the actual launch window and hardware
    insets under the splash for at most one second. Seal immediately on blur/background.
    Do not accept temporary app-switcher widths or resume height growth. Focus, pageshow,
    taps and fullscreen events cannot recalibrate or request a new display mode.
    Only physical screen/orientation geometry changes allow recalibration.
    Home clears safe-top plus its design gap. Tray padding includes safe-bottom once;
    it has no additional safe-bottom offset. These rules are shared across display modes.
    CSS width units and canvas hit geometry read the same installed frame.
    Never substitute a hypothetical larger viewport or device screen pixels for the
    actual available launch window: that can clip the navigation outside the host.
    Support → Copy display report remains local and contains no save data or network calls.
  - **Android framed-window compensation** (`android-fullscreen #app`):
    the phone report on e95a5a0 showed a 914px full window with a 52px top cutout,
    changing to 838px with a 0px cutout while display-mode remained fullscreen.
    Freezing height alone kept the entire game below the new status-bar origin:
    the top gap doubled and the tray fell outside the visible window. The Android
    fullscreen surface now subtracts the withdrawn safe-top inset from its top.
    CSS env() updates the position with the host; the calibrated height, padding
    and all child dimensions stay unchanged. Browser tabs and other platforms do
    not get this compensation. Android still owns the appearance of its bars.
    Regression verification uses real Chromium safe-area overrides and an inset
    host window, checks unchanged screen coordinates for HUD, Play and tray, and
    clicks a tray button while framed. It must not just mock innerHeight.
    Tutorial geometry converts viewport rectangles into its overlay surface's
    coordinates; pointer hit testing keeps the original viewport rectangle.
  - **The manifest is precached, and a new build re-fetches it**: the worker's `install`
    adds the whole precache list from the network and `activate` deletes every other
    build's cache, so the change lands with the deploy. What it cannot do is re-install
    the app — Chrome may keep an already-installed PWA's display mode until it is removed
    and added again.
- **Every browser tool points at `/opt/pw-browsers/chromium`**, the stable symlink, never
  at a versioned path — four of them had `chromium-1194` written out and all four broke the
  day the container's Chromium moved.

**THE HOME ARTWORK IS A FILE — the only picture in the app that is not drawn**
(`src/ui/backdrops/`, `src/ui/backdrops.ts`, the `#home` rules in `skin.css`). The legacy
stylesheet carries its own artwork as a base64 JPEG, and `game.css` is a VERBATIM copy of
that sheet with a test comparing the two line by line (§10) — so the picture cannot be
swapped there. It is
overridden in `skin.css` instead, which also keeps the swap to one declaration.
- **BUNDLED FROM `src/ui/backdrops/`, never dropped in `public/`.** Vite hashes the name,
  so a cached picture cannot go stale; it emits a RELATIVE url under `base: "./"`, which is
  the rule the whole build follows (an absolute one points at nothing inside the Capacitor
  shell); and the service worker precaches everything the build emitted, so the artwork
  comes with the offline install rather than being the one thing missing from it.
- **ONE PICTURE PER REGION, AND THE FOLDER IS THE TABLE TWICE OVER**
  (`src/ui/backdrops.ts`). The screen a player opens every time said nothing about how far
  they had come, so the ground follows the road — and it follows it in the SAME five-chapter
  bands the board's ground does, because home and the match reached from it have to be the
  same place. `src/ui/backdrops/rg03.webp` IS the Volcano's, every chapter in region three;
  `src/ui/backdrops/ch07.webp` IS chapter seven's alone and BEATS its region. Both globs
  resolve at BUILD time, so dropping a file in with the right name is the WHOLE change, and
  the NUMBER is what is read (`rg03-volcano.webp` works and says what it is in a listing).
  - **ALL TEN REGIONS ARE PAINTED**, at 1200 x 2670 — a 3x phone at 430 CSS pixels asks
    for about 1290, so this is sized for the device rather than for the file that arrived.
  - **AND ALL FIFTY CHAPTERS ARE PAINTED NOW, which is what that tier was held open for.**
    It sat empty for months under the note that fifty pictures is not a set somebody
    paints and ten is, so a single rung deserving its own should cost one file rather
    than a change of shape — and what arrived was the whole road at once. The five in a
    region are the same SCENE: five ant mounds down a path, numbered with the chapters,
    the ones behind you lit and crossed swords on the one you are standing at. So home
    says where you are without a word on it, and the region still changes the world
    every five chapters.
    - **The test that guarded the empty folder was its own tripwire** ("the folder IS
      empty, and the day that fails is the day to write the real precedence test"). That
      day came; it is the precedence test now — every chapter resolves to its own file
      and to none of the ten bands, which is fifty chances to catch the two tiers being
      swapped. Same shape as the `SUPPORT_EMAIL` placeholder test, and the same ending.
    - **IT COST 5.3 MB OF THE INSTALL**, which is the one thing to know before painting
      fifty more of anything: the service worker precaches everything the build emits
      (§ PLAYING WITH NO NETWORK), so `dist` went from about 8 MB to **13.4 MB** and a
      player downloads forty-nine pictures they will not see this month. The honest
      alternative is to leave `ch*.webp` out of the precache and let each one be cached
      when it is first shown — offline on a chapter never opened then falls back to the
      painting `skin.css` names, which is a picture rather than a hole. Not done, because
      it is a change to the offline contract rather than to the art.
    - **The files are 841 x 1871**, which is what a phone asks for at about 1.4x upscale,
      and encoded at q84 — the same quality as the ten region grounds.
  - **ANYTHING WITH NEITHER FALLS BACK TO `home.webp`**, a painted PLACEHOLDER. That is
    what let the structure land before the art did, when all fifty wore it; nothing reaches
    it on the road any more, and it stays because `skin.css` names it directly — the screen
    is never bare if the script never runs.
  - **AND IT IS ANCHORED TO ITS FOOT, so only the TOP is ever cut** (`background-position:
    center bottom`). The files are 842x1871 under `cover`, which always fills the width —
    so a screen that is not the design's 360x800 loses HEIGHT, and centred that came off
    BOTH ends. Measured: 360x800 and 412x915 lose nothing at all, 390x844 and 430x932
    about 2.5%, 360x740 7.5%, and **320x568 and 375x667 twenty per cent** — a tenth off
    each end. The tenth off the bottom was the expensive one: every chapter picture paints
    its five mounds with the crossed swords on the one the player is standing at, and
    mound ONE is near the foot, so on a short phone the one thing the artwork exists to
    say was the first thing to go. Pinned to the bottom the whole cut lands on the sky,
    where there is nothing to lose. Held by a test, because the screen looks identical
    either way until a short phone opens it.
  - **It is set INLINE on `#home`, from the chapter the banner already names.** Fifty
    rules in a stylesheet for fifty files the stylesheet cannot see is a second table to
    keep in step — and `skin.css` still carries the default, so the screen is never bare
    if the script never runs.
  - **`backdropFor` takes the CHAPTER, not the colony.** Home already knows which chapter
    it is announcing; two places deriving that from the colony is two places to disagree.
- **THE BOARD'S GROUND IS PAINTED PER REGION, five chapters at a time** (`ui/regions.ts`,
  `REGIONS` in `platform/road.ts`). The ground a match is played on was DRAWN — soil, a
  clearing, rocks and ferns (`render/terrain.ts`) — and it was the same forest floor on
  chapter 1 and chapter 50. The road runs through ten places now: Forest floor, Desert,
  Volcano, Rainforest canopy, Mangrove wetland, Savanna grassland, Cave system, Permafrost
  tundra, Amber deposit, Fungal bloom.
  - **TEN AND NOT FIFTY.** Ten is a set somebody can actually paint, and a world that
    changed every chapter would change before the player had finished looking at it. Five
    chapters is roughly a fortnight of play (§8c).
  - **THE FOLDER IS THE TABLE**, the same rule the home artwork follows:
    `src/ui/regions/rg03.webp` IS the Volcano's ground, resolved by a build-time glob. The
    NUMBER is what is read, so `rg03-volcano.webp` works too and says what it is in the
    folder listing. **ALL TEN ARE PAINTED NOW**, each 841 x 1870, each to the template
    below — and they have been REPAINTED once since, in a bolder, flatter style with
    rounded slabs and heavier outlines. What matters about a restyle is that the TEMPLATE
    held: the grid was re-measured across the new ten and moved by six tenths of a file
    pixel, the painted rocks and seams are still on the engine's own cells, and the pips
    land on the painted sockets in all ten (checked in a browser, a match per region) — and the structure landed long before the art did, with every region falling
    back to `ground.webp` for as long as it took. That fallback survives for a region
    with no file of its own: nothing can reach it while the ten are there, which is
    exactly why it is a HALF-SIZE copy of the forest floor rather than a full picture —
    it has to be something rather than a broken board, and it must not cost a quarter of
    a megabyte the service worker precaches and nobody ever sees. It has been the game's
    own DRAWN floor exported through the tool below, and a painted placeholder, and is
    now a small copy of a real region; the rule is unchanged, only the file in it.
  - **THE PICTURE CARRIES THE GRID, AND IS PLACED BY IT** (`ART_GRID`, `groundAlign`).
    Every region picture is painted to ONE TEMPLATE: the nine-by-nine grid of cells
    occupies a known rectangle of the file, as fractions of its width and height. The
    renderer scales the picture until those painted cells are the size of the board's and
    centres it on them — so what lines the artwork up is the artwork's own grid, not the
    canvas. **This is what the board being 90vw is FOR** (§5, `BOARD_VW`).
    - **It is the reverse of the rule that stood here for months**, which is worth
      stating plainly because it reads as a regression otherwise: the cells used to be a
      LAYER the game drew over any picture (`paintChequer`), precisely because nothing
      said where in a file the squares would land. The template says. The chequer is the
      DRAWN floor's now and only the drawn floor's — over a picture it is two grids on
      one board — and the machinery that solved a mark's alpha against the luminance it
      landed on (`groundLuma`, `ART_STEP`) went with it.
    - **ONE SCALE, never two.** The cells average 82.8 across and 83.7 down — a bit over
      one percent off square — and stretching a painting to hide that is worse than the
      pixel it costs. The two scales are averaged and the grid is CENTRED on the board,
      so the error is split between opposite edges instead of landing all on one: a
      couple of pixels on the widest phone, inside the grout line between two painted
      slabs.
    - **AND IT IS RE-MEASURED WHENEVER THE TEN ARE REPAINTED.** That is the only way to
      know a new set was painted to the template rather than near it, and the measurement
      is cheap: a ten-line ladder fitted to each file's luminance, the mean of the ten.
      The restyle moved it from 0.0572 / 0.2939 / 0.8857 / 0.4027 to 0.0570 / 0.2936 /
      0.8850 / 0.4027 — under a third of a pixel on the board. That the number barely
      moves is the RESULT, never the reason to skip it.
    - **AND THE RECTANGLE IS THE MEAN OF ALL TEN, measured to the LINE CENTRES.** A
      ten-line ladder is fitted to each file's luminance, which answers with the middle
      of each painted grout line rather than the edge of the ink — and a cell boundary
      belongs on the middle of the line between two slabs. A row-by-row detector that
      found where the grid STARTS answered five pixels low at both ends, consistently,
      which is the thickness of the line. The ten files agree to about two pixels, so
      the rectangle is their mean; taking it off one would let that one file decide
      where the other nine sit.
    - **AND THE PICTURE CARRIES THE ROCKS AND THE GEM SEAMS TOO** (`Scene.painted`). The
      artist paints a blocked cell as bare ground in the middle of the slabs and a
      resource as a seam in one, exactly where the engine puts them — so `board.ts` draws
      neither over a painted region. Nothing about the RULES moved: a rock is still
      impassable and a seam still pays three a turn with its guard's shield still on it.
      - **They are the DRAWN floor's, not deleted.** The manual's figures illustrate both
        on the drawn floor (`rules.ts`), which has no rocks painted into it, and an
        unmarked blocked cell there is a square nobody can tell from open ground. Same
        shape as the chequer, and the same flag decides it.
      - **It asks whether the picture has LANDED, not whether one was asked for**
        (`groundPainted`). A file still decoding, or one that failed, leaves the drawn
        floor underneath — keyed on the request, a picture that never arrived would take
        the rocks off a board that has none.
    - **THE FRAME AROUND IT IS A VEIL WITH A HOLE IN IT** (`paintFrame`). The file is only
      a little wider than its own grid, so once it is pinned to the board it reaches the
      edges of the canvas by about a percent and no further. That is enough because the
      frame is FIXED — and it is why the camera had to go: three ways of filling an
      overhang were built and all three were worse than not having one. (A soft blown-up
      copy leaves a line down both sides where the artwork stops; REFLECTING the picture
      joins with no seam and carries the painted grid out with it, so the board looks four
      times its real size; a feathered veil works and is a lot of machinery for a second
      and a half of animation nobody asked for.) **A file with less margin around its grid
      than the forest floor's would show the plate's bare colour at the edges of the
      screen**, so that margin is part of the template too.
    - **A REGION IS PAINTED AT THE SIZE IT IS DRAWN AT.** The plate bakes at device
      resolution, so on a 3x phone the picture is drawn about 1,300 pixels wide; the
      region files are 841 wide and are upscaled to get there. Anything painted later
      wants to be around 1,300 x 2,900.
  - **A PAINTED REGION REPLACES THE SOIL AND THE SCENERY BOTH.** A picture has its own
    rocks and ferns; drawing ours over them is two forests at once.
  - **IT ARRIVES LATE, and the plate's cache key says whether it is HERE rather than
    whether it was asked for.** An image decodes asynchronously and every draw is
    synchronous, so the first frames of a match bake the drawn ground; when the file lands
    the key changes and the plate is baked again with it. Keyed on "asked for", the first
    bake would be kept for the whole match and the artwork would never appear. A load that
    FAILS is remembered as failed and never retried — a picture re-requested every frame is
    a request per frame, and the drawn ground is a perfectly good board.
  - **THE PLATE BAKES AT DEVICE RESOLUTION, never at CSS size.** `Layout.measure` scales
    the board's context by `dpr`, so a plate baked one canvas pixel per CSS pixel is blown
    up two- or threefold on the way in: on this phone the 1696x2000 picture was squeezed
    onto a 674x826 plate and then re-interpolated back to 1401x1652 on screen — half the
    detail thrown away and guessed back. It was invisible for as long as the ground was
    DRAWN, because soil and ferns are soft shapes with nothing to lose, and it is the whole
    picture once a region is PAINTED. `bake` sets a `dpr` transform and the blit is given
    the plate's CSS size, so it lands one real pixel per real pixel. It costs memory — a
    plate is four times the pixels on a 2x screen — and that is one cached canvas.
  - **And `drawSnapshot` hands its figures the same `dpr`.** A `Layout` built by hand
    defaults to 1, so the setup board, the manual's figures and the news pictures were
    baking their ground at half the resolution they are drawn at.
  - **A FLAT ILLUSTRATION HIDES THIS, so do not measure it with one.** The detail in the
    frame (mean laplacian over a ground-only band) was IDENTICAL to three decimals before
    and after — it was measured against the flat placeholder floor, which is colour and a
    few hard-edged rocks with no high-frequency content for a resample to lose. The defect is real
    regardless, and a painted or photographic region is where it would show.
  - **THE WHOLE FILE IS SEEN, so paint it to the shape of a phone.** It used to COVER a
    plate half as big again as the canvas in every direction, because the opening pulled
    a camera back through it; the camera is gone and the plate is the canvas, so the
    picture is placed by its grid and the rest of it falls where it falls. The region
    files are 841 x 1870 — about the shape of a tall phone — with the grid 29% of the way
    down and a little margin either side of it, and that margin is what reaches the edges
    of the screen.
  - **What crosses into `render/` is a URL**, never a region or a chapter: which picture
    belongs to which stretch of the road is a progression decision, and the renderer may
    not read one (§3). `app.ts` reads the colony, asks `groundFor(chapterOf(colony))` and
    hands the match a string.
- **THE BOARD'S GROUND CAN BE EXPORTED** (`npx tsx tools/mapshot.ts [out] [w] [h] [scale] [grid]`).
  It drives a real Vite server and a real browser against `render/terrain.ts` itself, so
  the PNG cannot drift from the board, and it draws the ground and NOTHING else — no tiles,
  no colonies, no veins, no hive, no chrome. It hands back the WHOLE plate, overhang
  included: the scenery is baked past the canvas so the opening camera never sees its edge,
  and cropping to the canvas would hand back less picture than the game has. The file type
  follows the extension — webp for anything that ships in the bundle, png for a picture
  somebody is going to paint over — and the CHEQUER IS OFF unless `grid` is `1`, because
  what this exports is a region picture. It is what made the first stand-in ground. A
  TOOL, not a build step, excluded from typecheck and lint like `tools/icons.ts` because it
  imports Playwright (§11).
- **THE PICTURE IS THE TITLE SCREEN, so it carries NO TITLE.** The wordmark and the
  tagline used to sit over it; both are gone. What is left brings its own ground: the
  banner, the granary pill and the three buttons are cards, PLAY is a solid slab. The name
  now lives on the cover over a cold boot (`#splash`), which is the only place it is
  still written.
  - **THERE IS A WASH AGAIN, and it is ONE END of the picture rather than all of it.**
    The old one was a tint over the whole artwork, ground for a wordmark that is gone, and
    it was darkening the thing it was there to protect. The design's is
    `rgba(0,0,0,0) 74.5% → rgba(0,0,0,.4) 82.3%`: the bottom fifth only, which is where
    PLAY and the tab bar sit on whatever a chapter's painting happens to put under them.
    It is written INLINE beside the artwork url (`App.renderHome`) and not in `skin.css`,
    because an inline style outranks the sheet — a wash written only there would be
    REPLACED by the per-chapter line rather than layered under it. `skin.css` carries the
    same pair as the floor for a screen whose script never ran.
  - **AND THE SLAB NEEDS ROOM UNDER IT.** `.homeplay` is `justify-content: flex-end`, so
    taking How to play out from under PLAY dropped the button by the whole of that line —
    about 37px plus the 14px gap above it — onto the band the tab bar is reserved in.
    Reported as needing a gap under it. It is 50px now, which is the design's own gap
    between the PLAY row and the bar.

**THE MATCH CHROME SHRINKS WITH THE SCREEN** (the MATCH block at the foot of
`skin.css`). Reported as the gameplay UI needing to be responsive on small devices, with
the fix attached: "make buttons smaller if needed so all fits".
- **THE BOARD CANNOT GIVE ANY GROUND.** It is 90vw exactly, because a painted region's
  own grid is scaled to that frame (§ THE PICTURE CARRIES THE GRID) — so the chrome is
  the only thing on a short screen that can yield, and the fallback if it does not is the
  canvas FITTING the square instead, which shrinks the playfield and takes the artwork's
  cells off the board's. Measured at 320x480: the bar was **239px of a 480 screen** and
  the board could not hold its square; it is **175** now and does.
- **A TALL PHONE IS UNCHANGED, and that is what "if needed" means.** Every clamp's UPPER
  bound is the size the bar already was and the `vh` term reaches it at about 760px of
  viewport, so the curve only ever takes something away. Measured chrome: 221 at 800 and
  915 (the surrender row alone), 202 at 667, 197 at 640, 185 at 568, 175 at 480.
- **THE FOUR ACTIONS NEVER GO UNDER THE TAP FLOOR.** `--tap` is a rule about a thumb
  rather than a measurement (§10), so it is the clamp's LOWER bound — written as the
  token, because a literal 44 is that floor spelled twice and the copy is what goes stale.
- **SURRENDER IS A LINE, NOT A TILE.** A full-width row the same height as the four above
  it: the most room on the screen given to the least used control in the game. Its mark
  and label sit on one line now, which is the single biggest saving and the one change a
  tall phone sees. It is the one control allowed under the tap floor — a wide row, rare
  and destructive, where a smaller target is the safer trade.
- **AND THE MARK HAS TO BE SIZED HERE TOO.** The shell fills each slot with
  `icon(name, 20)`, which writes width and height ATTRIBUTES onto the SVG, so without a
  rule the label shrinks under a mark that never does and the button ends up mostly
  picture.
- **AND THE BLOCK SLICER NOW BOUNDS ON THE DIVIDER, not on the next block's name.** It
  matched the words "DRAWN TO THE DESIGN", so this block — the first whose heading does
  not say that — was swallowed by the Antarium's above it and failed its sweeps. Same
  fault as the shop's unbounded slice, one marker further on. Every one of these blocks
  opens on a `=====` rule, so that is what ends the one before it.

**EVERY SCREEN, EVERY PHONE, EVERY TABLET — THE SWEEP, AND WHAT IT FOUND.**
Asked for directly: "check responsiveness for all mobile screens and sizes... that
includes tablet... everything should be visible and accounted for". Twenty screens were
driven through the real app in a browser at eleven viewports from 320x480 to 1024x1366,
reading back overflow, clipping, hit regions and whether anything ran past the fold with
nowhere to scroll. Most of what a sweep like that reports is noise and the triage is the
work — the deck is five slides side by side, so four of them are always off-screen; a
`::after` tap target inside a clipped box reports as an overflow; an overlay screen's
scroller is its `.screenbody` rather than the screen. What survived:
- **THREE CAPS WERE WIPED BY A `padding` SHORTHAND, and the whole tablet layout with
  them.** The responsive block caps the top bar, the side buttons and the tab tray to
  `--homemax` so a big screen gets the same composition as a phone. Three rules in the
  DESIGN blocks then set `padding` as a shorthand, which sets all four sides — so on a
  1024 screen the currency chips ran the full width with a lone "0" in the middle of
  each, the granary pill sat on the left edge, the menu button on the right and the
  five tabs came out 196px each, while the banner and PLAY sat correctly in their 640
  column. It is the third time a `padding` shorthand in a later block has quietly
  undone a rule written earlier, so the fix is a TOKEN the shorthand itself carries
  (`--homeside`), not a fourth `padding-inline` to be overwritten next time. `--navmax`
  is now `var(--homemax)` rather than a second 640.
- **THE ANTHILL'S CHAMBER NAMES WERE WRITTEN OUT PAST THEIR OWN CARDS, on every phone.**
  A card gets half of what is left after the shaft — 112px at 320 for a 44px disc, 34px
  of padding and the name — so "Metapleural Gland" overhung by 40px at 320 and the
  Granary overhung on every width in the list. The shaft, the card's inset, its padding,
  its disc, its gap and the name's own size all clamp down together below about 400px;
  every clamp's UPPER bound is the number that was already there, so a tall phone is
  unchanged. `--nest-stub` (the tunnel from the shaft to the card) is DERIVED from the
  shaft rather than written, or it points at thin air the day the shaft moves, and
  `overflow-wrap: break-word` on the name is the guarantee for the seventh chamber
  rather than the mechanism for these six.
- **AN INVITATION ANNOUNCED A WHOLE COLONY AS "P…".** The bar's first line was the name
  and "challenged you" side by side, with the VERB set `flex: none` — so the half that
  gave way was the name, ellipsised to one letter on a 320 phone. `duel.ts` said the
  opposite in a comment ("the NAME is the line that must survive") and had said it for
  as long as the bar existed. The verb is the same on every invitation there will ever
  be, so it reads at the head of the SECOND line now, with the board and the colony size
  behind it. One structure at every width rather than a breakpoint where the sentence
  has to be re-read.
- **TWO TAP TARGETS WERE BEING CLIPPED AWAY, and only a hit-test could see it.** The
  avatar is a 30px disc and the currency stepper an 18px mark; both carry the app's 44px
  floor on an invisible `::after`, which is the answer this file settled on long ago.
  Both boxes then clipped — the disc to round its picture, the chip for an ellipsis that
  lives on `.tn-num` anyway — and **an overflow clip is not hit-testable outside the
  clip**, so both targets were cut straight back to the box. Measured by sampling
  `elementFromPoint` across the page: the avatar answered taps over exactly 30x30. The
  rules all read as correct, the pseudo-element is invisible and `getBoundingClientRect`
  cannot see it, so nothing but a hit-test was ever going to find this. The crop moved
  onto the picture inside the disc; the chip simply does not clip. Six more controls
  carried a literal `42px` where the block they sit in exists to hold `var(--tap)`.
- **THE ODDS PANEL'S LONGEST TIER NAME RAN INTO ITS OWN BORDER.** Five tiles across a
  320px phone is 48.8 each and "Exceptional" is 46 of that, so the cell's padding was
  clipped away behind the label — on the one panel in the app that exists because a
  store requires it (§ LOOT BOX ODDS GO BEFORE THE PURCHASE), and on both screens that
  show it. The panel's side padding, the grid's gap and the cell's padding came down;
  the TYPE did not, because this block allows exactly four sizes and that is the whole
  point of it. Flat, not clamped — five tiles two pixels apart rather than three is not
  something a wide screen needs to look different about. **And the first attempt made it
  worse**: `overflow-wrap` alone, with only 0.4px of slack, broke "Exceptional" across
  two lines as "Exceptiona / l", which is the guarantee firing because the mechanism was
  not there yet. It is the guarantee for a SIXTH rung now, as it should have been.
- **AND THE LEADERBOARD'S TWO TABS WERE THE LAST PAIR UNDER THE TAP FLOOR**, at their
  own literal 36 — the one switcher in the app that was never added to the group every
  other tab and chip sits in. Found by hit-testing rather than by reading, like the two
  above it.
- **TWO THINGS WERE LEFT ALONE, on purpose.** The granary pill (28px tall) and the
  colony banner (41px at 320) are both under `--tap`, and both are the handed-over
  design's own boxes — the pill's `min-height: 0` is a deliberate override of the floor,
  already on record. They are wide, easy targets and the floor is about reach; an
  invisible `::after` on either would overlap the other's, which is a worse thing to
  introduce than the two pixels it buys.
- **AND WHAT WAS CHECKED AND IS FINE**, so it is not re-derived: the tab tiles are not
  clipped at 320 (that is the ledge, which has no blur and reads as a cut edge in a
  screenshot); the match screen fits 320x480 since the chrome clamps landed; the overlay
  screens all scroll; and the three bodies that ignored the reading column still honour
  it. `--page` is unchanged — on a tablet the type stays phone-sized and the COLUMN
  grows, which is the rule and is what a tablet is supposed to look like.

**AND THE GROUND IS THE WHOLE SCREEN, WITH THE CHROME FLOATING ON IT.** Reported from an
iPhone in one message with three faults in it: the top chips cut in half, the surrender
slab, and "that block with a button both on the bottom and the top should have transparent
background, now it's dark gray but it should be just transparent so the background is
visible".
- **THE DARK GREY WAS NOT A FILL. It was the PAGE, showing where the canvas stopped.** The
  header's and the footer's own gradients have been cleared by the blanket (§10) since the
  day it landed; `main` was a flex child BETWEEN the two strips, so the painted region only
  ever reached the band it was given and the rest of the screen was `body`. The canvas is
  `position: absolute; inset: 0` now and the two strips lie over it.
  - **THE BOARD IS STILL 90vw AND STILL CENTRED** (§5, `BOARD_VW`) — on the SCREEN rather
    than on the band, which is where a player reads it as being once the chrome is glass.
    Measured from 320x480 to 430x932: it clears the clock above it by 7px at the smallest
    and 148 at the largest, and the action row below it by 29 to 160. The 7 is a viewport
    no phone has (the shortest is 320x568, which clears 47) and nothing with a notch comes
    near it, because a notch pushes the chrome down while the board stays centred.
  - **THE PICTURE STILL COVERS, because it is pinned by its own grid** (§ THE PICTURE
    CARRIES THE GRID): the file is 1.21 board-widths across — 1.09 of the viewport — and
    about 2.4 viewport-widths tall, so a portrait phone cannot see past it. A region
    painted with less margin round its grid would show the plate's bare colour at the
    screen's edges now rather than at the canvas's, which is a bigger hole than it was.
  - **AND BOTH STRIPS NEEDED A `position`, which neither had.** They carry `z-index: 5` in
    the legacy sheet and nothing to apply it to, so the moment `main` became positioned it
    painted straight OVER them: the entire HUD behind the board. A z-index without a
    position is not a rule, and this is the second time that sentence has had to be written
    in this file.
  - **What stays FILLED is every chip and every button**, asked for in the same breath. The
    strips are the glass; the controls on them are objects, and a transparent button is one
    nobody can find.
- **THE CLOCK IS A CARD NOW, like the three chips above it**, asked for directly — "the
  timer bar with that text under should be wrapped in a block like the info above them for
  each player, just so we can see the timer better". It was a full-bleed band with a
  hairline under it, which is right over a dark page and wrong over artwork: a bright bar
  and a bright word written straight onto ten different paintings. It wears the chips' own
  face, border and radius — so it is read against two colours in this file, which is the
  decision the Colony Road's label plates are already on record for — and the bar's own
  track is its own dark with rounded ends.
- **THE HEADER CARRIES THE NOTCH, and the match screen is the one page that has to ask.**
  Every other screen is a `.screen`, which pads for `env(safe-area-inset-top)`; `.match` is
  `display: contents`, so its header is a direct child of `#app`, which pads for nothing.
  That is exactly why this screen never did it, and why the chips sat under the clock and
  the status icons with half of each one cut off.
- **SURRENDER IS A MARK IN THE CORNER, NOT A ROW** — "a small floating button above the
  other 4 buttons, on the corner". It FLOATS (`bottom: 100%` of the footer), so it costs
  the footer no height at all, and it is the mark ALONE until it is armed: the confirm is a
  second press on the same button, which has to say so, so the label appears with `.armed`
  and the pill grows into it. A control still has to name itself with nothing written on
  it, so the markup carries `title` and `aria-label` (§ EVERY CONTROL SAYS WHAT IT IS)
  rather than relying on a word that is `display: none`.

**A COLONY IS AN ANT, AND ITS NAME SAYS SO.** Six of the eight always did — Fire Ant,
Ghost Ant, Army Ant — and two were bare, "Leafcutter" and "Carpenter", which reads as two
kinds of thing in one list: a species beside a trade. A test holds the rule rather than
the two that were fixed, so the next colony added cannot arrive half-named.

**THE HOME SCREEN IS DRAWN TO A DESIGN, AND THE DESIGN IS THE SOURCE** (Figma
`Zombie Ants` → `03-home 2`, node `134:31`; the block at the foot of `src/ui/skin.css`).
Everything above it in that file is the app's older language — flat faces, no gradients,
no shadows, one green. Home is a different one now, handed over finished rather than
described, so the numbers in that block are the mock-up's own and are not to be rounded
to whatever was already there. Every box on the screen was measured in a browser at 360
and lands on the design's figure exactly.
- **THREE THINGS CARRY THE WHOLE LOOK**, and every control is built from them: a FACE
  (`--hud-face`, `#1c1e25`), a LEDGE (`--hud-ledge`, `3px 4px 0 #000`) and a GLOSS
  (`--hud-gloss`, `inset 0 2px 0 rgba(255,255,255,.4)`). The ledge has NO BLUR in it,
  which is the whole difference between a stamped tile and a card floating over a
  picture; the gloss is one inset hairline along the top edge and is why they read as
  convex. `--hud-go` (`#4ac707`) is the one bright thing on the screen: the colony
  banner, PLAY, and the tab you are standing on.
- **THE LEDGE NEEDS `!important`, and that is the THIRD time this file has earned it.**
  `*:not(.playbtn) { box-shadow: none !important }` is a considered decision that still
  holds for every other screen, and it cannot be unsaid from a later rule without
  matching its weight. Lose the `!important` on one rule and that control goes flat while
  everything round it stays raised, silently — so `css-sanity` reads every declaration
  that mentions `--hud-ledge` and fails on any that is not marked. The same goes for the
  text ledges on the two figures, which `text-shadow: none !important` blankets.
- **WHITE ON THE GREEN WAS 2.22:1, AND THE GREEN IS GONE FROM UNDER THE TEXT.** It was
  the design's own pairing on the colony banner and it was shipped as drawn, recorded
  here as Milan's call. The call came the other way for a different reason — the banner
  wears the same dark face as every other card now and the green moved onto the progress
  fill (see below) — and the figure measures **16.6** there. What is LEFT on the green is
  "PLAY", which carries no text ledge and is the one genuinely thin reading on the screen.
  Recorded rather than quietly corrected: it is the design's own slab.
- **THE THREE BUTTONS ARE LAID OUT, NOT MEASURED.** They were `position: absolute` with a
  percentage top, stacked at runtime by measuring the bar's bottom edge — `syncFabs`,
  deleted. The design draws them as a column on the right of a row whose left is the
  granary, which is an ordinary flex row, so the browser does it. One consequence: a
  band added to that block now PUSHES what follows down, where before a sibling laid out
  after `.tophead` landed underneath the buttons and could not be pressed.
- **THE BAR IS THE FIVE SCREENS IT HAS TILES FOR, AND NOTHING ELSE** (`NAV_SCREENS`),
  asked for directly. It rode eight more — the profile, the manual, Settings, News,
  Friends, Support, the hatch and the Colony Road, which is the legacy build's own list
  — and on every one of them the lit tile named whichever tab the player had come FROM,
  so the bar was lit for a screen that was no longer on the glass.
  - **AND IT HAD STOPPED HIDING AT ALL, which is how this was reported.** The legacy
    sheet hides it with `#mainNav.hidden { display: none }` — an id AND a class, which
    `#mainNav.homenav { display: flex }` in the design block MATCHES EXACTLY. A tie is
    settled by source order and `skin.css` comes second, so the bar stood across the
    bottom of the setup screen, the match and every page over the deck. Same trap as
    `#formation { display: flex }` one tie lower (§5), same fix — `!important` — and
    `hidden.test.ts` runs the real cascade, because reading either file shows nothing.
  - **THE MANUAL NEEDED AN ARROW THE DAY THE BAR LEFT.** It was dressed as a bottom-nav
    screen like the legacy build, with no back control at all — the five tabs under it
    were the way out. Without one it is a page a phone with no hardware back button
    cannot be left. `App.goBack` follows the arrow a player can see, so the hardware
    button lands in the same place by itself.
  - **AND THE DESIGN BLOCK MAY NOT GIVE THE BAR A `position`.** The legacy sheet pins it
    with `#mainNav { position: fixed; bottom: 0 }` — ONE id, which `#mainNav.homenav`
    outranks. A `position: relative` added so the shelf below could hang off it put the
    whole bar back in the flow at the TOP of the screen, lying over the colony banner.
    Being fixed it is already a containing block, so nothing was needed.
- **THE TRAY IS HALF A PLATE** (`#mainNav.homenav::before`), asked for directly. A
  full-height slab behind five tiles is a second rectangle around them; half of one is a
  shelf they stand on, which is what lets the artwork behind the bar still read as the
  screen. A background COLOUR on a pseudo-element, never a gradient — the blanket clears
  every background IMAGE on every `::before` with no exemption at all (§10).
  - **AND IT WEARS `--hud-gloss` LIKE EVERY OTHER FRAME**, asked for directly. It shipped
    with a face and no gloss, which is what made it read as a band of flat colour rather
    than as a ledge the tiles stand on — it was the one surface on this screen without
    one. `!important`, or the box-shadow blanket clears it: the same reason every
    `--hud-ledge` here is marked, and the half nothing but a test would notice.
- **THE TAB BAR LOST ITS WORDS AND NOT ITS NAMES.** Five labels across a phone is what
  made the tiles tall and the type tiny; the mark is the tab. Each button still carries
  `title` and `aria-label` (§ EVERY CONTROL SAYS WHAT IT IS) and `a11y.test.ts` fails on
  three separate tests if one goes. The "you are here" tick that used to hang six pixels
  above the active tab is gone with them — the tile is GREEN now, which is the loudest
  difference on the bar, and the tick was a second answer to a question already answered.
- **THE BAR AND THE ROOM RESERVED FOR IT ARE ONE NUMBER.** It grew 64 → 70, and the
  padding that keeps the last row from sitting under it is the only thing stopping it.
  Two places spelling out one rule (§7), so a test reads both and compares them.
  - **AND THE WHOLE DECK SCREEN SCROLLS, HEADER AND ALL.** Two reports, one cause. The
    legacy shape is `.screen > .screentop + .screenbody` with the BODY scrolling, so the
    title sat still while everything moved under it ("shouldn't be sticky, should scroll
    normally with the rest of the content") and the screen paid for the bar by SHORTENING
    itself — which left the scroller ending at the top of a bar that is transparent down
    to its half-height shelf, with a band of bare page between the two ("a black frame
    under the menu that is cutting off the content"). Neither showed on HOME, which is a
    fixed composition with nothing to clip and nothing that scrolls, which is why both
    survived the redesign and why home still takes the room as its own padding.
    - **Making the SCREEN the scroller answers both at once.** The header scrolls because
      it is inside the thing that moves, and the padding becomes room at the END of the
      scroll rather than a shorter box — so content runs to the bottom of the viewport and
      passes BEHIND the tiles, which is what every bottom bar on a phone does and what
      "only the buttons and the half tall frame" means.
    - **And nothing inside may scroll on its own.** An inner scroller takes the gesture
      and holds the page still: the header stops moving again and the dead band comes back
      one element down, wearing a different selector. The four are named because they
      differed — the shop and the Antarium scrolled their `.screenbody`, the Anthill a
      wrapper inside it and the Challenges list itself.
    - **The deck's swipe survives it** — `scrollableUnder` walks up from the touch target,
      and the screen is still an ancestor. Re-measured with real touch events (§9a): a
      vertical flick scrolls, a horizontal swipe turns the page both ways.
    - **AND A `padding` SHORTHAND IN A LATER BLOCK WIPED THE ROOM ONCE.** The Antarium's
      own design block said `padding: var(--block) 0`, which reads as "12 at the top" and
      silently sets the bottom to 12 as well — the last card went straight back under the
      tiles with every other rule here still correct. One side at a time.
  - **AND THE EIGHT SCREENS THE BAR NO LONGER STANDS ON RESERVE NOTHING FOR IT.** The
    legacy list is thirteen screens, from a build where every one of them showed the bar;
    it is the five deck screens now. On the other eight that padding was a 70px strip of
    nothing at the foot of the page — most visibly the Colony Road, whose sticky footer is
    meant to sit flush on the bottom edge and was floating clear of it.
  - Three of these are held by `css-sanity`, because nothing a jsdom test can see would
    notice any of them: there is no layout, the markup is identical, and only the cascade
    decides where a scroller ends.
- **THE CURRENCY CHIP'S LEFT END IS A SEMICIRCLE AND ITS RIGHT END IS THE BLOCK'S OWN
  CORNER**, both asked for. The mark at the left is a painted DISC, so a square-ish
  corner behind it is a second shape fighting the first; the right two are **7**, which
  is what the colony banner and the granary pill beside it carry.
  - **The right end was never changed by the left one, and it still read as squared
    off** — reported as the radius having been removed. It had not: it was the design's
    own 5, untouched. But 5 on a 30-tall chip is a tighter corner than anything else in
    that block, so "unchanged" and "looks wrong" were both true. Worth knowing before
    defending a number: a corner is read against its NEIGHBOURS, not against the file.
  - **AND THEN IT WAS SQUARE FOR REAL, AND THE CAUSE IS WORTH KEEPING.** The left end was
    written as `999px`, on the argument that a browser clamps a radius larger than its
    box. It does not. When the two radii on ANY EDGE add up to more than that edge, the
    spec scales EVERY corner of the box by the same factor — 999 + 999 down the left edge
    of a 30-tall chip is about one sixtieth, so the RIGHT corners came out at a seventh of
    a pixel. **`getComputedStyle` reports the value as WRITTEN, not as used**, so the rule
    measured as correct every single time it was checked, and the only way to see it was
    to count pixels in a screenshot — it was reported as square twice before that was
    done. It is `calc(15 * var(--u))` now: exactly half, because the chip is its mark (26)
    plus 2 of padding at each end, so the left edge sums to its own height and nothing is
    scaled. A test DERIVES that half from those two numbers rather than restating 15.
- **TWO FIXED SIZES NEEDED THE LEGACY SHEET OVERRULED, and neither shows in jsdom.**
  `.tn-coin` is pinned to `height: 26px` there — exactly the currency mark's own height,
  so the 2px of padding around it had nowhere to go and the chip clipped itself; it is
  `height: auto` now. And `.tn-id` is a 30px disc against the app's 44px tap floor, so
  the floor moved onto an invisible `::after` centred on it, which is the answer the
  currency steppers already use. Both are held by tests that read the stylesheet.
- **PLAY IS INSET 50px FROM THE SCREEN, written as `calc(50px - var(--gutter))`.** The
  row is already inside home's 12px gutter, so the design's number minus the gutter it is
  standing in is the honest way to say it. Escaping the gutter and padding a flat 50 was
  tried and costs the column: the responsive block caps this row at `--homemax` and
  centres it, which is what keeps PLAY the same width as the banner on a tablet.
- **THE BUTTON SAYS ONE WORD.** It read "PLAY 9x9" — the last place the player was told
  which board, after the screen that used to ask was removed (§ ONE BOARD). The design
  says PLAY. The size is a fact about a choice nobody makes any more, and the setup
  screen draws that board before a tile is placed on it.
- **THE COLONY BANNER CARRIES NO WORDS AT ALL, AND ITS BAR IS THE CHAPTER.** It printed
  "Chapter 12" over a hairline progress rule; both are gone, asked for directly. Three
  decisions, and the middle one is the only one that changed what the screen MEANS:
  - **No label.** The chapter was the one fact on this banner the bar itself cannot
    show, and it is said in full on the screen the banner opens. What is lost is home
    naming the chapter anywhere — the artwork behind it is still keyed on one.
  - **THE BAR MEASURES THE CHAPTER, NOT THE RUNG.** It ran 0 to 100% between every
    single checkpoint, so it swept the whole width five times a chapter and said nothing
    about where in the chapter the colony stood. It is `(rungs banked in this chapter +
    the fraction toward the next) / 5` now, so it fills one fifth at a time and is empty
    again on the first rung of a new chapter.
  - **AND THE FIFTHS ARE CUT BY FOUR REAL ELEMENTS, never a gradient.** A repeating
    gradient is the obvious way to rule a bar into fifths and is silently nothing here:
    the blanket clears every background IMAGE with `!important` and exempts four whole
    SCREENS, none of which a `.tr-cut` is (§10). A 1px hairline in the banner's own green
    is a background COLOUR, and it reads as a gap between five pieces over the filled
    part AND over the empty track.
  - **ONE HEIGHT DOWN THE WHOLE ROW, AND IT IS THE INK RATHER THAN THE EM BOX**
    (`--colink`), asked for directly — twice. The crossed swords mark was 21 against a 30
    figure, which reads as a small picture stuck on the front of a big number; matched to
    the FONT-SIZE instead, both the mark and the bar came back visibly TALLER than the
    digits, because an em box is always bigger than the glyphs in it. Reported exactly
    that way, with the fix attached: "count pixels if you have to".
    - **0.7385 IS MEASURED, not a cap-height table.** The ink box of the rendered text
      over its font-size, read off Poetsen One in a browser two ways that agree
      (`measureText`'s actual bounding box, and a 4x-supersampled pixel scan): **24.0 of
      32.5**, identical to four decimals for every shape `compact()` can produce — 40,
      940, 1.2M, 23K, 4.8B, 6T. Digits and the K/M/B/T suffixes are all cap height in
      this face and none of them descends, so one ratio covers the whole figure. It is a
      property of the TYPEFACE, so it is re-measured if the display face changes.
    - **The figure keeps `--colline` (the font-size) and the other two take `--colink`.**
      Two tokens rather than four numbers, for the reason `--vgap` is one: a copy
      satisfies an assertion about the number while being another chance for the rule to
      stop being true. Measured after: the mark and the bar land **within a pixel under**
      the digits at 360 and 390, rather than a pixel and a half over.
    - The bar's corner is 2px, because the old 30px pill rounded five hard-edged fifths
      back into one object.
  - **AND THE GREEN IS IN THE BAR, NOT ON THE PLATE**, asked for directly. The banner was
    `--hud-go` with a cream fill on it; it is `--hud-face` now, the same dark card as
    everything else on the screen, and the design's one bright colour marks the thing
    that MOVES. The dividers went BLACK with it — the track's own colour, so the empty
    part of the bar reads as one piece and the cuts show exactly where they matter,
    across the green. The cost is that a nearly-empty bar shows no fifths at all, which
    is the right trade: there is nothing there to divide yet.
  - **AND THE FILL CARRIES AN INNER BAND A THIRD OF ITS HEIGHT**, asked for directly —
    the same idea as `--hud-gloss` and far taller, so the fill reads as a solid bar with
    a lit top rather than a flat rectangle of colour. `!important`, or the blanket clears
    it (§10), which is the half nothing but a test would notice.
- **THE INK IS A WARM CREAM, `--hud-ink` (`#fcf7e6`), not white.** The first frame set
  every figure in white; the drawer frame that followed sets all of them in the cream,
  which is the colour the artwork itself is lit in — a pure white figure on a painted
  ground reads as a sticker laid on top of it. One token, because it is on nine things.
- **AND THE WHOLE COMPOSITION SCALES WITH THE SCREEN** (`--u`, one design pixel). The
  mock-up is a FIXED 360x800 frame, and left at its own pixels it was a 360-sized HUD
  sitting in whatever the phone happened to be: measured in a browser, at 320 it crowded
  the picture and at 430 it floated in it — the granary pill a 163px island, PLAY a thin
  bar, the colony figure small inside its own banner. `--u` is
  `clamp(.875px, 100vw / 360, 1.2px)` and every box on home is written
  `calc(N * var(--u))` with N the design's own figure, so **360 reproduces the mock-up to
  the pixel** and everything else is the same picture at a different size. Measured at
  320 / 360 / 375 / 390 / 412 / 430: nothing overflows at any of them, and 360 lands on
  the design's numbers exactly.
  - **IT IS NOT `--page`, and both rules stand.** `--page` is the READING column for the
    screens that are a list of cards, and its rule is that the column grows and the TYPE
    DOES NOT — right for a 15px label. Home is the opposite kind of screen: one picture
    with a HUD drawn over it in fixed proportions, where type that did not grow with the
    boxes around it is the thing that reads as wrong.
  - **`zoom` and `transform` are both out**, for the reasons already on record: `#app` is
    `position: fixed` with the bar fixed inside it, and a fixed box under `zoom` is sized
    in scaled units against an unscaled viewport; a transform scales the paint and not
    the layout.
  - **THE TAP FLOOR DOES NOT SCALE.** `--tap` is a rule about a thumb rather than a
    measurement off the mock-up, so the three side buttons carry `min-width/min-height:
    var(--tap)` — at the bottom of the scale 48 design px is 42 real ones. Everything
    else here is either over 44 at every scale or carries its target on an invisible
    `::after` (the avatar, the currency steppers).
  - **THE TRAY HAS ONE MEASURED FOOTPRINT.** `--navh` derives from the scaled tile
    height and its padding; `--nav-space` adds the device's bottom inset once.
    Home and every scrolling deck screen reserve that same footprint.
  - **A TEST MAY NOT ASSERT THE BARE NUMBER.** `dp(prop, n)` in `css-sanity` builds the
    `calc(N * var(--u))` pattern, because asserting `height: 24px` passes just as well
    against a rule that has quietly fallen off the scale — which is the regression worth
    catching.
- **ONE VERTICAL GAP DOWN THE WHOLE TOP BLOCK (`--vgap`, 8), asked for directly.** The
  mock-up spaces it three different ways — 5 under the bar, then 5 + 5 + 8 stacked
  between the banner and the buttons, then 16 down the button column — which measured out
  as **5 / 18 / 16** and read as three decisions rather than one. It is one number
  everywhere now and it rides `--u` like everything else, so the gaps stay equal at every
  width.
  - **TWELVE FIRST, THEN EIGHT, both asked for directly.** Uniform at 12 (10.7 at 320,
    14.3 at 430) read as too much air at the top of the screen. Eight is the design's own
    smallest vertical step between the HUD rows, and measures **7.1 at 320, 8 at
    360 and 9.6 at 430**.
  - **IT IS A TOKEN, not the number written in four places.** "Uniform" is the rule, and
    four copies of `8 * var(--u)` would satisfy an assertion about the NUMBER while being
    four chances for the rule to stop being true. The test names the token.
  - **THE CURRENCY ROW HAS NO VERTICAL PADDING.** Home owns the top edge through
    `--home-top`; a second 8px pad on the transparent row was the persistent top gap.
    Its horizontal padding still follows `--homeside`.
  - **The banner carries a TOP margin only.** What sits under it is the granary row, whose
    own top padding is that gap; a bottom margin here would be one number spelled twice
    and the two would add.
  - **AND IT ALIGNED THE PILL WITH THE BUTTONS.** The mock-up puts the granary pill 8px
    HIGHER than the burger (107 against 115), because the pill's column has no vertical
    padding and each button's own box carries `py-8`. They share one top edge here — a
    deviation, flagged and kept.
- **ONE TOP CLEARANCE AND ONE TRAY FOOTPRINT.** `--hudgut` is the scaled 12px side
  margin. `--home-top` adds that design margin below the hardware safe-top inset.
  The currency row adds no further top padding.
  - The tray sits at the frame bottom (`--nav-bottom: 0px`). Its bottom padding is the
    larger of the home-indicator inset and the scaled design gap plus black ledge.
    The hardware inset is included once, never added below an already padded tray.
  - The tray height comes from its actual tile height and both padding values.
    `--nav-space` reserves exactly that height on each
    deck page. Tiles use the shared tap minimum, overriding the legacy 52px floor that
    overflowed the scaled tray on narrow phones.
  - The drawer shares `--home-top` so it moves with the home controls.
- **THE AIR UNDER PLAY IS THREE OF THAT INSET**, asked for directly in the same breath —
  "the gap between the play button and bottom menu is too big, it should be roughly side
  margin times 3". Written as three gutters rather than as the 36 that comes out, because
  the whole point is that it is the SAME number as the margin round the screen, counted
  three times; minus the row's own 8 of padding, because what the eye reads is the gap
  between the two BOXES and the padding is already inside it. (The inset itself is the
  top and the sides only — see above for why the bottom is the phone's.) Measured: **32 at 320 wide,
  36 at 360, 39 at 390, 43 at 430**, and the same at every height.
  - **WHAT IT REPLACED WAS A SHARE OF THE HEIGHT, and that is the lesson.** The design
    puts PLAY's foot 128px off the bottom of an 800 frame, which is 16% of it, so the gap
    was what was left of `16vh` once the bar and the padding had taken theirs, floored by
    a straight line through 8px at 568. It held the button in the design's PROPORTION at
    every height and was measured at five of them — and a proportion of a screen that is
    not 800 tall is most of a quarter of it between the button and the menu, which is
    exactly what came back. An INSET is the honest thing to measure air by; a share of
    the viewport is not.
- **HOME CLEARS THE CAMERA ONCE.** Its top padding is `--home-top`, and the top
  block's legacy negative margin is reset. Neither the currency row nor a fullscreen
  override adds a second top margin.

**THE DRAWER IS DRAWN TO A DESIGN TOO** (Figma `05-menu-drawer 3`, node `245:1249`; the
block at the foot of `skin.css`). It is the same screen with the burger open, so it is
the same three things — and the one that is missing is the point.
- **NO GLOSS ON THE PANEL.** Face and ledge, and nothing along the top edge: the drawer
  is a hole cut in the screen rather than a tile standing on it. The ROWS carry a 5% white
  of their own instead, which is the only fill in the app that is not one of the three.
- **ITS POSITION SHARES HOME'S CLEARANCE.** The drawer's scaled top-block offset is
  158px after removing the currency row's old 8px padding, plus `--home-top`.
  It has no separate notch addition or fullscreen override.
- **A ROW IS 24px TALL AND ITS MARK IS 30.** That is the design's own arithmetic: the
  icon stands a little proud of the plate at both ends, and the 16px gap is what leaves
  room for it. Neither number moves without the other.
- **NO SCRIM.** The wrapper still covers the screen — that is what closes the drawer on
  a tap outside — it simply no longer paints over the artwork, which is the thing the
  design wants seen behind it.
- **HOW TO PLAY STAYS, which the mock-up's list does not show.** The drawer is the only
  route to the manual (§ THE HOME ARTWORK), so dropping the row to match a seven-item
  list would make it unreachable from anywhere in the app.

**THE SHOP IS DRAWN TO A DESIGN, AND WHAT IT IS BUILT FROM IS NOW SHARED** (Figma
`06-07-shop 2`, node `134:158`; the SHOP block at the foot of `skin.css` and the SHARED
DESIGN LANGUAGE block on `:root`). Home was handed over as a finished mock-up and its
numbers stayed home's; the shop is the second screen drawn that way, and the request
that came with it was the important half — "some things should be uniform for all
screens like font size, gap, corner radius".
- **SO THE PIECES ARE TOKENS, NOT NUMBERS.** `--hud-card` (#282930) is a card, lighter
  than the chrome it sits on, which is what lets a tile read as something ON the page
  rather than as a hole cut in it; `--hud-well` (#12151c) is darker than both, for the
  one panel that is a disclosure rather than a thing to press; `--hud-dim` is the
  secondary ink. Two radii and only two — `--r-card` (7) and `--r-btn` (5), the button
  inside the card. Four type sizes and only four — `--fs-label` (8), `--fs-small` (10),
  `--fs-body` (12), `--fs-title` (14). Two gaps — `--block` (12) down a screen and
  `--inrow` (8) across a row.
  - **AND THE SWEEPS ARE THE RULE, not the single assertions.** "Uniform" is a fact
    about the FILE, and a literal `font-size: 11px` typed into one card renders
    perfectly — nothing a jsdom test can see would ever notice. `css-sanity` reads the
    whole shop block and fails on any type size that is not one of the four, and any
    radius that is not one of the two (or `999px`, which is not a third number: it is
    "round this as far as the box allows", which a browser clamps for itself).
- **IT DOES NOT RIDE `--u`, and that is the rule already on record twice.** `--u` is
  HOME's — one picture with a HUD drawn over it in fixed proportions — and `--page` is
  for every screen that is a column of cards, where the COLUMN grows and the TYPE DOES
  NOT. The shop is the second kind.
- **THE SHELVES ARE A FOLDER** (`src/ui/shelf.ts`, `src/ui/shelf/`), the fifth time:
  `shelf/mycel-220.webp` IS the 220-mycelium tile, resolved by a build-time glob.
  - **THE KEY IS THE PRODUCT ID WITH ITS DOT HYPHENATED**, because a dot in a filename
    is an extension to everything that will ever touch this folder — the glob's own
    name pattern stops at one. `shelfKey` is the single place that rule lives, asked of
    by the lookup AND by the test, or the two would spell it twice and agree by luck.
  - **A MISSING FILE IS NOT A HOLE**: `shelfArt` answers null and the tile draws the
    currency's own chrome mark, which is already painted. That is what let this screen
    land before a single shelf existed — a shop showing its currencies at 70px is a
    shop mid-redesign, where one showing nine empty boxes is a broken one. **It is also
    why a shelf that was painted and is not shown is INVISIBLE**: the fallback looks
    identical. `shelf.test.ts` holds the naming from both ends — every product can be
    painted, and no file in the folder belongs to nothing.
- **THE ODDS PANEL IS DRESSED ON BOTH SCREENS THAT SHOW IT.** It is one panel
  (`ui/odds.ts`) on the hatch, where the roll is, and in the shop, where the PURCHASE
  is — which is the store requirement it exists for (§ LOOT BOX ODDS GO BEFORE THE
  PURCHASE). Dressing it on one would leave the other wearing whatever the legacy sheet
  gives it, which is the compliance half of the app looking like a different app. It
  gained a `.ho-rows` wrapper so the five tier cards can be a five-column grid.
- **A SOLD-OUT PRICE DARKENS ITS FILL, never its opacity.** The legacy `[disabled]`
  rule drops a control to .7, which on a lit card reads as the button having gone
  missing rather than as one that is not for sale — exactly the lesson the hatch's own
  button is on record for, and the half nothing but a test would notice, since the
  attribute is set either way and only the cascade decides how it looks.
- **THE HEADING LOST ITS BACK ARROW, like Challenges.** The shop is a deck screen; the
  way out is the tab bar. `buildShop` takes the store and the gateway and nothing else.
- **THE DAILY GIFT'S CARD CARRIES NO WORDS**, so the thing that says what it is, is the
  BUTTON (`title`/`aria-label`) — which §EVERY CONTROL SAYS WHAT IT IS asks for anyway.
  Two tests that found the gift by text on the card had to be repointed at it.

**THE ANTARIUM IS DRAWN TO A DESIGN** (Figma node `134:305`; the ANTARIUM block at the
foot of `skin.css`). The third screen handed over finished, after home and the shop — and
the first one where the SHARED DESIGN LANGUAGE was already there, so almost nothing new
was needed: the card face, the well, the two radii, the type sizes and the two gaps are
all tokens.
- **A COLONY IS A TILE OF ITS RARITY'S COLOUR**, and that is the one thing the language
  could not supply. `TierDef.fill` is the rung painted as a SURFACE rather than as ink —
  `colour` is what a rarity is WRITTEN in (a dot, a border, a word, read against the page
  and tuned to clear AA there), `fill` is what a whole tile is PAINTED in, where nothing
  is read off the colour and a muted ink reads as a dull rectangle rather than a rarity.
  - **IT IS NOT A SECOND LADDER.** It is one rung in two jobs, in the ONE table
    (`engine/tiers.ts`), which is the whole reason it lives there rather than being mixed
    at each call site — the fault § ONE RARITY LADDER exists to prevent. `platform`'s copy
    is derived, and a test holds that too.
  - The five fills were MEASURED off the design frame (`#2edd1c` / `#0187fa` / `#b116ed` /
    `#fa031e`), and a test holds that no two rungs share one and that none is GREY —
    because grey is what a colony you do not own is, so a grey fill would say "locked" on
    a colony the player bought.
- **THE LEVEL IS A BADGE IN THE TILE'S CORNER, and 0 means "not yours".** It is the one
  value an owned colony can never show, because buying one IS the first level
  (`levelOf`): 0 locked, 1 on purchase, a rung per research level after. The grey tile
  beside it is the same sentence said in colour. `min-width`, never `width` — a two-digit
  level has to widen the badge rather than overflow it.
  - **The banner's RUNGS ARE THE BADGE, DRAWN LONG.** One square per level the colony can
    reach, lit as far as it has come — asked for directly, "there should be 16 of those
    green squares showing the level". It was research-out-of-fifteen for a day, which put
    a badge reading 1 over a bar with nothing in it: two readings of one number that did
    not agree. The count is `LEVEL_MAX`, derived rather than typed — the design drew ten
    and the ladder is sixteen, and a bar written out would quietly stop one square short
    of a level a player can reach the day the research tree is retuned. They share the
    row's width, so retuning it moves the rungs rather than overflowing them.
  - **The top is 16, not the 12 that was asked for**, because 15 research levels plus the
    one for owning it is where three equal tracks land. Shortening the tree to make 12
    exact would re-open the economy (§8c: pheromone's only sink is this tree), so it was
    left and said out loud rather than changed quietly.
- **THE PICTURE IS NOT THERE YET, ON PURPOSE** (`src/ui/cards.ts`, `src/ui/cards/`), asked
  for directly — "you can just add colored background and later we place portraits on top
  of it". The folder is the table for the sixth time, and **the drawn head is deliberately
  NOT the fallback**: it is sized for a 40px row, and blown up to fill a 108px tile it
  reads as a mistake where a flat colour reads as a tile waiting for its picture.
  - **It is DIFFERENT ART from `src/ui/faces/`.** A face is a 512 square close crop of the
    head for a row beside a name; this is a full body on a coloured ground, bleeding to
    the tile's edges. Same reason the covers and the faces are two sets.
- **THE CARD IS THE TILE WITH ITS NAME UNDER IT, and the card itself is nothing** — no
  face, no padding, and the LEDGE belongs to the tile. A ledge on the card would draw a
  box around the pair and turn the name into the bottom half of it.
  - **AND THE CARD HAS TO STRETCH ITS TILE.** The legacy `.ccard` rule CENTRES its
    children, so a tile whose only content is a colour sized itself to that content and
    came out ZERO WIDE — every card on the screen was a name with nothing above it, on the
    first build of this. jsdom has no layout and the markup is identical either way, so
    `css-sanity` reading the rule is the only thing that can ever see it.
- **THREE THINGS WENT, and each was the same fact said twice.** The rarity WORD on the
  banner (the tile under it is painted in that rarity and the section is headed with its
  name); the rule drawn between a heading and its count; and the VEIL that printed a price
  on every locked card — eight prices on screen at once, none of them pressable. A price
  is a thing to act on, so it is on the one control that can act on it.
  - **The header's purse went with them**, because the design's header is the title alone.
    What the player spends is named by that call to action.
- **AND BOTH HALVES OF A TIER HEADING TAKE ONE INK.** The legacy sheet colours the name and
  the count separately — cream and green — so a line that is two short words read as two
  different kinds of fact. Another cascade-only rule, held by a test for that reason.
- **`--fs-hero` (22) IS A FIFTH TYPE SIZE and it is not a label.** It is the one line on a
  screen that is a NAME, set in the display face and read first; the banner is the only
  thing wearing it. `--hud-lock` (#696b72) is beside it: a locked tile is that grey
  whatever rung it sits on, which is why it is a token rather than a sixth entry in a
  ladder it is not part of.
- **The design-block sweeps are BOUNDED AT BOTH ENDS now.** They run from a block's marker
  onwards, so the shop's unbounded slice swallowed this block the day it landed and failed
  it for the shop's rules. A design block runs from its own marker to the next one.

**THE PAINTED CHROME MARKS** (`src/ui/hud/`, `ui/hud.ts`, `hudMark` in `chrome.ts`).
Every mark in the chrome was DRAWN — `ui/icons.ts`, one family of solid shapes on a 24
grid in `currentColor`, which is what stopped the bar looking like a row of emoji from
seven illustrators (§10). The redesign paints them, and only them.
- **THE FOLDER IS THE TABLE**, the fourth time: `src/ui/hud/shop.webp` IS the Shop tab's
  mark, resolved by a build-time glob, and the name is the one `icons.ts` already uses for
  the drawn one. Painting a mark is dropping a file in.
- **AND A MISSING FILE IS NOT A HOLE.** `hudIcon` answers null and the caller draws what
  it always drew. That is the only reason this could ship a batch at a time — the five
  tabs landed first and the rest of the chrome went on being drawn, which is a screen
  mid-redesign rather than a broken one.
- **IT ANSWERS WITH TWO DIFFERENT TAGS, so every box sizes BOTH** — an `<img>` where the
  mark is painted and an `<svg>` where it is not. This is the trap the match history
  already paid for once (§ A COLLECTION CARD), and `css-sanity` sweeps it: any rule under
  `#home`, `#mainNav` or `.menudraw` that sizes a bare `svg` must have a `.hudmark`
  sizing rule for the same box, in that rule or another.
- **THE TWO TAGS ARE NOT THE SAME SIZE**, which is why `hudMark` takes two numbers. The
  design draws a 36px picture inside a 48px button; the burger glyph at 36 is three bars
  filling the tile. The painted size is the design's and the drawn one is what it was
  tuned at, written out only where they differ.
- **They are 100px square**, which is 2.5x the 40 the tabs draw them at — exact on a 2x
  screen and a mild upscale on a 3x one. Anything painted later wants 120.
- **THE SET IS COMPLETE — all twenty files, every mark the chrome asks for.** The five
  TABS, the colony's crossed swords (`swords`, which the granary pill wears too), the two
  CURRENCIES and the stepper's `plus`, the three side buttons (`menu`, `calendar`,
  `brood`) and all eight drawer rows. It arrived over four batches and the app shipped
  between every one of them, which is what the null fallback is FOR.
  - **AND THE TEST TURNED ROUND WITH IT.** While marks were arriving a batch at a time,
    the thing to hold was the TABLE — a name with a file answers a painting, one without
    answers the drawing — and `hud.test.ts` could only pin the tabs. Complete, the
    fallback is the thing to guard AGAINST: a file lost to a rename or a bad glob would
    put one flat glyph in a row of paintings, which looks broken rather than unfinished.
    So there is now a test of what is OWED, naming the marks the three calling sites ask
    for. It is written out rather than globbed off the folder — the folder IS the glob's
    input, so a test that read it would pass against a folder holding one file.
  - **A TEST MAY NOT NAME THE TAG, and one did.** `meta.test.ts` asserted `.col-pay svg`
    for the colony banner's reward mark. That held for exactly as long as the currencies
    were drawn and failed the day they were painted, with the rail perfectly correct —
    the same two-tag trap the stylesheet is swept for (§ A COLLECTION CARD). What a box
    owes is A MARK: `svg, .hudmark`.
  - **AND A MARK IS REPLACED BY DROPPING THE NEW FILE IN, which is the point of the
    table.** Both currency marks were repainted and the whole change was two files at
    `src/ui/hud/mycel.webp` and `.../pheromone.webp` — no code, no test, no name. **Which
    file is which was settled by COLOUR, against the ones already there**, not by looking
    at them: `mycel` is the PURPLE one and `pheromone` the BLUE one, which is the
    opposite of what the names suggest to anybody who has not checked. A mean-RGB
    comparison answers in a second and swapping the two would be invisible to every test
    in the suite.
  - **A PICTURE IN THE CONVERSATION IS NOT A FILE, and that cost two rounds.** Three
    batches were sent and were perfectly visible in the chat while nothing whatever
    existed on disk — a sweep of the whole container found only this session's own
    screenshots. The ones that landed arrived with an explicit path attached
    (`images/58.png`), and that is the entire difference. Worth knowing before telling
    anybody their artwork has been received: LOOKING at it proves nothing.
  - **A MARK IS PAINTED IN THE CHROME AND STILL DRAWN IN THE BODY, deliberately.** `brood`
    is an `<img>` on the hatch button and an `<svg>` in the shop's row, the result card
    and the Leaderboard's prize column; `gear` likewise in Support's build row. The painted
    set is chunky colour art sized for a 36px tile, and the same picture at 15px inside a
    line of text reads as clutter where a flat glyph reads as punctuation. `hudMark` is the
    chrome's; `icon` is the body's, and the two are not going to converge.

**THE DISPLAY FACE IS POETSEN ONE** (`public/fonts/poetsen-one.woff2`, the second
`@font-face` in `index.html`). Supplied as a TTF and converted; it is OFL, and the licence
travels beside it, which is what that licence asks for.
- **It is OURS like Nunito is** — shipped with the build and precached, so nothing about
  rendering the first screen leaves the device (§ THE TYPEFACE IS OURS). The test that
  held this used to spell out `nunito-latin.woff2` twice, so the day a third face landed
  both went on passing while saying nothing about it; they read the `@font-face` block as
  the table now and check every url in it ships and is precached.
- **NO `unicode-range`, because it is not the body stack.** It is asked for by name on the
  handful of things the design sets in it, and a glyph it does not carry — a colony named
  in another alphabet — falls through to Nunito behind it in the same declaration.
- **`font-display: block`, not `swap`**, which is the one considered choice in it.
  Everything this face sets is LARGE and sits in a box sized by the design, so a swap is
  not a subtle reflow: it is the screen re-laying itself out a beat after the player is
  looking at it.
- **And it ships ONE weight, so nothing may ask for 900.** Asking a browser for a weight
  a face does not carry is telling it to smear the glyphs sideways itself; every rule
  that sets `--font-display` sets `font-weight: 400` with it.
- **HOW TO PLAY IS NOT WRITTEN ON THE ARTWORK ANY MORE — it is in the DRAWER**
  (`MENU_ENTRIES`), asked for directly. It was the one control in this app written
  straight onto a picture, and a manual is somewhere you go to look something up rather
  than an action the title screen offers; home is left with the ONE action it exists for.
  What it cost is worth keeping, because it is the only time this problem has come up: in
  the app's pale `--ink-soft` it measured **1.7:1** against the sand — a control the
  player cannot read (§ CONTRAST IS MEASURED) — so it was DARK ink with a soft light halo
  at **5.8:1** and no fill, a pill under PLAY being two things shaped like buttons on a
  screen that offers one action (§10). `.howtolink` is gone from `skin.css` with it;
  `game.css` still carries the legacy one, the same way it still carries `.homemark`.
- **AND THE LUCKY HATCH CAME THE OTHER WAY**, out of the drawer onto a third floating
  button under the Daily one. It pays the one currency nothing else pays, and six rows
  down a list most players open once a week is not where that belongs. Three rules:
  - **It IS the daily button, twice over.** It carries `.dailyfab`, so the size, the
    label, the press, the right edge AND the colour come from one place rather than from
    a copy; `.hatchfab` is a hook the tests find it by and carries no style at all.
    - **It was given the menu button's dark FACE first**, on the argument that gold on
      home means "something is waiting" and two gold buttons stacked is neither of them
      saying it. What that actually looked like was reported at once: a button whose
      BOTTOM had gone missing. The ledge is what says a thing is solid here (§10 — the
      PLAY button keeps its ledge and nothing else does), and a dark ledge over a dark
      painting is no ledge. The argument was about colour and the answer was about depth.
  - **`syncFabs` stacks whatever it finds, in DOM order.** It named the two buttons and
    placed each by hand, under a comment promising that another one would be another step
    down the same column — this is what that promise cost, and it is shorter than the two
    lines it replaced. Only the DAILY is sized by the stylesheet; the others are squared
    off its measured box, so the column is one width whatever is in each button.
  - **It is shown BEFORE chapter 10, when the screen behind it is still shut.** That
    screen NAMES the chapter rather than drawing a padlock, which is the rule the
    granary's levels and the inventory row already follow — and a button that appears
    only once a feature is open is one nobody knows is coming.
  - `ui/__tests__/routes.test.ts` holds both ways in, because a route is exactly what
    nothing else notices: every other test opens these screens through the router rather
    than through the app, so a screen reachable from nowhere stays green.
- **A GRADIENT CANNOT BE PAINTED ON `#home::after` WITHOUT EXEMPTING IT** from the blanket
  that clears every background image (`*:not(#home), *::before, *::after`) — a gradient IS
  a background image, so a wash written there is a flat colour or nothing at all,
  silently. Worth knowing before writing one back.
- **A second `#home` block is why `css-sanity` reads EVERY rule for a selector** and not
  the first one it finds. `rulesFor` exists for that: the artwork is written in the HOME
  section and the gutter in the responsive one, and a helper that stops at the first block
  asserted against whichever happened to come first in the file.

**PLAYING WITH NO NETWORK** (`platform/offline.ts`, the worker generated in
`vite.config.ts`). The game is a static bundle and a save on the device — it never needed
to be online — and yet a tunnel gave a blank page. The worker is GENERATED BY THE BUILD
because only the build knows the content-hashed filenames it has just emitted.
- **THE DANGEROUS BUG THIS DESIGN AVOIDS: `version.json` is NETWORK ONLY.** `freshness.ts`
  reads it to notice a newer build; a worker that answered it from cache would tell the app
  it is current for ever and pin the device to a stale bundle — the exact bug freshness
  exists to fix, made permanent and far harder to see. Verified in a browser by landing a
  new build on the server behind a live worker and watching the app take it.
- **Navigations match with `ignoreSearch`.** The app reloads itself onto `?v=<commit>` after
  a deploy, and matching with the query would miss the cache on exactly that launch — the
  one most likely to be offline.
- **Everything else is cache-first**, which is only safe because Vite hashes the names: a
  name that is in the cache cannot be stale.
- **The install adds files ONE AT A TIME.** A single 404 in `addAll()` throws the whole
  install away and leaves the player with no offline game at all.
- **The fonts are cached opportunistically**, not precached: Google's CSS is not ours to
  make an install depend on, and an opaque response is still worth keeping.
- The worker has no module to import, so its rules are asserted against the generator's
  SOURCE with the comments stripped — crude, and better than leaving the most damaging
  failure in the feature held by nothing.

**THE COVER OVER A COLD BOOT** (`#splash` in `index.html`, `platform/splash.ts`). `#app` is
empty until the bundle has been fetched, parsed and run — a bare dark rectangle for most of
a second on a phone, after a white flash of the shell's own on Android. Nothing said the
game was starting; it looked broken for a moment.
- **It is in the DOCUMENT with its styles INLINE**, and it has to be both. Anything the app
  builds arrives at the moment the app does, which is the moment this stops being needed;
  and `skin.css` is emitted by the bundler, which is one more file to wait for. The one
  thing a cover must not do is wait.
- **IT CARRIES A PICTURE, AND THE PICTURE IS THE ONE THING IT DOES NOT DEPEND ON.** It
  used to draw the wordmark and load nothing, on the argument that a second request can
  land after the thing it was meant to cover — which is true, and is why `splash.webp` is
  a background LAYER over the soil colour rather than the cover itself. The wordmark, the
  bar and the ground are painted from the first frame exactly as before; the artwork
  appears under them whenever it arrives, and a file that never arrives leaves the cover
  that shipped before there was one. The type matches home's own mark, so the cover hands
  over rather than being replaced.
  - **It is in `public/`, not bundled**, for the reason the icon is: the DOCUMENT names it,
    in a style block that runs before any of our script, so it cannot carry a
    content-hashed filename. It is precached by name in `vite.config.ts` beside the icons
    and the fonts — the cover is up for two seconds on EVERY launch, and the second one
    should have the picture on the first frame rather than a second of bare soil.
  - **`skin.css` HAS TO EXEMPT IT**, and this is the trap. That sheet clears every
    background image in the app with `!important` (§10), and it lands while the cover is
    still up — so without `:not(#splash)` the picture AND its scrim are stripped off in
    front of the player, silently. The blanket's own comment says adding one means adding
    it there; this is the third.
  - **The wordmark holds the FOOT of the screen under a gradient**, rather than the middle.
    The picture's subject is in the middle and the name sat on top of it, and the scrim is
    the only thing making pale type legible over artwork nobody has measured a contrast
    ratio against.
- **IT IS UP FOR AT LEAST TWO SECONDS, HOWEVER FAST THE GAME LOADS** (`MIN_MS` in
  `platform/splash.ts`). Asked for directly, and the artwork is what makes it worth having:
  a painted cover that flashes past in two hundred milliseconds on a warm cache is a
  picture nobody sees and a game that looks like it stuttered on the way in. It also hides
  the SPREAD — the same boot is a blink on a desktop and most of a second on a phone — so
  the game opens the same way every time. Measured in a browser at **2.28s** door to door,
  cold and warm alike, which is the floor plus the fade.
  - **It is a FLOOR, not a delay.** A boot that takes longer still takes longer, and
    nothing waits on it but the cover coming down.
  - **The remainder is worked out ONCE, never re-checked on a tick.** A loop that asked
    `performance.now()` again each time would never finish under a test's fake clock, where
    the timers advance and `performance.now()` need not.
  - **`dropSplash` has no floor**, and that is the point of it being a second function: two
    seconds of looking at a picture on top of the one screen that says what went wrong is
    the fault the watchdog exists to prevent, arrived at deliberately.
- **The bar is INDETERMINATE on purpose.** The browser does not tell a page how much of its
  own script has arrived, so there is no honest percentage — and a fake one that jumps to
  90% and waits is worse than a sweep that only says "working".
- **It is REMOVED, never hidden.** A full-screen element left at `opacity: 0` still takes
  every tap on the home screen — a far worse fault than the blank moment it was added for.
  And it comes down on a FAILURE too: `catchCrashes` drops it before putting its panel up,
  or a boot that threw would leave the cover over the one screen that says what went wrong.
- **The watchdog in the document is the last resort.** A bundle that 404s, a syntax error
  in an old browser, a throw before anything is armed — in every one of those the cover
  would sit there for ever. Ten seconds is far longer than any real boot.

**WHAT CHANGED WHILE YOU WERE AWAY** (`ui/whatsnew.ts`, `App.showWhatsNew`). A build goes
out every few days and nothing told a returning player anything had moved: News sat behind
the drawer with a small badge, which is the right home for a FEED and no way at all to say
"the thing that annoyed you is fixed".
- **`NewsPost.major` is set by whoever writes the post**, never derived from the tag:
  "update" covers both a new feature and a button that moved, and only one has earned a card
  in front of the game. A card that appears on every build is one a player learns to dismiss
  without reading, which costs the build where it mattered. Most posts are not major, and
  the table deliberately carries a newer minor one — which is also the only reason the
  partial-read rule below can be tested at all.
- **It is a CARD, not a screen**: the picture and the lead, never the body. A card that
  reproduces the article is the feed with an extra tap in front of it, and the way into the
  real thing is on it. The picture is `newsHero`, the News screen's own, so a post is drawn
  one way.
- **It marks read only as far as the NEWEST POST IT SHOWED** (`markNewsRead(at)`). Stamping
  the whole feed would clear the badge on posts it never showed — the card claiming to have
  said something it did not.
- **A BRAND-NEW COLONY HAS MISSED NOTHING.** `newsSeen` is stamped in the store's
  constructor, beside the player code and the first invitation and for the same reason;
  without it the whole back catalogue reads as unseen and a first launch opens on a card
  about a build the player has never seen. The tour is checked FIRST as well — belt and
  braces on the one screen where getting it wrong is worst.
- **Reading the rest counts as being told.** A card that comes back because somebody tapped
  the other half of it is a card that is now in the way.
- **It borrows the result card's box but NOT the match screen's `.btn`**, which stacks an
  icon over a label in a column — that put the chevron on a second line and left the gold
  button looking like plain text.

**WINNING HAS A SOUND, AND THE BED GETS OUT OF ITS WAY.** The end of a match was three
triangle notes — the sound a puzzle game makes when a row clears — playing on top of the
war bed's drum kit, on the one moment a whole match was played for.
- **A TRUMPET IS A FILTER SWEEP, not a waveform.** `brass()` is a sawtooth pair through a
  lowpass whose cutoff opens over the attack and settles as the note is held; that sweep is
  what a brass player's lips do and the entire difference between a horn and a buzzer. The
  cue table carries a waveform, a pitch and an envelope and nothing that could hold a
  filter, which is why `fanfare()` is BUILT rather than listed — the same reason the noise
  cues are. A phone with no biquad gets the notes unfiltered: thinner, never silent.
- **It ARRIVES.** Three short notes climbing and one that lands, dotted so it reads as a
  CALL rather than as a scale — and the landing is a CHORD, because one horn is a signal
  and three are a celebration. It is the only thing in the file allowed past a second: it
  plays over the winner's colour washing the whole board, and a shorter cue leaves the
  finale in silence. Measured against the other cues in a browser: **−7.3 dBFS peak**,
  beside `jackpot` at −6.5 and the match bed at −1.6.
- **THE BED STOPS BEFORE THE CUE, and that is `MatchScreen.finish`'s job.** A fanfare over
  a drum kit is two pieces of music at once and neither of them wins. What comes next is
  the app's: the menu bed on the way home (`clearMatch`), the war bed on the next match.
- **AND THE WAR BED IS ASKED FOR AFTER THE OLD MATCH IS TORN DOWN.** `startMatch` asked
  first and called `clearMatch` second — which puts the MENU bed back — so **"Play again"
  ran a whole match under menu music**. Order, not idempotency, is what makes it right, and
  `moments.test.ts` holds all three transitions.

**THE HATCH HAS A SOUND, AND THE SOUND IS THE TIER.** The whole feature is a moment — the
egg rocks, then the tier's COLOUR arrives before the trait is named — and it resolved in
silence. Three cues: `hatch` (the shell giving way, under the rocking), `prize`, and
`jackpot` for the top two rungs.
- **The shell first, and not the prize.** Nothing has been revealed while the egg is
  rocking, and a sound that gave the answer away there would undo the only thing the
  rocking is for.
- **A mythic must not sound like a common**, or the cue is saying the opposite of the
  colour at the one moment the feature exists for. Which cue is read off `TIER_IDS`, so a
  retune of the ladder cannot move a colour on one screen and leave the sound where it was.
- **The end of a match was NOT silent** — `MatchScreen.finish()` has always played `win` or
  `lose` as the wash begins. `ui/__tests__/moments.test.ts` holds the whole path a player
  takes to it, because the way that breaks is not the cue failing but the app ceasing to
  reach it. Still silent, and open: the Colony Road, the quests, and every purchase.

**A MATCH SURVIVES THE APP BEING CLOSED** (`platform/suspend.ts`, the band on home). A
phone call, a low battery, a swipe away — and twenty minutes of play was gone, with the
colony unpaid for it. That was the worst thing the game could do to somebody and it did it
silently: nothing anywhere kept a match that had not finished.
- **It is nearly free, and only because the engine is pure and seeded (§4.1).** A match in
  progress is the same twenty bytes a finished one is remembered as — the SETUP and the
  MOVES (`engine/protocol.ts`) — and `replayMatch` hands the exact board back. No board is
  ever stored, so nothing here can go stale against a balance change.
- **What else it carries is what the SCREEN counted, not the board**: the wall clock the
  result card reports, how many queens have fallen (the surge lapses, so the position can
  no longer say), who is across the board, which challenge is being attempted and whether
  its reward has been paid, and the turn number. Every one is something the match counted
  as it ran and cannot recount from the position.
- **It sits BESIDE the save, never inside it.** A record runs to hundreds of moves and the
  backup code is a string a person copies into a message — the same reason the history
  records were taken out of it. Its key is the profile's key with a suffix, so each account
  suspends its own match and two colonies on one phone cannot resume into each other's.
  `ProfileStore.slot` is what offers that key rather than the shell reaching for it.
- **A record that will not replay is DROPPED, never half-applied**, and so is one whose
  board is already `over` — that one is reachable, because the record is rewritten on the
  move that WINS and cleared a moment later when the card goes up. Resuming a finished
  match would pay for it twice.
- **ONE function writes a move down** (`MatchScreen.remember`), because a move that is
  played and not reported resumes onto a board the player never reached — and it is
  silent: the match plays on perfectly and only the NEXT sitting is wrong.
- **A resumed match has no opening and carries its clock.** `playIntro()` is a match
  STARTING, and growing a colony out of its nest on a board thirty turns old is untrue —
  the same rule the history replay follows. The time already spent is added to `playedMs`,
  or a match resumed for one turn reports itself as a thirty-second game.
- **It keeps the mods it OPENED with.** Research bought between two sittings must not change
  a board that is half played, or the record stops replaying.
- **The tutorial is never suspended.** It is a walkthrough with an overlay counting through
  it, and half of one is not something to hand back to anybody.
- **The band wears the save guard's row**, because they are the same thing seen twice: one
  strip under the top bar saying something is waiting. It names the map and the turn — a
  button that only says "resume" is one a player presses to find out what it is — and it
  can be put down on the same button twice, the pattern the reset row already uses.
- **A new match replaces it the moment it OPENS**, not on its first move, or an app closed
  on turn one reopens offering the match before this one.

**ANDROID'S BACK BUTTON** (`platform/back.ts`, `App.goBack`). A WebView has no history to
go back through, so the shell's own answer to a press is to CLOSE THE APP — anywhere,
mid-match included. Every Android player expects "up one screen", and every Play reviewer
checks it.
- **The app decides; the platform file only asks.** `onHardwareBack` takes a handler that
  answers one question — did anything consume the press? — and only a `false` exits. A back
  that swallowed everything is the more annoying of the two failures: an app you cannot
  leave with the button that leaves apps.
- **The order is the order things are stacked in**, each rung one the player can see: the
  tour (swallowed — closing the app is not the answer to a step being read), the result
  card, the drawer, a match, a page over the deck, the deck itself, then home → exit.
- **A page goes where its own back button goes.** Pressing the arrow the player can see is
  the whole rule; a second table of which screen sits above which would be a second answer
  to a question the screens already answer, and the one that goes stale. A page with no
  arrow (How to play, dressed as a bottom-nav screen like the legacy build) goes home.
- **A match goes home rather than nowhere, and it only can because a match survives being
  left now.** Before the suspension this had to either swallow the press or throw the game
  away. Leaving is not a defeat: nothing is settled and nothing is paid.
- **AND IT IS NOT A NO-OP IN A BROWSER ANY MORE, which reverses what stood here.** This
  said: "a no-op in a browser, deliberately — a tab's back button is the browser's history
  and taking it over breaks the one gesture that gets somebody out of a page." True of a
  TAB on a desktop, wrong about a PHONE. Reported from a Nothing Phone: "when I swipe from
  the left edge, usually that's the action for going a step back, but in the game it exits
  completely." On Android that swipe IS back, the installed app has no browser chrome at
  all, and the history held exactly one entry — so the only thing the gesture could do was
  leave, mid-match included.
  - **ONE SENTINEL ENTRY, never one per screen.** `historyBack` pushes a state entry on top
    of the page; a gesture pops it, `popstate` fires, the app gets its one question, and a
    consumed press pushes it back so the next gesture asks again. A parallel stack in the
    history would be a second answer to "what is above what" — which `App.goBack` already
    owns — and it is the copy that drifts. It changes no URL, so the address bar, the
    service worker's navigation match and the `?v=<commit>` freshness reload are untouched.
  - **THE ESCAPE HATCH IS WHAT LETS THE OLD RULE BE REVERSED rather than overruled.** When
    the app answers `false` — nothing above home — the sentinel is already gone and
    `history.back()` hands the press straight to the browser, which leaves exactly as it
    always did. Measured in a browser: from Settings and from the setup screen it goes to
    home and stays in the app; from home it lands on the page that was there before.
  - **LEAVING IS A ONE-WAY LATCH, and it is not belt and braces.** `history.back()` inside
    a `popstate` handler can fire another one, and at home the answer is `false` every
    time — without it the app asks to leave, is asked again, and spins.
  - A throwing handler is swallowed for the same reason the native half swallows one: back
    doing nothing at all for the rest of the session is worse than the fault it reports.

**WHEN SOMETHING THROWS** (`platform/crash.ts`). There was nothing at all: an exception in
a render loop or a screen builder went to a console nobody has on a phone, and the game
stopped — a board that no longer answers a tap, or a blank page, indistinguishable from a
frozen device.
- **It is the smallest useful thing: say so, and offer the way out.** Not error reporting —
  nothing is sent anywhere, because there is no server and because a crash panel that
  quietly uploads is not something to add without saying so (and the privacy page says it
  does not).
- **Both halves, and they are different events.** `error` is a throw that reached the top;
  `unhandledrejection` is a promise nobody caught — and almost everything asynchronous here
  is the second kind (the search worker, the storage bridge, the build check).
- **It shows ONCE.** One fault usually becomes many; a broken frame throws sixty times a
  second, and a panel that redraws itself per frame is a worse fault than the one it reports.
- **Its styles are written out inline**, because the fault may BE the stylesheet, and a
  crash panel that cannot be seen is not one.
- **The reload is an honest offer because the save is already safe** — every currency and
  the colony are written the moment they change, and the match after every move.

**THE PRIVACY POLICY IS A REAL PAGE** (`public/privacy.html`). Play requires a policy at a
URL that works whether or not anybody has installed the game, so it cannot be a screen in
the app; `public/` is copied into the build, so it deploys with everything else and needs
no second host. It describes what the code actually does, and the interesting half is what
it does NOT: no server, no account, no analytics, no ads. The two places a request leaves
the device at all — Pages serving the page and the version check — are named rather than
buried, and the third that used to be there (Google Fonts) is named as gone. Two tests
hold it: its address must be `SUPPORT_EMAIL` (two copies of a contact address is one that
goes stale, and it is always the one in the policy), and no shipped source may mention an
analytics SDK while the page says there is none.

**WHAT THE TWO STORES REQUIRE** (`src/ui/__tests__/store-policy.test.ts`). Every rule here
comes from Google Play's Developer Programme Policy or Apple's App Review Guidelines, and
none of them is a gameplay rule — no player will ever notice one, which is exactly why they
rot. A screen gets rebuilt, a panel moves, and the app is out of compliance with nothing
failing. The test file names the requirement beside each assertion.

- **LOOT BOX ODDS GO BEFORE THE PURCHASE, not where the roll happens.** Apple 3.1.1: "Apps
  offering 'loot boxes' or other mechanisms that provide randomized virtual items for
  purchase must disclose the odds of receiving each type of item to customers prior to
  purchase"; Google has required the same since 2019. They were printed on the HATCH, which
  is where a player rolls — and the purchase is LARVA, two screens away in the shop. That
  gap is the whole of the requirement, and it is why the panel became `ui/odds.ts` rather
  than a closure inside the hatch: one panel, derived from the weights the roll really uses,
  shown in both places.
- **APPLE REQUIRES A RESTORE MECHANISM** — "make sure you have a restore mechanism for any
  restorable in-app purchases". `PurchaseGateway.restore()` is the seam; the shop's button
  sits under Unlocks, which is what it can restore. It SAYS what it cannot do: currency is
  consumable and is spent, no store hands it back, and a button implying otherwise would be
  the shop promising a refund. `DemoGateway.restore()` gives NOTHING — there is no store
  behind it, so there is no purchase to find, and handing over the pass would be the one
  thing a restore button must never do. It matters here more than in most games: a colony
  lives in `localStorage` on one device, so a player who reinstalls has genuinely paid for
  something the game can no longer see.
- **ACCOUNT DELETION HAS TO BE IN THE APP.** Google requires it of any app that lets
  somebody create an account; Apple says the same in 5.1.1(v). `AccountService.forget` had
  existed for months with nothing calling it. Settings now has TWO destructive rows and they
  are different: Reset starts this colony over and leaves it signed in; **Delete this
  colony** erases the save and takes it off the picker. Each says what it LEAVES BEHIND
  rather than only what it takes, and each asks twice on its own button. The privacy page
  spells out the routes, because it is where a player who cannot find the button will look.
- **NOTHING MAY CLAIM A SIMULATION IS OTHER PEOPLE.** This is the one that was a real risk
  rather than a missing control. There is no server, so the opponent, the ladder and the
  friends list are all generated on the device — and the app said "Searching for an
  opponent…", then "Opponent found", under a Leaderboard headed "World ranking", beside a
  Friends screen whose requests go nowhere. Apple 2.3.1 requires that an app's
  "functionality should be clear to end users"; more to the point it was untrue.
  - The search says **"Choosing your opponent…"** and the seated card carries **"Computer
    opponent"**. The moment is kept — the reel really does choose, from the roster this
    chapter fields, and where it stops really is who turns up. Only the claim goes. A DUEL
    carries no tag, because that one is a real person off this device's own friends list.
  - The ladder is a **"Practice ladder"** with a line under the table saying the colonies
    are generated here and that ranking against other players arrives with online matches.
  - Friends says so **above the tabs**, not below the list: somebody about to send a
    request needs it before they send one.
  When the server lands, these three lines are what has to change with it.
- **NO CLAIM THE GAME CANNOT SUPPORT.** The shop said "MOST POPULAR" on a mycelium tile —
  a claim about a population that does not exist, since nobody else is playing — and "BEST
  VALUE" on the Brood Bundle, which gives 281 units per euro against the Queen's Hoard's
  340 with the Colony Pass on top. That one was simply FALSE. `purchases.test.ts` recomputes
  value per euro per shelf now rather than trusting the table, and greps every ribbon,
  title and subtitle for words the game has no way to measure. Found with them: `pher.1300`
  granted 900 — and the ids ARE the Play Console SKUs, named for what they hand over
  precisely so nobody wiring up the real store has to check, which is worth nothing if one
  of them lies. It is `pher.900`.
- **EVERY CONTROL SAYS WHAT IT IS** (`ui/__tests__/a11y.test.ts`). This app is drawn: the
  chrome is unlabelled SVG marks and half its pictures are canvases, which carry no text at
  all. Every BUTTON already had a name — that part was already right — and no canvas did.
  The rule is that a canvas either carries a name or is explicitly `aria-hidden`, and
  silence is the correct answer for most of them: a portrait sits inside a row that is
  already named, and the manual's figures illustrate a numbered rule written out beside
  them. An unlabelled graphic announced as "graphic" is worse than one that says nothing,
  and an invented label is worse than both. So `antPortrait` hides its canvas, `drawSnapshot`
  takes an optional `label` and hides by default, and the BOARD is the one canvas that
  carries a name — everything else illustrates words already on the screen; the board IS
  the screen. The test walks the real app rather than building screens directly, because a
  screen built directly is a screen whose chrome never ran.
- **CONTRAST IS MEASURED, NOT ASSUMED.** Every text node on the five deck screens and the
  manual, in a real browser, against the background actually painted behind it: all pass
  WCAG AA. Worth re-running after a palette change — `--muted` on a dark panel has been
  under AA once already (§ the Anthill).
- **THE TYPEFACE IS OURS** (`public/fonts/`, the `@font-face` block in `index.html`). It
  came from Google's CDN, which was this app's only third-party embed and meant every
  player's IP reached Google before a line of the game ran — no consent asked for, none of
  it necessary, and the textbook GDPR problem with hosted webfonts. Two variable woff2 files
  (latin and latin-ext, 80 KB) now ship with the build. Google serves the SAME file for 400,
  700, 800 and 900, so declaring the weight RANGE is what makes it one download instead of
  four. It is precached like everything else — it could not be while it lived on somebody
  else's server — so a first launch offline no longer renders in Arial, and the privacy page
  no longer names Google at all. A page that over-discloses is as wrong as one that
  under-discloses, and a test holds that line too.
- **THE TERMS ARE A REAL PAGE** (`public/terms.html`), beside the privacy policy and for the
  same reason: a store listing has a field for the URL and Apple expects an app that sells
  anything to point at them. It says what is true of THIS game rather than reciting a
  template — a licence not property, currency that does not expire, odds that are printed
  and read from the table the game rolls against, restoring, and that the store handles the
  money and therefore the refunds (we take no payment and hold no card details, so we cannot
  issue one). Tests hold it against `SUPPORT_EMAIL` and against the two claims the app makes
  on screen, so the binding document cannot contradict the game.
- **NO COOKIES, and the policy says so plainly.** The game sets none; the save is the
  device's own storage, which is the game working rather than anything watching, and is why
  no banner asks about it. Strictly-necessary storage needs no consent — but a player
  looking for the answer has to find it, so it is a heading rather than a footnote.
- **STILL OWED, and neither is code:** `SUPPORT_EMAIL` is a placeholder and both stores
  require a working support contact — a test asserts it is STILL the placeholder, so it
  fails on the day somebody sets a real one, which is the day to delete the test. And the
  Play listing needs the Data safety form answered (nothing collected, nothing shared,
  nothing transmitted) plus an IARC content rating; Apple needs the privacy labels saying
  the same. The privacy page at `/privacy.html` is the URL both of them want.
- **No ads SDK, no analytics, no tracking, so no `AD_ID` permission** — worth checking once
  in the generated `android/` manifest before the first upload, since a dependency can add
  it and Play then requires a declaration for a thing the game does not do.

**THE SECURITY AUDIT, AND WHY MOST OF IT DOES NOT APPLY** (`src/ui/__tests__/hostile.test.
ts`). A standard backend checklist was run against this build — auth, sessions, rate
limits, SQL injection, CSRF, file uploads, admin routes, secrets in environment variables,
CORS, TLS, audit logs. **Fourteen of the twenty items have no subject here**, and that is
worth writing down rather than re-deriving: there is no server, no database, no API, no
account and no upload. What runs is a static bundle and a save in `localStorage`, and
GitHub Pages serves it over TLS with the headers it chooses. The remaining six were
checked, and two of them are rules the suite now holds.
- **THE ATTACKER IS THE PLAYER, and the thing they can edit is the SAVE.** That is the
  whole threat model: `localStorage` is theirs, so a hand-edited profile is not an attack
  to prevent but an input to survive. `normalise()` has always been the trust boundary
  (§12) and it holds — a save with a string where a currency goes, a negative colony, a
  research level of 500 and a `look` naming another colony's skin comes back as a playable
  profile with every number finite and every level inside its cap. What it CANNOT do is
  stop somebody giving themselves mycelium, and it must not try: there is nothing to
  cheat at, no ladder anybody else is on, and a client that refuses its own save is a
  colony deleted. The day there is a server, `platform/results.ts` is already the half
  that decides who won (§9b).
- **A COLONY'S NAME IS ATTACKER TEXT, and it is drawn on eight screens.** It goes on the
  plates beside the nest, the profile, the leaderboard, Settings, the sign-in roster and
  the top bar. Every one of them builds nodes and sets `textContent`, so a name of
  `<img src=x onerror=...>` renders as those characters — verified in a real browser
  (0 dialogs, 0 injected elements, 0 page errors) and held by a test that walks all five
  deck tabs plus Settings and the Leaderboard. The rule underneath it is the one worth
  keeping: **the only `innerHTML` in the app is the match screen's static `MARKUP`
  constant**, and a test greps every shipped file for an assignment with anything else on
  the right-hand side. A screen that starts building its rows from a template string is
  how this stops being true.
- **THE DEPENDENCY ADVISORIES ARE ALL DEV-ONLY, and they are not being chased.**
  `npm audit --omit=dev` is **zero** — nothing that ships to a player has a known
  vulnerability, because almost nothing ships: the bundle is our own code. The eight in
  the dev tree are the vite dev server, the vitest UI server and a uuid bound, none of
  which exists in `dist/`, and every fix is a major bump (vite 5→8, vitest 2→5). A
  speculative major upgrade of the build tool to silence advisories about a server that
  never runs for anybody but us is a real risk taken for no gain. Re-check with
  `--omit=dev` after any dependency change; that is the number that matters.
- **The git history is clean of secrets**, checked across every blob rather than the
  working tree — there is nothing to leak, since the app authenticates against nothing,
  but a key pasted into a config once lives in the history for ever.

**THE ANDROID SHELL** (`capacitor.config.ts`, `platform/native.ts`). Thin on purpose:
Capacitor serves the same `dist/` in a WebView. What it actually buys is that **the save
stops being disposable** — `@capacitor/preferences` is real application storage.
- **`KeyValueStore` DECLARES TWO SEPARATE FACTS, and conflating them was a bug the tests
  caught.** `durable` is "does a write survive the app closing"; `evictable` is "can
  something other than the player delete it". `localStorage` is BOTH — durable and still
  binned by iOS after a week — so reading eviction off `durable` made the native build show
  the save-at-risk warning about a clock that does not run there.
- **It is synchronous over an asynchronous API.** Every caller of `KeyValueStore` is
  synchronous — `ProfileStore` reads in its constructor — while Preferences is a promise
  across a bridge. The whole save is read ONCE at startup and written back through, which
  is what `localStorage` does behind its own synchronous face. Making the profile layer
  async would reach every screen in the app for a storage detail.
- **`main.ts` hands `App` the ACCOUNTS, never a profile.** A profile passed in means "this
  is the colony" and skips the sign-in screen (`App.given`) — right for a test, wrong for
  the shell, which has to open the signed-in account and the picker when there is none.
- **The native build runs neither `takeNewerBuild` nor `goOffline`.** Its bundle ships
  inside the APK: there is no Pages cache to be stale against, and a service worker in a
  WebView is a second cache in front of files that are already local.

**KEEPING A SAVE ALIVE ON A DEVICE THAT NEVER PROMISED TO KEEP IT**
(`platform/persistence.ts`, `ui/keepsafe.ts`). The accounts above answer "which colony is
mine"; this answers the harder one — the browser deciding the save is disposable. Two do:
- **iOS Safari deletes all script-writable storage after seven days without a visit**, for
  any site not installed to the Home Screen. So the player most likely to lose a colony is
  the one who took a week off, which is also the one least likely to have written anything
  down. INSTALLING IS THE ONLY THING THAT EXEMPTS THEM and there is no API to ask.
- Chromium evicts under storage pressure unless the origin is persistent, and
  `navigator.storage.persist()` is how you ask. It grants silently on engagement, so it is
  asked for on every boot and costs nothing.
- And a third that is not eviction at all: **the write never landed.** Private mode, a full
  quota or site data blocked, and `defaultStore()` falls back to memory — the game plays
  perfectly for one session and forgets all of it, silently, which is the worst way to lose
  somebody's evening.

- **`KeyValueStore` DECLARES whether it is durable.** It was read as `!(store instanceof
  MemoryStore)`, which a subclass inherits — a memory-backed store would have reported as
  durable while losing everything on reload, the exact failure this module exists to catch.
  It is also the one fact a Capacitor backend has to state about itself (§12).
- **`saveRisk` is deliberately hard to trigger.** Installed is safe, persisted is safe, and
  an un-persisted Android or desktop origin is NOT warned — eviction there needs real
  storage pressure, and crying wolf at a whole platform is how the one player who is
  genuinely about to lose a colony learns to skip the message. Only iOS has a clock on it.
- **The prompt on home waits for something to lose** (`GUARD_AFTER_GAMES`, 3). A colony of
  forty on its first launch is not worth a warning, and spending a new player's first
  minute on one teaches them the band is noise. `unwritable` is the exception — nothing is
  being saved at all, so it says so at once.
- **It is DISMISSIBLE and never comes back.** Nagging every launch about a risk somebody
  has decided to accept is how an app gets ignored; Settings keeps the route open for ever,
  and its Backup row now states whether a code was EVER taken ("Never taken — this colony
  is only on this phone") rather than describing the feature.
- **The guard rides INSIDE `.tophead`, under the granary pill.** The two floating buttons
  are positioned by measuring that block's bottom edge (`syncFabs`), so a sibling laid out
  after it lands underneath them — which put the dismiss button behind the menu button,
  unreachable. `rebuildHomeBar` re-runs `syncFabs` for the same reason: collecting the
  granary or dismissing the guard changes the block's height.
- **Home is a DECK slide, so it is rebuilt through `Deck.refresh`** when the persistence
  answer lands. `show("home")` while home is already the slide on screen only moves the
  rail and rebuilds nothing — and `refresh` is the one path a deck screen is ever rebuilt
  by, which stops this becoming a second one.
- **The screen leads with the FIX and puts the code second.** Installing is what saves an
  iPhone colony; the code is what saves it afterwards. The Share-sheet steps are spelled
  out because that is exactly where somebody gives up, and they are shown ONLY on the
  device they apply to — a page that warns an Android player about Safari is a page nobody
  believes twice.
- **The code is OPEN here and behind a Show button in Settings.** There it is one offer
  among a dozen and a wall of base64 reads as a fault; a player who reached this screen came
  for exactly this, and a second tap is one some of them will not take.
- **`ui/backupcode.ts` owns the code panel**, because it is offered from two screens now and
  its rules are the drifting kind: generated when SHOWN rather than when built (a match
  played in between would hand out a stale colony), a copy fallback that always works, and
  a stamp on the save. **Stamped on showing, not on copying** — `writeText` is refused on
  plain http and in older browsers, and the fallback is a selection the page never hears
  about, so stamping the copy would tell a player with the code safely in a note that they
  have never backed up.

**STILL NOT SOLVED, and it needs a server:** a password, and an account that survives the
device. Everything above reduces the chance of losing a colony; none of it stops somebody
picking another colony off the roster on an unlocked phone, and a password on a local save
would not either (see ACCOUNTS).

**TAKING YOUR COLONY WITH YOU** (`platform/backup.ts`). Everything a player has is in
`localStorage` on one device: a new phone, a cleared browser or a switch from the web build
to the installed one and all of it is gone. There is no account to hang it on until there
is a server, so the save is written out as one string they can keep — offered in Settings
under "Your save", read back on the other side.
- **Tagged, versioned and CHECKSUMMED.** The way this actually moves is a person copying it
  out of a message, and the thing that really happens is that the end goes missing. Half a
  code that LOADS is a colony quietly reset, so a code that fails its checksum is refused
  as damaged and a string that is not one of ours is refused as not a code at all — never
  read as an empty save.
- **It says WHICH of the three things went wrong.** "Invalid" tells a player nothing they
  can act on; "the end is missing" tells them to copy it again.
- **Base64, not raw JSON**, because a chat app helpfully "corrects" quotes and braces — and
  UTF-8 first, or `btoa` throws on a colony named in another alphabet.
- **THE REPLAY RECORDS DO NOT TRAVEL.** A record is up to five hundred moves, for each of
  twenty matches: measured on a full history of long games they are 400 KB of a 408 KB
  save, and the code built from that was **544 KB** — half a million characters, in a box
  the screen asks a player to copy into a message. Nobody does that, so the backup had
  silently stopped working for exactly the players with most to lose. Without them the same
  save is 17 KB. The match still travels — the row, the opponent, what it paid, and the
  whole career built out of it — only the moves are left behind, and the Settings row says
  so.
- **Importing goes through `normalise` like every other read** (§12). A code is a string
  somebody can edit, so this is the door a hand-written profile arrives at.
- **`importProfile` never half-applies and never decides.** It hands back a whole profile or
  a reason; the SCREEN asks twice before `ProfileStore.restore` replaces the save, the way
  the reset row does, because overwriting a colony is the most destructive thing in the app.
  A bad code is refused BEFORE the confirmation — arming on one that cannot load asks the
  player to confirm destroying their save for nothing — and editing the field disarms it,
  or a confirmation given for one code is spent on whatever was pasted over it.
- **A restore is a different colony, so the app is TOLD.** The difficulty and the map live
  on the shell as well as in the save; `adoptProfile` is what stops it playing on by the
  settings of the save that was just replaced.

**The shop is BUILT** — sixteen products through `platform/purchases.ts`, the premium
colony included. (This section said "remaining gap: the shop" for months after it stopped
being one.) The species picker enforces `profile.unlocked`, locked colonies staying visible
so the player can see the goal, because the Antarium can sell them.

The progression layer sits in three files, and none of them is reachable from the engine:
- `platform/catalogue.ts` — prices and player-facing copy. The engine still owns what a
  chamber or research level *does*; this owns what it costs and what it says.
- `platform/colony.ts` — how the colony grows, and how a figure that big is written.
- `platform/road.ts` — Colony Road reward table (a chapter's purse and how its five
  checkpoints split it), pure functions of a colony size.
- `platform/quests.ts` — the daily pool and a day-seeded roll.

The blue currency is called **pheromone crystal** (plural **pheromone crystals**) in
player-facing text, and uses the painted blue crystal icon. Keep the internal
`pheromone` field, icon key and purchase SKU identifiers unchanged for compatibility.

A new player starts with nothing — no mycelium, no pheromone crystals, a colony of forty. The legacy
build's 120-mycelium welcome grant is deliberately gone: it bought the first chamber
before the player knew what a chamber was.

Currencies have separate jobs: **mycelium** buys chambers and species, **pheromone crystals** buy
research. Every purchase goes through a `ProfileStore` method that returns `false` rather
than throwing when the player cannot afford it, so a screen can tap optimistically and
nothing ever goes half-spent.

**AND `buyResearch` CHARGED MYCELIUM FOR MONTHS.** That is the legacy build's rule, ported
with the rest of it, and it meant mycelium bought the chambers, the eight colonies, the
granary AND all twenty-seven research tracks while **pheromone bought nothing whatever** —
a currency printed in the top bar of every screen that was a number going up. Every other
part of the game already said otherwise: the tour tells the player to spend pheromone on
research, this section has said it since the beginning, and `economy.test.ts` has always
measured the research tree as the PHEROMONE sink and held the supply to 0.7–1.3× of it.
So the pacing this build ships was tuned for the rule the code did not have. The species
page's header shows the purse its own buttons draw on, which is why that chip takes a
currency now rather than being the mycelium one everywhere.

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
  there is no way to flatten everything element by element without missing some. Three
  things are exempt and each has a real picture on it: `#home`, `#luckyhatch` and
  `#splash` — the last being the cover in `index.html`, which is on screen before this
  sheet is even fetched and for a beat afterwards. Every radius came down one step with it
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

- **Larva.** A WIN pays one (`WIN_LARVA`, in `settle.ts`) and the shop sells more; the
  Colony Road and the two quests that pay larva in the legacy build still pay pheromone
  instead (at 4 each — §8c, where that conversion was retuned). Moving those payouts to
  larva would re-open the economy model, so it is a deliberate decision rather than an
  omission. It is banked at every chapter and SHOWN on the result card only once the
  hatch is open (chapter 10): the player who gets there should arrive with something to
  open, and a card announcing a currency whose only door is still locked is a question the
  app cannot answer.
- **Daily quest roll.** Legacy rolls with `Math.random` and stores the result; this build
  derives the day's three from the day number (§11), so a reload cannot reroll.
- **Formation thumbnails.** Legacy draws them once at boot and never redraws, so they keep
  the default orange after the species picker recolours the palette. This build redraws
  them, so they match the rest of the screen.
- **`RESEARCH LV NaN`.** The legacy species page reads a field that does not exist. Ours
  counts the levels properly.
- **Leaderboard "You".** Legacy shows a hardcoded 999 points; ours shows real trophies.
- **Venom Rain's description.** The legacy build says "10 troops/turn" and its engine does
  7. Ours interpolates `VENOM_BITE`, so the sentence cannot disagree with the rule.

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
- **The TOP bar stays full-bleed and its CONTENTS join the column**, through
  `padding-inline: max(16px, calc((100% - var(--page)) / 2))` rather than a wrapper — so no
  markup moves and the background does not break at the screen edge.
- **THE TAB TRAY DOES NOT JOIN THE COLUMN, AND HAS NO GUTTER.** Five tabs are targets
  rather than text: they FILL the bar, because a gutter inside a full-bleed tray shrinks
  every one of them and leaves a strip of nothing at each end — which is exactly where a
  thumb reaching for the first or last tab lands. The column is 360px and a phone is
  wider, so joining it was itself a gutter. `--navmax` (640) is what stops five tabs
  spreading across a tablet, and it is deliberately wider than the reading measure.
- **HOME HAS ONE GUTTER AND EVERYTHING ON IT USES THAT.** Every other screen is a column
  of cards that wants the app's 16px; home is one picture with a banner over it and a
  button under it, and a card gutter framed all three in a border of nothing. `#home`
  carries `--gutter: 12px` and `--homemax: 640px`, and the top bar's contents, the banner,
  the granary pill, the hero and the two floating buttons all answer to those two — one
  pair of edges for the whole screen, at every width.
  - **Not zero.** Taking the tab tray's gutter off dropped the banner and the granary pill
    to nothing while the hero under them stayed at the gutter: three insets on one screen,
    and two items touching the glass, which reads as a layout that overflowed.
  - **The full-bleed block escapes by the SAME number it is put back by.** The legacy
    `.tophead` pulls itself out by the app's 16px, so on home it is re-pulled by
    `--gutter` — otherwise it overhangs the screen it is meant to fill.
  - **THE BANNER AND THE PILL ARE BOTH CARDS, so both are SIZED, never padded.** Padding
    moves the text and leaves the card's own edges on the glass — which is exactly how the
    chapter banner ended up spanning the whole screen while the granary pill under it sat
    at the gutter, with the text inside both looking correctly inset. Nor is a margin
    enough: `margin-inline: 12px` gave the right gap on a phone and left the pill hard
    against the left edge of a tablet while the banner above it was centred. Sized and
    auto-margined, so they hold the gutter on a phone and centre on a tablet.
  - **THREE SCREEN BODIES OPTED OUT OF THE COLUMN.** `.achbody`, `.lbbody` and `.shopbody`
    each set `width: 100%` in the legacy sheet, and two classes outrank the one rule that
    puts a `.screenbody` in the reading column — so on a tablet the Colony Road, the
    Leaderboard and the Shop each had a 440px header sitting over an 800px body. Nothing
    showed on a phone, which is why it survived the responsive pass. The home screen's
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

**WHAT A MATCH PAYS IS ITS OWN FILE** (`src/ui/settle.ts`). The career, the match record,
four kinds of quest progress and the challenge reward were a hundred and twenty lines
inside `App.startMatch`'s `onExit` handler — business logic in the router, which is the
one thing `app.ts` is meant not to hold (§3), and the least tested path in the game
despite being the one that moves every number a player has.
- **The order is the part that is easy to get wrong.** The colony, the mycelium and the XP
  all move inside `recordResult`, so the figures the card reports have to be read BEFORE it
  and again after — a card that read them once would say "18K troops" where it means "+40".
- **The challenge latch stays on the screen**, because it is screen state: `settleMatch`
  is told whether this match's challenge has already paid, and the router remembers.
- Its test settles a real board and holds each of the four quest credits separately. A test
  that asserts "something moved" does not notice three of them going missing, which is
  exactly how queens, nests and turns went uncredited for months.

**ONE SEEDED GENERATOR, AND IT LIVES IN THE ENGINE** (`seeded` in `engine/random.ts`).
`nextRandom` is for the BOARD, whose seed is a field on the state so it can be snapshot and
restored. Everything else that wants a repeatable sequence — where the scenery is placed,
which colonies a chapter fields, which note a bar of music plays — wants a closure over its
own seed, and there were **five** hand-written copies of the same LCG across `platform/`
and `render/`. Two of them started at `seed >>> 0` and three at `(seed >>> 0) || 1`, so a
seed of zero produced two different sequences depending on which copy you happened to be
looking at. One function now, and zero folds to one.

**A SCREEN THAT REBUILDS ITSELF KEEPS THE PLAYER'S PLACE** (`redraw` in `chrome.ts`).
Twelve screens redraw in place after a tap — buy a research level and the price, the NOW
row, the purse in the header and the bar at the top all change — and every one does it by
throwing the whole screen away and building a new one. That is the right shape: one
function decides what the screen looks like, and there is no second path that updates half
of it. What it cost was the SCROLL, because a new element starts at the top: buying the
fifth chamber down a long nest snapped back to the mound, and so did claiming a level,
collecting the granary and opening a news post. It reads as the app losing your place.
- **The restore runs on a MICROTASK, never inline.** `redraw` is called at the START of a
  render and the rest of it runs synchronously after, so at the moment it is called the
  content to scroll does not exist yet. By the time the microtask fires the screen is
  whole. A screen torn down in between finds nothing and stops.
- **The scroller is found by looking for the one that IS scrolled**, then re-found by its
  id or its classes. A list of the twelve scroller names (`.hillwrap`, `.antscroll`,
  `.spgwrap`, `.screenbody`…) would be a thirteenth place to keep in step — and the
  species page scrolls its `.screenbody` while the anthill scrolls a wrapper inside it,
  which is exactly the kind of thing such a list gets wrong.

**ONE VERTICAL RHYTHM, AND IT IS THE CONTAINER'S** (`--stack` in `skin.css`). Every
screen that is a column of rows had picked its own gap — 6 between friends, 6 between
research levels, 6 between granary levels, 8 between settings rows, 8 between challenge
cards, 10 between collection rows — under four different heading margins. No two of those
screens sat on the same grid, nothing ever failed, and the app simply never looked
designed. The step is one variable and a heading adds 12 above itself, so everywhere:
10 between rows, 22 above a section, 10 under it. A test holds both.
- **A gap belongs to the space BETWEEN two things.** The profile carried its rhythm as a
  `margin-bottom` per block — 4 under the hero, 12 under a stat grid, none at all under
  the two door rows, which had nothing but their neighbours' margins to sit between — so
  one screen ran 4, 22, 10, 12, 22, 10, 12. A margin on the thing itself is a different
  answer everywhere it is not set.
- **FLEX, NOT GRID, for a scroller of mixed blocks.** Making `#profileBody` a grid
  collapsed both stat grids to nothing: a grid item whose own `overflow` is not `visible`
  — and `.pf-stats` clips, which is what makes its 1px gaps read as hairlines — has an
  automatic minimum size of ZERO, so the auto track sized to zero. Every test still
  passed, because jsdom has no layout. A flex column lays the same item out from its
  content; `flex: none` on the children is what stops it shrinking them once the page is
  taller than the scroller.

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
  anywhere; HOW TO PLAY, which was then reachable only from home and is in the drawer now
  (§ THE HOME ARTWORK); and `ProfileStore.reset`, which has always existed and which
  nothing called.
- **The reset asks twice, on the same button.** A confirm dialog would be a second overlay
  for one control; the row re-labels itself and says what it is about to destroy instead.
- **The build stamp is not a setting and no longer sits in the list pretending to be one.**
  It is the foot of the screen — but it stays readable, because on a phone a stale cached
  page and a real bug look identical without it (§ Settings shows the build).
- **"Your save" is a fourth kind of row: one that OPENS something.** The backup code is a
  couple of thousand characters and a wall of base64 sitting open in the middle of Settings
  reads as a fault rather than as an offer, so the row opens a panel. The code is written at
  the moment it is SHOWN, never at build time — a match played between two openings would
  otherwise hand out a code for a colony the player no longer has.
- **The code box is sized in WHOLE PIXELS with no bottom padding.** A scroll box clips at
  its PADDING box, so any padding-bottom is scrollable room the next line shows through —
  which is a fifth line sliced across the bottom edge, reading as a box that cannot fit its
  own text. `rows`, and a height in `em` against a fractional line-height, both land a few
  pixels off and slice one anyway.
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

**OFF SCREEN IS NOT CLOSED** (`platform/awake.ts`, `setAwake` in `feedback.ts`). Switching
to another app leaves the game RUNNING — which is the point of switching rather than
closing, and is what makes it there again the moment it is switched back to — and the bed
went on playing out of it. Reported directly: "I want game to be running so I can get back
to the game quickly but I don't want to hear the music while not in the game."
- **IT SUSPENDS THE DEVICE RATHER THAN STOPPING THE BED, and that is the whole decision.**
  Suspending freezes the audio CLOCK, so the round comes back mid-bar exactly where it was
  left; stopping and starting would replay the match bed's drum count-in (`openBars`), which
  announces a match beginning at somebody returning to one thirty turns old.
- **AND NOTHING ELSE HAD TO CHANGE, which is why one line does it.** `pump` already refuses
  to schedule on a context that is not running and already catches `nextAt` up when it
  starts again, so a sleeping bed costs nothing and cannot come back as a thousand notes at
  once; `play` already drops a cue on a context that is not running, which is the same rule
  as a cue before the first gesture. Both were written for the gap while `resume()` settles
  and both turn out to be exactly this feature's plumbing.
- **`visibilitychange`, NEVER `blur`.** A window loses focus for a notification, a dev-tools
  panel or a second window beside it, all of which leave the game perfectly visible — cutting
  the music for any of them is the feature firing when nothing has happened. Visibility is
  what a WebView backgrounded by the OS and a tab switched away from both report.
- **It does NOT fire on registration.** The caller's audio is in whatever state boot left it
  in, and announcing "visible" at boot would resume a device no gesture has unlocked yet.
- **The guard round the handler is about the CRASH PANEL, not the listener.** An exception
  out of a listener does not unregister it — the browser catches it and reports it on
  `window.onerror`, which here is `platform/crash.ts` putting a full-screen panel over the
  game. Switching apps is not a crash. The first test asserted the listener survived, which
  it does either way and which a mutation sailed through; what it asserts now is that
  nothing reaches `window.onerror`.

**THE MUSIC STARTS AT BOOT WHERE THE BROWSER ALLOWS IT** (`App.start`, `unlock` in
`feedback.ts`). Reported directly: "when I enter the game music doesn't start until I
click on something, that should not be the case."
- **THE BED WAS ALWAYS WISHED FOR AT BOOT AND THE DEVICE WAS NOT.** `setMusic("menu")`
  ran at boot and `unlock` only ever ran from the first press, so the wish sat there until
  somebody tapped. That was right while the rule was "a browser refuses audio before a
  gesture" — and an INSTALLED app is EXEMPT from that policy, which is how this game is
  played. So the device is asked for at boot and the answer decides.
- **A REFUSAL COSTS NOTHING, which is the whole reason this is safe.** The first press
  calls `unlock` again and the bed starts exactly as it did before; nothing waits on the
  boot ask and nothing is queued (§ a cue before the first gesture is DROPPED).
- **BUT A REFUSED RESUME MUST NOT REACH THE CRASH PANEL.** `resume()` returns a promise
  and the refusal is a REJECTION — asynchronous, so the `try` around it cannot catch it,
  and it lands on `window.onerror`, which is `platform/crash.ts` putting a full-screen
  "something went wrong" over a game that is working perfectly. Every `resume()` and
  `suspend()` in that file carries a `.catch` now, including `setAwake`'s both ways.
- **AND THE TEST HAD TO ASSERT THE CATCH, not the absence of a rejection.** A real
  rejected promise is reported asynchronously by the runtime and vitest owns that hook, so
  a test watching for one passed against BOTH mutations — dropping either `.catch`. A
  thenable that records whether `catch` was called asks the question directly.
- **The Android shell needs no config for it.** Capacitor's own bridge already calls
  `setMediaPlaybackRequiresUserGesture(false)` on the WebView, and there is no
  `CapacitorConfig` key for it — worth knowing before adding one that does not typecheck.

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
on the board every match is played on. It changes no rules;
it decides where things START, the way a formation does. `src/engine/__tests__/tutorial.test.
ts` plays the whole walkthrough as all eight species, because a step asking for
something the board cannot deliver leaves the tutorial stuck with nothing but Skip.

- **The enemy stands on the guard because the queen has no doorstep.** Her only neighbours
  are her four guards, so there is no square she can be attacked from — "attack the enemy,
  then take the queen" needs the enemy standing exactly there. A captured hive tile becomes
  an ordinary stable (§5), so this is a board the game produces by itself.
- **AND IT IS SUPPLIED HOME BY A TRAIL OF VEINS.** It used to stand on the guard alone, a
  dozen tiles from anything the enemy held — reported directly: "the tile of the enemy I'm
  attacking is separated from the nest... has to make sense how it got there." It has to
  make sense twice over: a detached tile produces nothing and is drawn grey (§4.2), so the
  first board a player ever sees was teaching the opposite of the rule the step before it
  had just explained; and a trail of VEINS is exactly what a long send leaves behind (§4.6),
  so the position now reads as a move the enemy made rather than as a tile that appeared
  there. A vein, never a row of stables — a garrisoned row out to the middle of the board is
  a second colony — and the trail is anchored at both ends by a captured tile, which is what
  satisfies both pruning rules (§4.5).
  - **`supplyPath` RETURNS NEITHER END, and that is what the one caller hid.** It walks back
    to the first tile the owner already holds and returns only what is BETWEEN: the far end
    is theirs already, and the near end is the tile it was asked about. Returning the near
    end turned the enemy's door — a stable holding the garrison the whole attack lesson is
    about — into an empty vein, and every species' walkthrough failed at the rally step. The
    player's camp hid it for as long as this had one caller, because the camp is re-claimed
    on the line after.
- **Five lessons, each on its own turn, each in TWO taps.** Move, long send, rally, attack,
  queen — and every one is "pick the tile up, then say where", because that is how the
  player will act for the rest of their life in this game. An earlier walk did the first tap
  for them on every step but the first, which taught half a control.
- **The enemy answers between the lessons, from a script.** `tutorialAiMove` takes one tile
  of empty ground beside the enemy's own colony and nothing else. A turn handed over is half
  of how the game works and a walkthrough where the board never replies teaches a solitaire —
  but it must not be the real search, or the board the next step is about is not the board
  the step was written for. Its events are muted (`scripted`) or a scripted capture would
  answer the step on screen.
- **AND THE DARK STANDS BACK SO THE PLAYER CAN WATCH THE TURN** (`standBack`, `tourWatch`).
  Asked for directly: "when we play steps of attack and move and all those similar we need
  to see what happens... tell the player what to do like now and when he does just delay
  animation a bit so whole screen can get visible again, then action is played, enemy plays
  their move and then we get the next step." The step was marching on the instant the deed
  resolved, so the thing the player had just been taught played out under four shade panels
  and a bubble, with the next instruction already over it.
  - **It is ONE beat with THREE parts, in order:** the overlay fades out, the player's own
    action plays, the enemy answers, and only then does the next step arrive. The enemy's
    reply moved OUT of the following step's `enter` to get that order — run from the step, it
    played after the instruction rather than before it.
  - **`watchMs` is the one length**, `700 + actGapOf(events)`, which is the same arithmetic
    `playAI` already waits by — a second copy is a second answer to "how long does a batch
    take" and it is the copy that goes stale (§7). A batch with no events is zero: there is
    nothing to watch.
  - **ONLY THE FOUR LESSONS ARE ANSWERED** (`ANSWERED`). Move, travel, rally and attack hand
    the turn over; the queen step is the last one and the walk ends on the hand-over it has
    been rehearsing, so an answer there would be the enemy playing after the tutorial was
    over.
  - **The timers are CLEARED on teardown** (`clearWatch`), or a screen torn down mid-beat
    signals a step into a tour that has moved on.
  - **And it is FADED, not hidden outright.** `visibility: hidden` with the opacity is what
    stops the panels taking a tap while they are invisible — a transparent panel is still the
    gate, which is the one thing it must not be once the player has done what was asked.
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
  - **AND A STEP MAY NOT DARKEN THE THING IT IS TALKING ABOUT.** Reported from a phone with
    the picture attached: "I'm changing the position on the map but the map part is
    darkened." The box was the picker alone, so the BOARD the step describes — the one thing
    a formation step is about — sat under a shade panel while the bubble explained it.
  - **THERE IS ONE HOLE, so the hole WIDENS; a second lit box would need a second set of
    panels.** `span(...)` in `app.ts` takes the union of several selectors' boxes and hands
    back one `SpotRect`, which is how the stage and the footer are lit together. A step that
    wants two things lit that are not adjacent wants a different mechanism, not two holes.
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

- Installed mobile viewport: `ui/installed-viewport.ts` calibrates one surface under the
  launch splash using the actual available window and hardware insets.
  After the first second, or immediately on blur/backgrounding, width, height and insets
  stay fixed. Same-screen resize, focus, pageshow and fullscreen events cannot recalibrate
  the game. Only a physical screen/orientation geometry change starts a new calibration.
  The installed host owns fullscreen; game taps never request DOM fullscreen.
  CSS width sizing and board hit geometry use the same app frame. Android retains the
  host-origin inset correction so transient bars overlay the same physical pixels.
  Browser tabs and desktop windows remain normally responsive.
- Setup uses an in-flow header, a constrained grid preview and a footer sized for its
  controls. Both canvas axes scale together inside the remaining stage; renderer pixel
  dimensions cannot push through the picker. Next/Play share Home's primary-action bounds,
  including the tray reservation. An invitation takes real flow space above the header.

## Maintenance review — November 2026

- Typography roles: Nunito for reading and forms; Poetsen at its native 400 weight for screen
  headings, prominent game figures and canvas labels. Canvas font strings are resolved by
  `render/typography.ts`; do not pass CSS `var()` syntax to canvas.
- `applyMove` derives combat context from the supplied modifiers when a caller does not
  provide an explicit context. Replays and live play must apply the same research and traits.
- Road checkpoint keys use canonical `f<number>` and `p<number>` spellings. Reject aliases
  before paying or normalising claims.
- Native storage writes are queued in call order; reads remain synchronous from memory.
- Renderer resets replace options as well as board state, including identities and ground.
- Account sign-in normalises account IDs and player codes consistently.

## Impossible difficulty

The user explicitly requested a fully upgraded fourth difficulty. Easy/Normal/Hard retain
their existing search and neutral enemy modifiers. Shared difficulty IDs live in
`engine/difficulty.ts`; capped enemy upgrades live in `engine/opponent-mods.ts`.
Impossible is selectable in Settings and applies to both challenges and matched opponents;
tutorials remain Easy. Modifiers and difficulty are stored in match setup for accurate
resumption and replay.

`ai/impossible.ts` searches complete legal turns for both players: travel, rally,
reinforcement, captures, waiting, abilities before movement or saving the cooldown, and targeted tunnelling.
Production, status effects and cooldowns advance in simulated turns. Iterative deepening
keeps only completed search iterations, with node/time limits, exact state deduplication
and a bounded transposition table. Income remains valuable after the expected match length.
Nest threats, resources, surge and attacking progress guide move ordering/evaluation.
Assault scoring compares actual attack power with projected nest defence and rewards
advancing a viable force; complete rally generation includes staging such an attack.

This is bounded selective search, not a proof of perfect or unbeatable play.
`tools/impossible-bench.ts` runs accelerated paired screening against Hard, including an
equal-upgrade control. Draws at the measurement horizon are reported as draws; they are
never relabelled wins. The shipping turn budget is larger than the screening budget.

- AI match calibration lives in the separate manual `ai-evaluation.yml` workflow.
  Do not add the long tournament to every UI deploy. Ordinary CI retains the tactical,
  legality, upgrade-cap, persistence and replay tests.
- `incomeOf` includes Brood Nursery's extra nest production, matching `runProduction`.
  The Impossible evaluator must not add the nursery a second time.

## Deployment image optimisation

Pages runs `tools/optimize_images.py` on the runner before tests and Vite hashing.
Original source artwork stays untouched in GitHub. WebP uses quality 86 with exact
alpha; PNG stays pixel-exact; JPEG uses progressive encoding. Dimensions and formats
are preserved, animated files are retained, and larger/negligible candidates are rejected.
The generated `image-optimization.json` reports actual source/deployment byte totals.
Run on a fresh checkout with Pillow 11.3.0; do not repeatedly recompress delivered files.
The service worker keeps complete offline precaching, with at most four requests at
once and reuse of content-hashed assets from the previous cache.

## Android test APK delivery

The Pages workflow generates `android/` from the pinned Capacitor installation,
applies `tools/configure_android.py`, then builds and lints a debug-signed APK.
`tools/android/MainActivity.java` owns native immersive bars and stable hardware
insets; transient bars overlay without changing the WebView dimensions. Portrait
is enforced in the generated manifest. The app bundles optimised `dist/` assets
and uses native Preferences; it never points at the live website.
The APK, checksum and build metadata are published under `downloads/` AFTER sync
so the APK cannot bundle itself. This is a test build, not a Play Store release.
The development certificate is cached by Actions; production signing remains separate.
Browser/PWA saves and Android app saves are separate; transfer via a backup code.

## Live release checks and broadcast inbox
`platform/live.ts` checks public, first-party release metadata and team mail at launch
and resume, with bounded responses/timeouts and no player data in requests.
`App.enableLiveServices()` is called by the real bootstrap; ordinary screen tests never
make network requests. Home alone presents update prompts, outside matches/tours/other
modals. Mail read state is per-colony; cached public messages remain readable offline.
APK updates use monotonically increasing versionCode, never SHA/date comparison.
`tools/package_apk.py` pins the first delivered certificate, then checks each published manifest.
Broadcast mail is read from the public GitHub file, independent of Pages; mail-only edits
are excluded from the game build trigger, so an announcement never forces an APK update.
Do not bypass that guard or ask players to uninstall to apply an update.
See `docs/live-operations.md` for publishing, current limitations and production setup.

The initial f050669 APK key cache was not saved (confirmed Actions path-validation warning).
Native update rollout is blocked until permanent signing and a pre-release save migration.
ANDROID_USER_HOME is now explicit; --retain-published preserves the prior checked APK during
web deployment when signing is incompatible. It does not publish the rejected APK.

## Shared button design
`src/ui/buttons.css`, imported after the legacy skin, owns action and icon-navigation
button visuals: a 12px radius, 2px neutral frame and 4px sharp bottom edge.
Primary actions use the home green; secondary and disabled actions use the dark
face with gray text. Disabled controls stay opaque and do not animate a press.
Selected navigation/modes and destructive confirmation keep their semantic cues.
Control dimensions and game interaction rules stay with their existing components.

## Panel frames
`src/ui/panels.css` extends the shared button frame to filled cards, HUD blocks,
collection tiles, popups and road rewards. Existing fill colors and artwork remain
component-owned. The inward 2px outline avoids layout/padding changes; corners and
sharp 4px bottom edges reuse the action tokens. Bare layout wrappers, titles, progress
tracks and transparent artwork are not boxed. Selection and keyboard-focus cues stay
visible. Road cards use the common frame around their existing face/rarity fills.

Home's menu, daily and hatch controls share a flex column. Their shared CSS uses
position: relative with inset: auto so unread badges can anchor without reactivating
legacy top/right offsets. Do not add a menu-only positioned override or offset.

## Grouped information sections
`ui/groups.ts` runs at the end of information/settings screen renders. Related rows
under one heading share a single `panel-group` frame; existing IDs and controls are
moved, never cloned. Profile's full-width colony and stats stay together. Repeated
renders and expanded backup/restore panels retain the same grouping. Shared 2px
`--action-stroke` controls both outer frames and internal grid/row dividers.
Keep individual art/choice catalogues, bare screen titles and scroll containers intact.

## Colony Pass material
Pass reward frames, track labels and the pass shop tile use the shared pastel
`--pass-prism` gradient in `ui/panels.css`. Resource faces and trait rarity fills
remain inside the frame. Free rewards retain their existing styling. Area backgrounds
stay solid; only the existing pass-side light particles adopt the pastel palette.
Keep text unstroked and ledges sharp; no animated shine or additional image assets.

## Full premium road field
The complete left 50% of the road, including its end caps, uses `--pass-prism`.
This supersedes the solid pass-side background rule. Area colors remain on the free
half. A clipped, low-opacity grid repeats PASS in the app display font behind rewards.
Lettering is decorative (`aria-hidden` on its field), static and pointer-transparent.

## Account view lifecycle
Replacing the host DOM for the colony picker or a selected account must run
`App.clearAccountView`: dispose the deck and transient views, clear the screen cache,
and reset nav/menu/home-bar references together. Detached screens cannot be replaced
with `replaceWith`; retaining them caused blank Settings after returning to a colony.
No profile keys or progress are removed by this view cleanup. Sign-in regression tests
cover repeat returns, navigation recreation and separation between account saves.

## Home match reward flight
Winning still credits troops immediately in `ProfileStore.recordResult`. Its account-scoped
`pendingHomeGain` is presentation metadata, persisted with the payout, never a second
reward. `ui/home-gain.ts` waits for visible Home, flies at most twelve painted swords
from Play into the troop count, and updates that count and chapter fill in place on impact.
Other routes preserve the receipt; leaving Home or suspending saves only the unseen part.
Account changes dispose the effect before replacing views. Reduced motion shows the final
balance without flights. Never delay settlement or credit resources from animation frames.

Home's reward count and progress fill share the reward RAF. The count displays whole
units while the fill uses the same fractional gain; both reach the final balance on
the same frame. Do not add an independent width transition to the Home progress bar.

## Immediate Home chapter changes and collected troop counts
`ui/home-art.ts` updates the existing Home background from the credited balance after
collection, independently of the displayed counter. It warms the next chapter and the
chapter a full granary can reach, keeping no decoded image objects after loading.
Collected troops use the same persisted Home receipt as match winnings, with optional
`source: "granary"` for count-only presentation. Legacy/match receipts omit it and keep
their sword flights. Cancel the old presentation before collection so partly displayed
wins are not replayed. Both modes share the continuous bar clock and quick 65ms text
hops, with at least 75ms between visible count changes. Collection never pays twice.

Settings rows show only their names and controls; descriptive subtitles and backup-status
paragraphs are removed. Keep section headings, build identification, input labels,
validation feedback and the existing confirmation button states.

## Horizontal versus screen
Matchmaking uses top and bottom curtains, with the shared gray frame along both sides
of their seam. VERSUS is a child of the top curtain and travels with it during the
vertical board reveal. As requested, the top ant enters from the left and the bottom
from the right; profile information sits opposite. Full-body images use transparent
`cutCoverFor` artwork. Portraits share the Antarium frame tokens and use the chosen
account avatar when supplied, with species card art otherwise. The computer-opponent
badge is removed; neutral choosing/waiting status remains. Preserve aborts, hold timing
and starting the match underneath the parting curtains.

Formation's header, preview and switching row share `--setup-width`. Its snapshot keeps
0.9 tiles of vertical scenery and uses the optional `padTilesX` override (0.55 tiles)
to remove transparent horizontal gutters. Preserve the canvas's intrinsic proportions
and its height limit; do not stretch the board or inset the full-width colony rail.
