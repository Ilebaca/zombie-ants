# Campaign AI and loadout power

Regular matchmaking scales the opponent's EQUIPMENT with the chapter and nothing
else. Chapter 1 has zero research, zero chambers and zero traits. Chapter 50 is the
upper bound; chapters outside 1–50 are clamped. Tutorials retain their script.
Existing matches keep their saved equipment.

## The play style does not scale

**The opponent plays the Normal policy on every chapter of the road.** This is a
reversal, asked for directly: *"I like the scaling for levels and traits and other
stuff but not for play style. It's too dumb on chapter 1, it should be as our
previous normal mode — just levels, traits and additions scale with chapters."*

What was here before interpolated the whole search policy off
`progress = (chapter - 1) / 49`, so chapter 1 got `skill = 0`. Zero is not Easy, it
is well below it: one ply, four candidates, the novice evaluation that cannot see
what is hanging, no quiescence, none of reinforce / travel / rally / vein defence,
and a 300-node budget — and on top of that the root discarded its own best move with
probability `0.72 * (1 - progress)^2`, which is **seven times in ten** on chapter 1
and still one in four at the half-way point of the road. A new player's first real
opponent was the weakest search the file can express.

Both are gone. `profileFor` returns the Normal profile for any campaign control, and
the intentional-mistake roll is deleted outright — a search that finds the move and
then plays a worse one is not a weaker player, it is the same player making a mistake
it had already seen. The chapter buys the opponent equipment, never worse judgement,
which is the same split the game makes for the player: progression buys numbers and
never decisions.

`AdaptiveControl.skill` stays on the record — a saved match describes the opponent it
was played against — and is simply no longer read when deciding how that opponent
thinks. Two tests hold this: every chapter's profile deep-equals Normal, and the same
position produces the same move at chapter 1 as at chapter 50 (which is what catches
the mistake roll returning, since it was the only thing that made the two differ).

Named Easy/Normal/Hard/Impossible policies remain compatibility and benchmark
controls. **Settings no longer shows an Enemy AI row at all** — it read "Automatic"
over a disabled button, which is a label for something the player was not choosing,
so the row and its "The next match" section were removed. Challenges, which used to
take their AI from that row's saved value, now play Normal with everything else; the
tutorial still plays Easy.

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
equipment. The `skill` figure is now descriptive only — it records what the match
was opened with and no longer decides how the opponent plays (see above). Worker and inline fallback receive the same control. Suspension and
resume retain the entire setup, so later upgrades or a new chapter cannot change
an interrupted opponent. Old records without aiControl use their saved named
difficulty. Replays consume recorded legal moves, not new AI decisions.

## Verification and tuning

The automated suite covers progression and trait legality across all 50 chapters
and all species, score monotonicity and exclusions, legal reproducible turns,
worker fallback and saved-match preservation.

Note that the balance tool's reference-player skill sweep below describes the
PLAYER side of each pairing; the opponent's own policy is Normal throughout.

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
