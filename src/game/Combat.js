/**
 * v1.4 deterministic combat — no RNG.
 *
 * Stable-tile combat:
 *   A = sentSoldiers × atkMod
 *   D = garrisonedSoldiers × defMod + tileDefBonus
 *   A > D → attacker wins; defenders wiped; attacker losses = floor(sent × D/A)
 *   A ≤ D → defender wins; attackers wiped; defender losses = floor(garrisoned × A/D)
 *
 * Vein combat (raid):
 *   damage = floor(sentSoldiers × atkMod); attacker returns with 0 losses.
 */

export function stableCombat(sentSoldiers, garrisoned, atkMod, defMod, tileDefBonus = 0) {
  const A = sentSoldiers * atkMod;
  const D = garrisoned  * defMod + tileDefBonus;

  if (A > D) {
    return {
      attackerWins:      true,
      attackerSurvivors: sentSoldiers - Math.floor(sentSoldiers * D / A),
      defenderSurvivors: 0,
    };
  }
  return {
    attackerWins:      false,
    attackerSurvivors: 0,
    defenderSurvivors: garrisoned - Math.floor(garrisoned * A / D),
  };
}

export function veinDamage(sentSoldiers, atkMod) {
  return Math.floor(sentSoldiers * atkMod);
}
