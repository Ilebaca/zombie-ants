/**
 * EVERY DRAWN THING IN THE GAME, GROUPED ONTO ONE PAGE PER GROUP.
 *
 * The other half of `tools/shots.ts`. The screens export says what the app LOOKS like;
 * this hands over the PARTS — the icon family, the nine colonies' portraits, every skin,
 * every trait tile, the rarity ladder, the twelve formations, the board's own elements,
 * the chambers and the shop — at a size somebody can actually use in a store listing or a
 * press kit.
 *
 * Almost nothing in this game is a file (CLAUDE.md: the home artwork, the region grounds
 * and the launcher icon are the only pictures that are), so there is no folder of assets
 * to hand over — which is exactly why this exists. Every mark below is drawn by the code
 * that owns it: `ui/icons.ts` for the chrome, `render/art.ts` for the ants and the nests,
 * `render/snapshot.ts` for anything on a board. Nothing is redrawn here, so a sheet cannot
 * show a mark the game has stopped using.
 *
 * TOOL, NOT BUILD STEP — see `tools/shots.ts`.
 */
/* eslint-disable */
import "../../src/ui/game.css";
import "../../src/ui/skin.css";
import {
  MAPS, SPECIES, START_SHAPES, TIER_IDS, TIERS, clearBoard, createGame, hiveTick,
  looksFor, razeTile, tile,
} from "../../src/engine";
import { antPortrait } from "../../src/ui/chrome";
import { ICON_NAMES, icon } from "../../src/ui/icons";
import { CHAMBERS, RESEARCH_TRACKS } from "../../src/platform/catalogue";
import { SHOP_PRODUCTS } from "../../src/platform/purchases";
import {
  TRAITS, TRAIT_TIER, effectFigure, markOf, tierOdds,
} from "../../src/platform/traits";
import { drawSnapshot } from "../../src/render";
import { loadColors, nestArt, setFactionColor } from "../../src/render";

const root = document.getElementById("sheet") as HTMLElement;
const ALL = Object.keys(SPECIES) as any[];

/* ------------------------------------------------------------------- THE PAGE */

const style = document.createElement("style");
style.textContent = `
  html, body { margin: 0; background: #0e1a12; }
  #sheet {
    width: 1200px; box-sizing: border-box; padding: 32px 32px 40px;
    background: #0e1a12; color: #eaf3ea;
    font-family: Nunito, system-ui, sans-serif;
  }
  .sh-h { font-size: 26px; font-weight: 900; letter-spacing: -.3px; }
  .sh-sub { font-size: 14px; color: #9fb3a4; margin: 6px 0 26px; max-width: 760px; line-height: 1.5; }
  .sh-grid { display: grid; gap: 14px; }
  .sh-cell {
    background: #17261b; border: 1px solid #273b2c; border-radius: 12px;
    padding: 14px 10px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .sh-cell svg { display: block; }
  .sh-name { font-size: 12px; font-weight: 800; }
  .sh-note { font-size: 11px; color: #9fb3a4; line-height: 1.35; }
  .sh-row { display: flex; align-items: center; gap: 14px; text-align: left; }
  .sh-row .sh-name { font-size: 15px; }
  .sh-tier { font-size: 11px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; }
  .sh-sec { font-size: 15px; font-weight: 900; margin: 26px 0 12px; color: #c7d8c9; }
  .sh-wm { display: flex; align-items: baseline; gap: 12px; line-height: 1; }
  .sh-wm b { font-size: 64px; font-weight: 900; letter-spacing: -1px; }
  .sh-wm span { font-size: 64px; font-weight: 900; letter-spacing: 9px; color: #7ee787; }
`;
document.head.appendChild(style);

const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const grid = (cols: number, min = ""): HTMLElement => {
  const g = el("div", "sh-grid");
  g.style.gridTemplateColumns = min
    ? `repeat(auto-fill, minmax(${min}, 1fr))`
    : `repeat(${cols}, 1fr)`;
  return g;
};

const cell = (...kids: (Node | string)[]): HTMLElement => {
  const c = el("div", "sh-cell");
  for (const k of kids) c.append(k);
  return c;
};

