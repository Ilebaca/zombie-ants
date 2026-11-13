# Campaign AI and loadout power

Regular matchmaking uses one chapter-scaled policy. Chapter 1 has zero research,
zero chambers and zero traits. Chapter 50 is the upper bound; chapters outside
1–50 are clamped. Tutorials retain their script and fixed challenges retain their
scenario controls. Existing matches keep their saved policy and equipment.

## Skill progression

`progress = (chapter - 1) / 49`. Equipment and skill are independent.

- Evaluation weights blend from the novice evaluation to the full evaluation.
  Threatened pieces, nest danger and infrastructure become more important. Actual
  tile/chamber income stays valuable in long games. A gradually weighted assault
  estimate rewards assembling and delivering enough force to break a growing nest,
  rather than treating every army above 40 troops as equally useful.
- Reinforcement starts at chapter 5, long travel at 9, infrastructure defence at 11,
  capture continuation at 13, rally at 19 and searched ability timing at 24.
- Search grows from 1 to 6 plies, 4 to 10 candidates, and 300 to 12,000 nodes.
  Its clock allowance grows from 35 to 180 ms, with additional small ability probes.
  The clock is checked periodically, so these are search budgets, not strict total-turn
  latency guarantees. A worker keeps thinking off the main rendering thread.
- Seeded lower-ranked legal choices have probability
  `0.72 * (1 - progress)^2`. This makes early opponents forgiving without inventing
  moves or changing the engine RNG. At chapter 50 this intentional mistake rate is zero.

Named Easy/Normal/Hard/Impossible policies remain compatibility and benchmark
controls. They are not separate campaign opponent versions. Regular Settings
shows Automatic rather than allowing the old manual campaign selection.

## Legal equipment

`chapterLoadout` builds the maximum scheduled equipment for the chapter:

- Research: `floor(10 * progress)`.
- Each chamber: `floor(chamberMaximum * progress)`.
- Traits: up to `floor(10 * progress)`, alternating Anthill and species slots,
  never exceeding slots opened at chapters 0/5/10/15/20.
- Trait rarity progresses through the existing five tiers. Attack, defence and
  cooldown traits use real inventory definitions, values and combined caps.

Scheduled ceilings before the loadout-power adjustment:

| Chapter | Research | Five-level chambers | Cultivation | Total traits | Trait tier |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 0 | 0 | 0 | 0 | — |
| 10 | 1 | 0 | 0 | 1 | Common |
| 25 | 4 | 2 | 1 | 4 | Rare |
| 50 | 10 | 5 | 3 | 10 | Mythic |

The chapter maximum is then reduced if it would create an excessive equipment
gap. Let `B` be the player's selected species power without upgrades and `P`
their active loadout power. The opponent equipment target is at most

```
(B + 0.65 * max(0, P - B)) * (0.90 + 0.15 * progress)
```

Step down the legal chapter loadout until its power fits, or no upgrades remain.
A species' natural base strength is never reduced through hidden modifiers.
Consequently a naturally strong species can exceed the target even naked.
The target is a ceiling, not a promise that every opponent has equal power.
Only part of earned player power is mirrored, so upgrades preserve an advantage.
No stats or policy are adjusted during a fight.

Early enemy rosters use Fire in chapter 1, starter species through chapter 7,
add Ghost/Pharaoh at 8 and Army/Bullet at 16. Cosmetics and wallet balances do
not determine strength.

## Universal loadout power, version 2

`engine/combatPower(species, mods)` is shared by player display and opponent
configuration. `ProfileStore.powerFor` obtains the same active modifiers used
in combat: selected species research, combat chambers and both equipped trait
benches. Unequipped inventory and closed slots do not count.

The score is the rounded sum of five weighted components:

| Component | Basis |
| --- | --- |
| Attack | 300 × species attack × research multiplier × capped attack traits |
| Defence | 250 × (species defence × research multiplier × capped defence traits + nest defence contribution + gland contribution) |
| Economy | 300 × reference income / 12 |
| Ability | 100 × ability-kind estimate × research recovery × 6 / expected cooldown |
| Opening | 50 × starting troops including Royal Chamber / 22 |

The reference economy is one nest, four ordinary producers and two resource
producers; cultivation and brood affect it. Nest defence
uses the engine's actual rounded bonus, scaled by 30; gland contributes 0.01 per
level. Ability-kind estimates range from 1.05 to 1.12 and the cooldown estimate
includes capped trait luck and the level-based recovery chance.

