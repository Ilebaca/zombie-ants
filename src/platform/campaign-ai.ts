/** Campaign loadouts use player-legal upgrades and actual trait definitions. */
import { CHAMBER_MAX, NEUTRAL_MODS, combatPower } from "../engine";
import type { AdaptiveControl, PlayerMods, PowerRating, SpeciesId } from "../engine";
import { combine, slotsOpen, totalsOf, traitsFor } from "./traits";
import type { TraitItem, TraitKind, TraitTier } from "./traits";

export interface CampaignOpponent {
  control: AdaptiveControl;
  mods: PlayerMods;
  traits: { hill: TraitItem[]; species: TraitItem[] };
  power: PowerRating;
  playerPower: PowerRating;
  gearStep: number;
}
export const campaignChapter = (chapter: number): number =>
  Number.isFinite(chapter) ? Math.max(1, Math.min(50, Math.floor(chapter))) : 1;

/** Baseline chapter loadout; optional step only reduces gear, never increases it. */
export function chapterLoadout(chapter: number, species: SpeciesId, step = campaignChapter(chapter) - 1) {
  const at = campaignChapter(chapter);
  const progress = Math.max(0, Math.min(at - 1, Math.floor(step))) / 49;
  const mods: PlayerMods = { ...NEUTRAL_MODS, researchLevel: Math.floor(progress * 10) };
  for (const key of Object.keys(CHAMBER_MAX) as Array<keyof typeof CHAMBER_MAX>) {
    mods[key] = Math.floor(CHAMBER_MAX[key] * progress);
  }
  const count = Math.min(2 * slotsOpen(at), Math.floor(progress * 10));
  const tiers: TraitTier[] = ["common", "uncommon", "rare", "exceptional", "mythic"];
  const tier = tiers[Math.min(4, Math.floor(progress * 4.999))] ?? "common";
  const kinds: TraitKind[] = ["attack", "defence", "cooldown"];
  const traits = { hill: [] as TraitItem[], species: [] as TraitItem[] };
  for (let i = 0; i < count; i++) {
    const scope = i % 2 === 0 ? "hill" : "species";
    const kind = kinds[Math.floor(i / 2) % kinds.length] ?? "attack";
    const pool = traitsFor(scope === "hill" ? "hill" : species);
    const def = pool.find(t => t.kind === kind) ?? pool[0];
    if (def) traits[scope].push({uid:`opponent-${scope}-${i}`, def:def.id, tier});
  }
  const totals = combine(totalsOf(traits.hill), totalsOf(traits.species));
  mods.atkPct = totals.atkPct; mods.defPct = totals.defPct; mods.boonPct = totals.luckPct;
  return {mods, traits};
}

/**
 * Chapter drives skill. Power only softens an excessive equipment mismatch; it never
 * raises the chapter's gear ceiling, and nothing changes after the match has started.
 */
export function campaignOpponent(
  chapter: number, species: SpeciesId, playerSpecies: SpeciesId, playerMods: PlayerMods,
): CampaignOpponent {
  const at = campaignChapter(chapter);
  const progress = (at - 1) / 49;
  const playerPower = combatPower(playerSpecies, playerMods);
  const ceiling = playerPower.total * (.90 + .15 * progress);
  let step = at - 1;
  let loadout = chapterLoadout(at, species, step);
  while (step > 0 && combatPower(species, loadout.mods).total > ceiling) {
    loadout = chapterLoadout(at, species, --step);
  }
  return { ...loadout, gearStep:step, playerPower, power:combatPower(species, loadout.mods),
    control:{ version:1, chapter:at, skill:progress } };
}