/* --------------------------------------------------------------- BOARD FIGURES */

/** A throwaway board to arrange one element on — the same trick the manual uses. */
function blank(keepHive = false) {
  return clearBoard(
    createGame({ map: "small", species: { you: "leafcutter", ai: "fire" }, seed: 7 }),
    keepHive,
  );
}

/** One figure, drawn by the board's own code from a real position. */
function figure(
  build: (s: any) => void,
  view: { c: number; r: number; cols: number; rows: number },
  opts: { hive?: boolean; tile?: number } = {},
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const state = blank(!!opts.hive);
  build(state);
  drawSnapshot(canvas, state, { tile: opts.tile ?? 54, view, hideCounts: false });
  return canvas;
}

const put = (s: any, c: number, r: number, o: any): void => {
  const t = tile(s, c, r);
  for (const k of Object.keys(o)) (t as any)[k] = o[k];
};

/* ---------------------------------------------------------------- THE SHEETS */

const SHEETS: Array<{ name: string; build: () => void }> = [];
const sheet = (name: string, build: () => void): void => { SHEETS.push({ name, build }); };

const head = (title: string, sub: string): void => {
  root.append(el("div", "sh-h", title), el("div", "sh-sub", sub));
};

/* 1. The icon family. */
sheet("sheet-01-icons", () => {
  head("Interface marks", "One family of solid marks on a 24 grid, drawn in the current "
    + "text colour (src/ui/icons.ts). There are no emoji anywhere in the chrome — these "
    + "are what every tab, currency, chamber, quest, product and action button is drawn "
    + "with, and they are named rather than carried, so one mark can serve many screens.");
  const g = grid(0, "110px");
  for (const name of ICON_NAMES) {
    const mark = icon(name, 44);
    mark.style.color = "#eaf3ea";
    g.append(cell(mark, el("div", "sh-name", name)));
  }
  root.append(g);
});

/* 2. The nine colonies. */
sheet("sheet-02-colonies", () => {
  head("The nine colonies", "Every portrait is drawn by `render/art.ts` — the same code "
    + "that draws the head beside a colony's name on the board. Attack and defence are "
    + "the species multipliers; the ability is what the colony is actually for.");
  const g = grid(3);
  for (const id of ALL) {
    const s = SPECIES[id];
    const c = cell(antPortrait(id, 180), el("div", "sh-name", s.name));
    c.append(el("div", "sh-note", `ATK ${s.atk.toFixed(2)}  ·  DEF ${s.def.toFixed(2)}  ·  PROD ${s.prod.toFixed(2)}`));
    c.append(el("div", "sh-note", s.blurb));
    c.append(el("div", "sh-note", `${s.ability.name} — ${s.ability.cooldown}t cooldown`));
    g.append(c);
  }
  root.append(g);
});

/* 3. Every look a colony can wear. */
sheet("sheet-03-skins", () => {
  head("Skins", "Three looks per colony: the one it is born with, then a COLOURWAY "
    + "(Exceptional) and a drawn OVERLAY (Mythic), both found in the lucky hatch and "
    + "never sold. A look changes nothing about a match. No skin may read as another "
    + "species, and none of them is grey — the board greys out ground it has cut off.");
  for (const id of ALL) {
    root.append(el("div", "sh-sec", SPECIES[id].name));
    const g = grid(3);
    for (const look of looksFor(id)) {
      const c = cell(antPortrait(id, 150, undefined, look), el("div", "sh-name", look.name));
      const t = TIERS[(look as any).tier as keyof typeof TIERS];
      if (t) {
        const tag = el("div", "sh-tier", t.name);
        tag.style.color = t.colour;
        c.append(tag);
      } else {
        c.append(el("div", "sh-tier", "Basic"));
      }
      g.append(c);
    }
    root.append(g);
  }
});

