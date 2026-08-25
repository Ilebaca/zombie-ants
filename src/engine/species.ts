import type { Species, SpeciesId } from "./types";

/**
 * Nine colonies. The multiplier spread is intentionally narrow (0.70–1.25):
 * species should change HOW you win, not guarantee that you do.
 */
export const SPECIES: Record<SpeciesId, Species> = {
  ghost: {
    id: "ghost", name: "Ghost Ant", atk: 1.21, def: 1.09, prod: 1.0,
    blurb: "Stealth over strength. Strikes unseen.",
    trait: "Pheromone mask — soldier counts hidden until contact.",
    ability: { name: "Tunnelling", kind: "tunnel", cooldown: 5, startSpent: true,
      desc: "Dig a hidden gallery to an empty tile deep in the field. The tunnel mouth is yours instantly with 5 workers, stays linked to the colony even when surrounded, and you can Rally to it or expand from it like any tile. It must always hold 5 workers." },
  },
  pharaoh: {
    id: "pharaoh", name: "Pharaoh Ant", atk: 0.99, def: 1.12, prod: 1.25,
    blurb: "The supercolony. Splits and floods.",
    trait: "Budding — rapid, costless expansion.",
    ability: { name: "Bud", kind: "bud", cooldown: 6,
      desc: "Every tile with 40+ troops buds a new colony onto an adjacent empty tile — for free." },
  },
  leafcutter: {
    id: "leafcutter", name: "Leafcutter", atk: 1.13, def: 1.25, prod: 1.15,
    blurb: "Economic powerhouse. Avoids the fight.",
    trait: "Fungal cultivation — terraforms the field.",
    ability: { name: "Fungal Garden", kind: "leaf", cooldown: 6,
      desc: "Grows a leaf wall on your borders — impassable to the enemy for 4 turns; +40% defense after it withers. Exocrine reservoir research (Lv 2–4) makes one wall permanent per cast, up to 1/2/3 total." },
  },
  fire: {
    id: "fire", name: "Fire Ant", atk: 0.86, def: 0.87, prod: 1.05,
    blurb: "Balanced & territorial. The honest fighter.",
    trait: "Swarm response — scorched-earth defender.",
    ability: { name: "Wildfire", kind: "fire", cooldown: 6,
      desc: "Your colony's borders ignite for 3 turns; enemies on fire lose 30% each turn and any vein caught in it burns away. Detached tiles don't ignite." },
  },
  army: {
    id: "army", name: "Army Ant", atk: 1.10, def: 0.79, prod: 0.95,
    blurb: "Nomadic raider. Lives to attack.",
    trait: "Bivouac — a devouring column.",
    ability: { name: "Feeding Swarm", kind: "swarm", cooldown: 6,
      desc: "Bordering enemy tiles lose 15% of their troops — devoured and added to your colony. Only tiles touching your colony at cast time are eaten." },
  },
  weaver: {
    id: "weaver", name: "Weaver Ant", atk: 1.07, def: 1.04, prod: 1.0,
    blurb: "The expansionist. Many fronts at once.",
    trait: "Silk bridges — pushes into enemy ground.",
    ability: { name: "Spread", kind: "spread", cooldown: 5,
      desc: "Claim every empty tile you border on the enemy's half of the map." },
  },
  carpenter: {
    id: "carpenter", name: "Carpenter", atk: 0.91, def: 1.06, prod: 1.05,
    blurb: "The fortress. Nightmare to dislodge.",
    trait: "Reinforced veins — digs in hard.",
    ability: { name: "Fortify", kind: "fortify", cooldown: 6,
      desc: "Majors muster on the border: every frontline tile gains +12% garrison, and the whole colony defends at +70% for 3 turns." },
  },
  bullet: {
    id: "bullet", name: "Bullet Ant", atk: 1.22, def: 0.84, prod: 0.70,
    blurb: "Glass cannon. Devastating per unit.",
    trait: "Pain gland — chemical barrage.",
    ability: { name: "Venom Rain", kind: "venom", cooldown: 6,
      desc: "Venom rains across the whole board at random. Enemy tiles caught in it lose 10 troops/turn for 3 turns — your tiles and both main bases are immune." },
  },
  demon: {
    id: "demon", name: "Demon Ant", atk: 1.09, def: 1.0, prod: 0.95, premium: true,
    blurb: "Premium. Sacrifices her own for power.",
    trait: "Terror pheromone — panics nearby colonies into flight.",
    ability: { name: "Flee", kind: "flee", cooldown: 6,
      desc: "Fear ripples out: every mobile enemy garrison within 3 tiles of your colony flees directly away until it is beyond that reach. Veins, tunnels, resources and the Hive cannot be pushed. Tiles that collide while fleeing merge into one." },
  },
};

export const speciesOf = (id: SpeciesId): Species => SPECIES[id];
