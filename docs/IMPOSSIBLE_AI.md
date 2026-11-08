# Impossible AI

Select **Settings → Enemy AI → Impossible**. The selection persists and applies to the
next challenge or matched opponent; the tutorial remains Easy.

The enemy has maximum legal chamber and research upgrades. Combat formulas, resource
production and ability rules are the player's normal rules. It has no additional actions.
Its upgrades are part of the recorded match setup, so suspended matches retain their
original difficulty and combat values.

The planner compares complete turns, including whether to cast an ability before its action or hold the cooldown,
and models the opponent doing the same. It considers travel, rallying, reinforcement,
resource acquisition, queen defence, attacks, waiting for growth and tunnel targets.
Resource production remains important throughout the match. Assault evaluation estimates
whether an advancing army can break the enemy nest after its projected growth; rallying
can assemble a force at a staging tile rather than waiting for an adjacent killing blow. Search reuses identical
positions and retains its last fully completed depth when its time/node budget expires.

The search is selective and bounded. “Impossible” names the challenge level; it does not
mean mathematically perfect play. The aim is aggressive play that preserves the queen,
builds a production advantage and converts it into a nest victory.

Validation includes tactical fixtures, replay consistency, upgrade caps, persistence,
and paired matches against Hard. The screening script reports actual nest/wipe wins and
draws separately. Its equal-upgrade mode helps separate decision quality from upgrades.

```bash
npm run check
npx tsx tools/impossible-bench.ts 32 8
```

The first argument reduces both opponents' shipping budgets, including Hard's separate
ability probes, for fast screening.
Use divisor 1 for full-budget evaluation. A short screening run is not a player win-rate
estimate; performance and choices also vary with the available device time.

The separate **Evaluate Impossible AI** Actions workflow runs on AI/rules changes and can rerun screening or full-budget
tests without publishing the game. Ordinary deployments keep the tactical regression suite
but do not repeat the longer match calibration.

[Calibration runs](https://github.com/Ilebaca/zombie-ants/actions/workflows/ai-evaluation.yml)
include both the configured opponent and equal-upgrade controls, plus a full-budget
search-depth/timing probe. Treat accelerated scores as calibration rather than a rating
for full-budget play or a prediction of human win rates.