/* 4. The abilities. */
sheet("sheet-04-abilities", () => {
  head("The nine abilities", "Real ant behaviour, used as the mechanic. An ability is a "
    + "FREE extra action — except Tunnelling, which spends the turn. Every number in "
    + "these sentences is read out of `engine/config.ts`, so the copy cannot disagree "
    + "with the rule.");
  const g = grid(1);
  for (const id of ALL) {
    const s = SPECIES[id];
    const row = el("div", "sh-cell sh-row");
    const txt = el("div");
    txt.append(el("div", "sh-name", `${s.ability.name} — ${s.name}`));
    txt.append(el("div", "sh-note", `Cooldown ${s.ability.cooldown} turns`));
    txt.append(el("div", "sh-note", s.ability.desc));
    row.append(antPortrait(id, 96), txt);
    g.append(row);
  }
  root.append(g);
});

/* 5. The rarity ladder. */
sheet("sheet-05-rarity", () => {
  head("One rarity ladder", "Five rungs, used by everything in the game that has a "
    + "rarity — traits, colonies and skins (`engine/tiers.ts`). The percentage is what "
    + "the lucky hatch really rolls at: the figure is derived from the weights the roll "
    + "uses, never typed out beside them.");
  const g = grid(5);
  for (const id of TIER_IDS) {
    const t = TIERS[id];
    const swatch = el("div");
    swatch.style.cssText = `width:84px;height:84px;border-radius:14px;background:${t.colour}`;
    const c = cell(swatch, el("div", "sh-name", t.name));
    c.append(el("div", "sh-note", t.colour));
    c.append(el("div", "sh-note", `${tierOdds(id)}% of hatches`));
    const d = TRAIT_TIER[id];
    c.append(el("div", "sh-note", `+${d.stat}% stat  ·  ${d.luck}% luck`));
    g.append(c);
  }
  root.append(g);
});

/* 6. Every trait. */
sheet("sheet-06-traits", () => {
  head("Traits", `All ${TRAITS.length} of them: five per colony and eight universal ones `
    + "for the anthill's own bench. A tile is the trait's mark in its tier's colour, with "
    + "what it is worth under it. The tier a trait rolls at is luck, so each one below is "
    + "drawn at the rung this sheet happens to show it at.");
  const tiers = TIER_IDS;
  let n = 0;
  const groups: Array<[string, any[]]> = [
    ["The anthill — universal", TRAITS.filter((t) => !t.species)],
    ...ALL.map((id) => [SPECIES[id].name, TRAITS.filter((t) => t.species === id)] as [string, any[]]),
  ];
  for (const [label, list] of groups) {
    root.append(el("div", "sh-sec", label));
    const g = grid(0, "140px");
    for (const def of list) {
      const t = TIERS[tiers[n++ % tiers.length] as keyof typeof TIERS];
      const c = el("div", "sh-cell");
      c.style.borderColor = t.colour;
      const mark = icon(def.icon, 40);
      mark.style.color = t.colour;
      const kind = icon(markOf(def.kind), 18);
      kind.style.color = "#9fb3a4";
      const figRow = el("div", "sh-row");
      figRow.append(kind, el("span", "sh-name", effectFigure(def, t.id as any)));
      c.append(mark, el("div", "sh-name", def.name), figRow);
      const tag = el("div", "sh-tier", t.name);
      tag.style.color = t.colour;
      c.append(tag, el("div", "sh-note", def.note));
      g.append(c);
    }
    root.append(g);
  }
});

/* 7. The twelve formations. */
sheet("sheet-07-formations", () => {
  head("The twelve formations", "Where a colony's five opening tiles stand. Every one is "
    + "exactly five tiles; the choice is shape, not size. Drawn on the real 9x9 board "
    + "through the board's own code, with the enemy razed off it — their corner is the "
    + "one thing in the picture that is not the choice being made.");
  const g = grid(4);
  for (const id of Object.keys(START_SHAPES)) {
    const canvas = document.createElement("canvas");
    const state = createGame({
      map: "small", species: { you: "leafcutter", ai: "leafcutter" } as any,
      shape: (START_SHAPES as any)[id], seed: 0x5eed,
    });
    for (const row of state.grid) {
      for (const t of row) {
        if (t.owner !== "ai") continue;
        razeTile(t);
        t.guard = 0;
      }
    }
    drawSnapshot(canvas, state, { tile: 24, padTiles: 0.4 });
    g.append(cell(canvas, el("div", "sh-name", id)));
  }
  root.append(g);
});

