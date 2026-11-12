# Economy balance — 12 November 2026

This tuning targets a free player who plays **three matches a day at a 50% win rate**.
Two matches a day is the lighter regular case; one and five matches are sensitivity checks.
These are projections of a declared routine, not measured retention or promised dates.

## Why the previous checks missed the problem

The old aggregate test omitted match mycelium, match XP and the daily gift, while paying
all three quests every day regardless of whether their goals were achievable. It also
counted the premium Demon Ant as a mycelium purchase and as a required free research sink.
Those errors hid how quickly ordinary players could finish the permanent upgrades.

The new model uses the actual ProfileStore reward, claim and purchase methods. Under the
routine below, old prices maxed the main species on day 9, every chamber on day 29 and
all seven earnable species' research on day 86. The road continued until day 290.

## New purchase prices

| Species | Previous mycelium | New mycelium |
| --- | ---: | ---: |
| Ghost Ant | 260 | 600 |
| Pharaoh Ant | 260 | 800 |
| Army Ant | 300 | 1,400 |
| Bullet Ant | 320 | 2,000 |

The three starters remain available immediately. Demon remains a premium purchase.
Species rarities are explicit catalogue data: changing a price must not recolour or
reorder a species.

| Purchase | Prices, in level order | Total |
| --- | --- | ---: |
| Chamber, mycelium | 100 / 240 / 500 / 950 / 1,600 | 3,390 for a five-level chamber |
| Species research, crystals | 90 / 140 / 210 / 300 / 420 / 570 / 750 / 960 / 1,200 / 1,500 | 6,140 per species |

Fungal Cultivation retains its three-level cap. All chambers together cost 14,400
mycelium, up from 3,745. Earnable species cost 4,800 combined, up from 1,140. Granary
prices and chapter gates stay at their existing total of 16,000.

The complete free permanent mycelium sink is therefore **35,200**. Research for all
seven earnable species costs **42,980 crystals**. A purchased Demon adds its own research
track; buying it never grants free levels.

## Measured pacing

One reproducible seed, with balanced purchases and all daily claims remembered:

| Goal | Previous, 3 matches/day | New, 3 matches/day | New, 2 matches/day |
| --- | ---: | ---: | ---: |
| First upgrade | Day 1 | Day 1 | Day 1 |
| First earnable species | Day 4 | Day 8 | Day 10 |
| All four earnable species | Day 14 | Day 56 | Day 71 |
| Main species level 10 | Day 9 | Day 38 | Day 43 |
| All chambers maxed | Day 29 | Day 129 | Day 166 |
| All free species researched | Day 86 | Day 337 | Day 371 |
| Road completed | Day 290 | Day 296 | Day 388 |

At one match daily, the first species projects to day 14 and the main species to level
10 around day 49. At five matches, those become days 6 and 32. At three matches with
40% and 60% win rates, the main species projects to days 39 and 37; losses still earn
mycelium and XP. This avoids making a losing day a wasted day.

In the first regular week, the new curve delivered five chamber levels, main species
level 5 and ten earned hatch rolls. On day 30 it had ten chamber levels and main level 9.
The early decisions remain frequent; the final steps require saving.

The more engaged scenario includes a daily-challenge attempt and claiming weekly league
prizes. It maxes the main species around day 35 and all free research around day 318.
Neither a pass nor purchases are required for these projections.

## Simulation assumptions and limits

Run `npm run economy` for the seven scenarios plus a twelve-seed regular-player cohort.
An optional day count can be supplied, for example `npm run economy -- 365`.

- A shuffled twenty-match deck preserves the requested long-run win rate while permitting
  losing streaks. Three daily matches never get rounded into two daily wins.
- One session and granary collection per day; the gift is claimed each day.
- A match lasts 45 turns, captures 12 enemy tiles on a win or 6 on a loss, and casts two
  abilities. A Hive queen is taken in 35% of matches. These event counts are assumptions,
  not telemetry. The player uses Carpenter when a tunnel quest requires it.
- Quest progress and claims use the real daily roll and goal checks. A three-match
  player cannot complete Play 5 Matches. Win quests depend on actual projected wins.
- Both match XP and quest XP feed the real level-reward claims. Road rewards are claimed
  at the peak reached, once per saved key; falling back never pays them again.
- The balanced spending plan reserves half of earned mycelium for the next species,
  spends the rest on affordable chambers and unlocked granary levels, and researches
  Fire first, then other owned species. Choosing to save everything or to buy more
  collection items changes the dates.
- Hatch rolls are earned but not spent by this core-upgrade plan. Fusion, larva trades,
  cash purchases and pass rewards are optional diversions. Optional league and daily
  challenge income are shown separately. One-time normal challenge clears are not
  assumed in the base routine; each still pays its real 12 mycelium.

The gift is a dependable income floor. Keeping it, match payouts, quest rewards and road
rewards unchanged avoids an additional reward nerf while prices are rebalanced.
Once permanent upgrades finish, wins still earn hatch rolls and both currencies retain
their existing collection sinks: larva at 250 mycelium and three-spare trait fusion.

## Compatibility and validation

Existing balances, owned species, purchased research, chambers and claimed reward keys
are preserved. Combat multipliers, cooldown chances, ten-level research caps, chamber
caps, win/loss troop maths and the 50-chapter road are unchanged. UI prices and debits
share the same functions; there is no second display-only price table.

Economy tests use broad pacing ranges across different seeds, protect first-day and
losing-player progress, include actual gifts and match XP, and retain passive-income
limits. These are regression targets. After real playtesting, compare purchase timing,
balances, quest completion and session frequency with these assumptions before retuning.
