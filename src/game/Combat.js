/**
 * Deterministic combat with ±10% RNG variance.
 * Both sides lose soldiers proportional to the opponent's power share.
 * Returns { attackerRemaining, defenderRemaining, attackerWins }.
 */
export function resolveCombat(
  attackSoldiers,
  defendSoldiers,
  atkMod        = 1.0,
  defMod        = 1.0,
  tileDefBonus  = 0,
) {
  const atkPower = attackSoldiers * atkMod;
  const defPower = defendSoldiers * defMod + tileDefBonus;
  const total    = atkPower + defPower;
  if (total === 0) return { attackerRemaining: 0, defenderRemaining: 0, attackerWins: true };

  const variance = 0.9 + Math.random() * 0.2;  // 0.90 – 1.10

  const defLost = Math.round(defendSoldiers * (atkPower / total) * variance);
  const atkLost = Math.round(attackSoldiers * (defPower / total) * variance);

  const defLeft = Math.max(0, defendSoldiers - defLost);
  const atkLeft = Math.max(0, attackSoldiers - atkLost);

  return {
    attackerRemaining: atkLeft,
    defenderRemaining: defLeft,
    attackerWins: atkLeft > 0 && defLeft === 0,
  };
}