/* 8. What is on the board. */
sheet("sheet-08-board", () => {
  head("What is on the board", "Each picture is a real position drawn by the board's own "
    + "code (`render/snapshot.ts`), not an illustration of one — so none of these can "
    + "show something the engine cannot produce.");
  const g = grid(4);
  const win = (c: number, r: number, n = 3) => ({ c, r, cols: n, rows: n });

  g.append(cell(figure((s) => {
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 12 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 4 });
    put(s, 1, 2, { owner: "you", struct: "stable", soldiers: 3 });
  }, win(0, 0)), el("div", "sh-name", "Your nest"),
    el("div", "sh-note", "The queen. +6 flat defence, 2 production. Lose it and the match ends.")));

  g.append(cell(figure((s) => {
    put(s, 1, 1, { owner: "ai", struct: "nest", soldiers: 12 });
    put(s, 1, 2, { owner: "ai", struct: "stable", soldiers: 4 });
  }, win(0, 0)), el("div", "sh-name", "The enemy nest"),
    el("div", "sh-note", "Take it and you win, however the rest of the board stands.")));

  g.append(cell(figure((s) => {
    put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 6 });
    put(s, 2, 1, { owner: "ai", struct: "stable", soldiers: 5 });
  }, win(0, 0)), el("div", "sh-name", "Stables"),
    el("div", "sh-note", "Captured ground. 1 production, +1 flat defence.")));

  g.append(cell(figure((s) => {
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 9 });
    put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 1 });
    put(s, 3, 1, { owner: "you", struct: "vein", soldiers: 1 });
    put(s, 3, 2, { owner: "you", struct: "stable", soldiers: 4 });
  }, { c: 0, r: 0, cols: 5, rows: 4 }), el("div", "sh-name", "A vein trail"),
    el("div", "sh-note", "Infrastructure: it produces nothing, has no defence, and prunes when it loses an anchor.")));

  g.append(cell(figure((s) => {
    put(s, 1, 1, { terrain: "resource" });
    put(s, 2, 2, { terrain: "resource", owner: "you", struct: "stable", soldiers: 5 });
  }, win(0, 0)), el("div", "sh-name", "Resource tiles"),
    el("div", "sh-note", "3 production when captured, up to 6 with Fungal Cultivation. +2 flat defence.")));

  g.append(cell(figure((s) => {
    put(s, 1, 1, { terrain: "blocked" });
    put(s, 2, 2, { terrain: "blocked" });
  }, win(0, 0)), el("div", "sh-name", "Blocked ground"),
    el("div", "sh-note", "Rock: nothing crosses it, tunnelling included. The board is 180°-symmetric, so both colonies meet the same obstacles.")));

  g.append(cell(figure((s) => {
    put(s, 2, 2, { soldiers: 7, guard: 1 });
  }, win(1, 1)), el("div", "sh-name", "A wild garrison"),
    el("div", "sh-note", "Neutral soldiers holding ground. +1 flat defence, and damage hurts them like anybody else.")));

  const hiveFig = figure((s) => {
    // Awake, on the turn she wakes: the engine sets her garrison, not this sheet.
    s.turn = MAPS.small.awakenTurn;
    hiveTick(s, "you");
  }, { c: 2, r: 2, cols: 5, rows: 5 }, { hive: true, tile: 44 });
  g.append(cell(hiveFig, el("div", "sh-name", "The Hive"),
    el("div", "sh-note", "A wild queen with four guards, infected with Ophiocordyceps. Only the middle tile pays the surge.")));

  root.append(g);

  root.append(el("div", "sh-sec", "Nest shapes"));
  const hills = grid(0, "150px");
  for (const name of ["mound", "tree", "volcano", "pyramid", "bunker", "horn"]) {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 220;
    const g2 = canvas.getContext("2d");
    if (g2) {
      g2.scale(2, 2);
      nestArt(g2, 55, 62, 42, name as any, "#e8a33d");
    }
    canvas.style.width = "110px";
    canvas.style.height = "110px";
    hills.append(cell(canvas, el("div", "sh-name", name)));
  }
  root.append(hills);
});