This is a transparent **equipment estimate**, not player skill, a hidden rating,
or a win-probability prediction. Position, map, ability timing, tactical choices
and species matchups still matter. Species price/rarity, colony size, XP,
currencies, stored units, Granary, avatars and skins contribute no points.
Incrementing an active legal upgrade never lowers the score. Component values
remain available to developers for explaining and tuning the total.

Changing weights requires incrementing POWER_VERSION and documenting the new
reference. Never use a historical score instead of the saved combat modifiers.

## Match persistence

`MatchSetup.aiControl` stores version, chapter and skill alongside actual
equipment. Worker and inline fallback receive the same control. Suspension and
resume retain the entire setup, so later upgrades or a new chapter cannot change
an interrupted opponent. Old records without aiControl use their saved named
difficulty. Replays consume recorded legal moves, not new AI decisions.

## Verification and tuning

The automated suite covers progression and trait legality across all 50 chapters
and all species, score monotonicity and exclusions, legal reproducible turns,
worker fallback and saved-match preservation.

Run `npx tsx tools/chapter-balance.ts 1` to audit chapters 1–5; repeat with
6, 11, …, 46 for all chapters. Each chapter has two seeded species pairings,
played with player sides swapped: 200 campaign games total. Reference-player
skill rises from 0.12 to 0.92 and gear follows the baseline schedule. Separate
equal-equipment skill comparisons and equal-skill gear comparisons add 20 games.
Every action is replayed and the final snapshots must agree.

By default the harness uses the shipped wall-clock and node limits, as a real worker
does. Thinking time and the deepest completed search can vary with hardware and runner
load; paired sides reduce first-move bias but do not remove timing variance. Add
`--nodes` to disable the clock for repeatable full-node diagnostics; this upper-bound
mode can take substantially longer and is not a phone-performance measurement.
`npx tsx tools/skill-balance.ts 0` through `9` add ten equal-equipment, paired-side
skill comparisons through 160 rounds, recording force-delivery diagnostics: 230 games
in the complete audit.
An unfinished game at 80 rounds is reported as a draw (half a point), never
adjudicated as a fabricated win. Small per-chapter samples are diagnostic, not
statistical proof of an exact difficulty ordering or human win rate.

Human ability cannot be inferred from chapter alone. Live balance should monitor
win rate by chapter and loadout-power band, repeat attempts, match duration and
abandonment before changing the curve. Avoid tuning one isolated chapter from
four simulated games, and retain the opening policy in match records when tuning.

## Release validation

The release audit uses the shipped worker budgets and legal engine moves. Its
extended equal-equipment skill comparison produced 7 wins, 3 cutoff draws and
0 losses for the chapter-50 policy against chapter 1 across five species with
sides swapped. This isolates a substantial tactical difference without research,
chambers or traits. A cutoff draw is not treated as a victory.

The full automated suite passes 1,863 tests across 120 files. Browser checks at
320 px and 390 px cover matching power displays, live upgrade and trait refresh, automatic
difficulty, worker replies, chapter-one neutral equipment, chapter-50 loadout
adjustment and preserved controls/modifiers after resuming against a changed
profile. Sample worker replies ranged from 2–12 ms for chapter 1 to about 210 ms
for chapter 50; these are desktop samples, not mobile-device latency guarantees.

The [recorded release audit](ai-balance-report.json) retains all 50 chapter summaries.
Of 200 campaign games, 44 ended in reference-player wins, 16 in opponent wins and
140 were unfinished at the 80-round cutoff. The reference policy is a synthetic
player whose skill rises from 0.12 to 0.92; these are not human win rates.
Late chapter bands remained competitive in this model, with reference-player
points around 54–55% including half-points for draws. The short per-chapter
sample and high cutoff count limit pacing conclusions; human telemetry is still
needed to calibrate actual completion times and win rates. No exact human
difficulty claim follows from these results.

## Shared tile output (power version 2)

Ordinary producing tiles add 1 troop per turn for every colony. Nests add 2 and
resource producers add 3 before shared upgrades and the Hive bonus. Species have
no production attribute. Power's reference-income term is now
`300 * (12 + 2 * cultivation + brood) / 12` for every species. The old release
audit is historical and does not describe this corrected balance.

New match records store rules version 2. Archived records retain their recorded
arithmetic. Resuming a pre-v2 fight reconstructs its position and records a rule
transition at the resume boundary; all subsequent production uses shared output.
This preserves the board, moves and replay without keeping old rates in live play.