/* 9. The anthill's chambers and the research tracks. */
sheet("sheet-09-anthill", () => {
  head("Chambers and research", "Chambers are bought with mycelium and are account-wide; "
    + "research is bought with pheromone and belongs to one colony. The AI gets neither — "
    + "it competes on decision quality only, so none of this is ever mandatory.");
  const g = grid(1);
  for (const ch of CHAMBERS) {
    const row = el("div", "sh-cell sh-row");
    const mark = icon(ch.icon, 40);
    mark.style.color = "#e8c33d";
    const txt = el("div");
    txt.append(el("div", "sh-name", `${ch.name}  (max ${ch.max})`));
    txt.append(el("div", "sh-note", ch.desc));
    txt.append(el("div", "sh-note", `Level 1: ${ch.effect(1)}  ·  Level ${ch.max}: ${ch.effect(ch.max)}`));
    row.append(mark, txt);
    g.append(row);
  }
  root.append(g);
  root.append(el("div", "sh-sec", "Research tracks"));
  const r = grid(1);
  for (const track of RESEARCH_TRACKS) {
    const row = el("div", "sh-cell sh-row");
    const mark = icon((track as any).icon ?? "flask", 36);
    mark.style.color = "#8fd0ff";
    const txt = el("div");
    txt.append(el("div", "sh-name", (track as any).name));
    txt.append(el("div", "sh-note", (track as any).desc ?? ""));
    txt.append(el("div", "sh-note", (track as any).effect ?? ""));
    row.append(mark, txt);
    r.append(row);
  }
  root.append(r);
});

/* 10. The shop. */
sheet("sheet-10-shop", () => {
  head("What the shop sells", "Only what the game can spend: mycelium, pheromone, larva, "
    + "the Colony Pass and the one premium colony. Skins and traits are FOUND, never sold. "
    + "Each id is the Play Console SKU and names its own grant, so nobody wiring the real "
    + "store up has to check what a tile hands over.");
  const g = grid(2);
  for (const p of SHOP_PRODUCTS) {
    const row = el("div", "sh-cell sh-row");
    const mark = icon(p.icon, 36);
    mark.style.color = "#e8c33d";
    const txt = el("div");
    txt.append(el("div", "sh-name", `${p.title ?? p.id}  —  ${p.price}`));
    txt.append(el("div", "sh-note", p.sub ?? ""));
    txt.append(el("div", "sh-note", `${p.id}  ·  ${JSON.stringify(p.grant)}`));
    row.append(mark, txt);
    g.append(row);
  }
  root.append(g);
});

/* 11. The wordmark. */
sheet("sheet-11-wordmark", () => {
  head("The mark", "The wordmark is type, drawn by the document itself — it is the one "
    + "piece of the app that has to be on screen before a line of script has run. The "
    + "launcher icon is the game's own ant head, rendered through `tools/icons.ts`.");
  const wm = el("div", "sh-wm");
  wm.append(el("b", undefined, "ZOMBIE"), el("span", undefined, "ANTS"));
  root.append(wm);
  root.append(el("div", "sh-sec", "The head, in every colony's colour"));
  const g = grid(0, "150px");
  for (const id of ALL) {
    g.append(cell(antPortrait(id, 128), el("div", "sh-name", SPECIES[id].name)));
  }
  root.append(g);
});

/* ------------------------------------------------------------- THE DRIVER'S API */

(window as any).sheets = {
  names: SHEETS.map((s) => s.name),
  show(i: number): void {
    root.replaceChildren();
    // Both factions are painted before anything is drawn: the palette is global, so a
    // sheet that drew a board before this would show whatever colour ran last
    // (CLAUDE.md — `setFactionColor` has exactly that trap).
    setFactionColor("you" as any, "leafcutter" as any);
    setFactionColor("ai" as any, "fire" as any);
    // AND THEN READ BACK. The palette is cached off the stylesheet's custom properties, so
    // setting a faction colour without this leaves every tile drawn in the colour the page
    // loaded with — which is the board's slate rather than a colony's own green.
    loadColors();
    SHEETS[i]?.build();
  },
};
(window as any).sheetsReady = true;
