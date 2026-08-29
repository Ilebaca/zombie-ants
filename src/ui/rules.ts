/**
 * HOW TO PLAY — the manual.
 *
 * It was seven lines of prose. This game has deterministic combat a player is meant to
 * count out, supply lines that freeze a colony that ignores them, veins with rules of their
 * own, and a Hive that wakes on a clock — none of which fits in a paragraph, and all of
 * which a player has to be told rather than left to discover through losing.
 *
 * THE PICTURES ARE NOT SCREENSHOTS. Each one is a real `GameState` drawn by the board's own
 * code (`render/snapshot.ts`), so a change to how a vein or a wild garrison is drawn shows
 * up here on the same commit. There is no image file to keep in step with the game, and a
 * figure can never illustrate a rule the engine no longer has.
 *
 * THE NUMBERS COME FROM THE ENGINE for the same reason. Production, flat defence, the
 * one-soldier floor, travel range, when the Hive wakes — every figure on this screen is
 * read from `engine/config.ts` rather than typed out, so a balance change cannot leave the
 * manual quietly lying about the game.
 */
import {
  DEF, HIVE_COOLDOWN, HIVE_GROW_EVERY, KEEP_NORMAL, KEEP_TUNNEL, MAPS, PROD, SPECIES,
  TRAVEL_RANGE, clearBoard, createGame, hiveTick, recomputeConnectivity, tile,
} from "../engine";
import type { GameState, Player, Structure, Terrain } from "../engine";
import { drawSnapshot } from "../render";
import { el, screenEl, screenHeader } from "./chrome";

export function buildRules(): HTMLElement {
  const root = screenEl("rules");
  // No back arrow: like the legacy build, this is a bottom-nav screen.
  screenHeader(root, { title: "How to play", sub: "The rules, in order" });

  const body = el("div", "screenbody");
  const card = el("div", "card");
  const page = el("div", "rules");
  page.style.marginTop = "0";

  SECTIONS.forEach((section, i) => {
    // A numbered rule before each heading. Eleven sections down one scroll need a mark
    // that says "a new one starts here" without a box round every one of them.
    const sep = el("div", "ru-sep");
    sep.append(el("span", "ru-no", String(i + 1).padStart(2, "0")), el("i"));
    page.append(sep, el("h3", "ru-h", section.title));
    for (const block of section.blocks) page.appendChild(render(block));
  });

  card.appendChild(page);
  body.appendChild(card);
  root.appendChild(body);
  return root;
}

/* ------------------------------------------------------------------- CONTENT */

/** A run of copy. `b` is emphasis, `you`/`ai`/`hv` colour a word its own side's colour. */
type Span = string | { b: string } | { you: string } | { ai: string } | { hv: string };

interface Figure {
  /** The position, built on a throwaway board this screen owns. */
  build: (s: GameState) => void;
  /** Keep the map's hive tiles. Only the figure that is about them wants them. */
  hive?: boolean;
  /** The window onto it, in tiles. */
  view: { c: number; r: number; cols: number; rows: number };
  caption: string;
  selection?: { c: number; r: number };
  valid?: { c: number; r: number }[];
}

type Block =
  | { p: Span[] }
  | { list: Span[][] }
  | { figure: Figure };

interface Section { title: string; blocks: Block[] }

/*
 * A throwaway board to arrange a position on. `createGame` builds a real one and this
 * empties it, exactly the way the engine's own tests do — the figures are positions the
 * game can actually produce, not drawings of them.
 *
 * The hive goes with everything else unless the figure asks for it. It sits in the middle
 * of every map, which is inside most of these windows, and five purple tiles in the corner
 * of a picture about supply lines are five things to wonder about.
 */
function blank(keepHive = false): GameState {
  return clearBoard(
    createGame({ map: "tiny", species: { you: "leafcutter", ai: "fire" }, seed: 7 }),
    keepHive,
  );
}

interface Put {
  owner?: Player | null;
  struct?: Structure;
  soldiers?: number;
  terrain?: Terrain;
  guard?: number;
}

const put = (s: GameState, c: number, r: number, o: Put): void => {
  const t = tile(s, c, r);
  if (o.terrain !== undefined) t.terrain = o.terrain;
  if (o.owner !== undefined) t.owner = o.owner;
  if (o.struct !== undefined) t.struct = o.struct;
  if (o.soldiers !== undefined) t.soldiers = o.soldiers;
  if (o.guard !== undefined) t.guard = o.guard;
};

const TINY = MAPS.tiny;

const SECTIONS: Section[] = [
  {
    title: "How a match is won",
    blocks: [
      { p: [
        "Two colonies share one square field. You win by taking the enemy ",
        { b: "nest" }, " — the tile their queen sits on. Lose your own and the match ends ",
        "there and then, however much ground you hold.",
      ] },
      { p: [
        { b: "There is no turn limit." }, " A match runs until a nest falls or somebody ",
        "surrenders. Nothing is decided on points, so being behind is never being out.",
      ] },
      { figure: {
        build: (s) => {
          put(s, 0, 3, { owner: "you", struct: "nest", soldiers: 10 });
          put(s, 1, 3, { owner: "you", struct: "stable", soldiers: 3 });
          put(s, 0, 2, { owner: "you", struct: "stable", soldiers: 3 });
          put(s, 4, 1, { owner: "ai", struct: "nest", soldiers: 10 });
          put(s, 3, 1, { owner: "ai", struct: "stable", soldiers: 3 });
          put(s, 4, 2, { owner: "ai", struct: "stable", soldiers: 3 });
          recomputeConnectivity(s);
        },
        view: { c: 0, r: 1, cols: 5, rows: 3 },
        caption: "Your nest and theirs. Take theirs, or lose yours.",
      } },
    ],
  },
  {
    title: "A turn",
    blocks: [
      { p: [
        "One action per turn, and ", { b: "15 seconds" }, " to make it. Tap a tile you own ",
        "to pick it up, then tap where it should act — the squares you can reach light up.",
      ] },
      { p: [
        "An ", { b: "ability" }, " is a free extra action on top of that: cast it and you ",
        "still get your move. The one exception is tunnelling, which lands five workers ",
        "anywhere on the board and spends the turn doing it.",
      ] },
      { figure: {
        build: (s) => {
          put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 12 });
          put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 9 });
          put(s, 3, 1, { owner: "ai", struct: "stable", soldiers: 4 });
          recomputeConnectivity(s);
        },
        view: { c: 0, r: 0, cols: 5, rows: 3 },
        selection: { c: 2, r: 1 },
        valid: [{ c: 2, r: 0 }, { c: 2, r: 2 }, { c: 3, r: 1 }],
        caption: "A tile picked up, and everywhere it may go.",
      } },
    ],
  },
  {
    title: "Moving and attacking",
    blocks: [
      { p: [
        "Moving onto empty ground claims it. Moving onto an occupied tile is an attack. ",
        "Either way a tile always leaves ", { b: `${KEEP_NORMAL} soldier` }, " behind — you ",
        "can never empty one (a tunnel mouth must keep ", { b: String(KEEP_TUNNEL) }, ").",
      ] },
      { p: [
        { b: "Combat is completely deterministic." }, " The same attack against the same ",
        "defence always gives the same result, every time. There is no luck in a fight — ",
        "you can count it out before you commit.",
      ] },
      { list: [
        ["Attack power is your troops × your colony's attack rating."],
        ["Defence is their troops × their defence rating, plus the tile's flat bonus."],
        ["Win big and most of your force survives; win narrowly and you arrive almost spent."],
      ] },
      { p: [
        "Grey ", { b: "wild colonies" }, " sit on the field from the start. They never move, ",
        "but they defend, and they have to be beaten to pass.",
      ] },
      { figure: {
        build: (s) => {
          put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 14 });
          put(s, 0, 1, { owner: "you", struct: "nest", soldiers: 10 });
          put(s, 2, 1, { guard: 6 });
          put(s, 3, 1, { terrain: "resource", guard: 6 });
          recomputeConnectivity(s);
        },
        view: { c: 0, r: 0, cols: 5, rows: 3 },
        caption: "Wild guards. The one on the gem defends hardest.",
      } },
    ],
  },
  {
    title: "What the tiles are worth",
    blocks: [
      { p: [
        "Every tile you hold and can reach produces troops at the end of your turn, and ",
        "adds a flat bonus when it is attacked.",
      ] },
      { list: [
        [{ b: "Nest" }, ` — ${PROD.nest} troops a turn, +${DEF.nest} defence. Your queen. Losing it loses the match.`],
        [{ b: "Stable" }, ` — ${PROD.stable} a turn, +${DEF.stable} defence. Ordinary captured ground.`],
        [{ b: "Resource stable" }, ` — ${PROD.resourceStable} a turn, +${DEF.resourceOwned} defence. A gem tile you have taken.`],
        [{ b: "Vein" }, " — produces nothing and defends at nothing. It is a road, not a tile."],
      ] },
      { figure: {
        build: (s) => {
          put(s, 0, 1, { owner: "you", struct: "nest", soldiers: 10 });
          put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 4 });
          put(s, 2, 1, { owner: "you", struct: "vein" });
          put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 5, terrain: "resource" });
          recomputeConnectivity(s);
        },
        view: { c: 0, r: 0, cols: 5, rows: 3 },
        caption: "Nest, stable, vein, and a captured gem.",
      } },
    ],
  },
  {
    title: "Travel and veins",
    blocks: [
      { p: [
        "A tile can send troops up to ", { b: `${TRAVEL_RANGE} tiles` }, " across open ",
        "ground in one action. The column lays a ", { b: "vein" }, " behind it — a trail of ",
        "road linking the far end back to your colony.",
      ] },
      { p: [
        "A vein carries no garrison, so attacking one takes it instantly with no fight and ",
        "no losses. Move troops onto your own vein and it becomes a proper stable.",
      ] },
      { p: [
        { b: "A vein needs two anchors." }, " Lose one end of a trail and the whole trail is ",
        "destroyed back to the nearest real tile. Long thin roads are cheap and fragile.",
      ] },
      { figure: {
        build: (s) => {
          put(s, 0, 1, { owner: "you", struct: "nest", soldiers: 10 });
          put(s, 1, 1, { owner: "you", struct: "vein" });
          put(s, 2, 1, { owner: "you", struct: "vein" });
          put(s, 3, 1, { owner: "you", struct: "vein" });
          put(s, 4, 1, { owner: "you", struct: "stable", soldiers: 6 });
          recomputeConnectivity(s);
        },
        view: { c: 0, r: 0, cols: 5, rows: 3 },
        caption: "A long send, and the trail it left behind.",
      } },
    ],
  },
  {
    title: "Supply lines",
    blocks: [
      { p: [
        "A tile only counts while a chain of your own tiles or veins links it back to your ",
        "nest. ", { b: "Cut off, it freezes" }, " — it produces nothing and earns nothing ",
        "until you reconnect it. It goes grey on the board so you can see it happen.",
      ] },
      { p: [
        "This is what makes cutting a trail worth more than the one tile you took. Tunnel ",
        "galleries are the exception: they are their own root and can never be cut off.",
      ] },
      { figure: {
        build: (s) => {
          put(s, 0, 1, { owner: "you", struct: "nest", soldiers: 10 });
          put(s, 1, 1, { owner: "ai", struct: "stable", soldiers: 5 });
          put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 4 });
          put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 4 });
          recomputeConnectivity(s);
        },
        view: { c: 0, r: 0, cols: 5, rows: 3 },
        caption: "The two on the right are cut off, and frozen.",
      } },
    ],
  },
  {
    title: "Rally and Advance",
    blocks: [
      { p: [
        { b: "Rally" }, " pulls every spare soldier in your colony onto one tile, leaving ",
        "the one-soldier floor everywhere else. ", { b: "Advance" }, " does the same onto ",
        "your front line.",
      ] },
      { p: [
        "It is the biggest fist in the game and it is also the biggest risk: the rest of ",
        "your colony is standing at one soldier a tile until you rebuild. Save it for the ",
        "blow that decides something.",
      ] },
    ],
  },
  {
    title: "The Hive",
    blocks: [
      { p: [
        "In the middle sleeps a wild queen infected with ", { hv: "Ophiocordyceps" },
        " — the real fungus that hollows out an ant and drives the husk. She wakes on turn ",
        { b: String(TINY.awakenTurn) }, " on the small board, and her garrison hardens every ",
        { b: `${HIVE_GROW_EVERY} turns` }, " after that. Leave her too long and she is a wall.",
      ] },
      { p: [
        "Four guards surround her. Taking a guard just takes a tile — ", { b: "only the queen" },
        " pays out. Capture her and all five tiles become yours along with a ",
        { hv: "growth surge" }, " across your whole colony.",
      ] },
      { p: [
        "When the surge lapses her tiles go back to bare ground and she is gone for ",
        { b: `${HIVE_COOLDOWN} turns` }, ", then grows back one level stronger. Anything ",
        "standing on her ground when she returns is eaten and joins her garrison.",
      ] },
      { figure: {
        hive: true,
        build: (s) => {
          // Awake, on the turn she wakes: the engine sets her garrison, not this screen.
          s.turn = TINY.awakenTurn;
          hiveTick(s, "you");
          recomputeConnectivity(s);
        },
        view: { c: 1, r: 2, cols: 5, rows: 3 },
        caption: "The queen and her four guards, freshly woken.",
      } },
    ],
  },
  {
    title: "Nine colonies",
    blocks: [
      { p: [
        "Each species is a real ant, and its ability is something that ant really does. The ",
        "attack, defence and production ratings span a deliberately narrow band: a colony ",
        "changes ", { b: "how" }, " you win, not whether you can.",
      ] },
      { list: Object.values(SPECIES).map((sp) => [{ b: sp.name }, ` — ${sp.blurb}`]) },
      { p: [
        "An ability comes off cooldown on its own clock and costs nothing to cast. What each ",
        "colony's ability actually does is on its page in the ", { b: "Antarium" }, ", beside ",
        "the research that shortens its cooldown — so it is written once, where you pick.",
      ] },
    ],
  },
  {
    title: "What you play for",
    blocks: [
      { p: [
        "A win grows your ", { b: "colony" }, " by a share of the troops you already have; a ",
        "defeat costs a smaller share. The bigger the colony, the more a win is worth in ",
        "troops — and the smaller the share, so the climb keeps its shape all the way up.",
      ] },
      { p: [
        "Matches also pay mycelium for the nest chambers, and pheromone for research. The ",
        "enemy AI gets neither: it plays every match on the plain rules.",
      ] },
    ],
  },
];

/* ------------------------------------------------------------------ RENDERING */

function render(block: Block): HTMLElement {
  if ("p" in block) return spans(el("p", "ru-p"), block.p);
  if ("list" in block) {
    const ul = el("ul", "ru-l");
    for (const item of block.list) ul.appendChild(spans(el("li", undefined), item));
    return ul;
  }
  return figure(block.figure);
}

function spans(into: HTMLElement, parts: Span[]): HTMLElement {
  for (const part of parts) {
    if (typeof part === "string") into.append(document.createTextNode(part));
    else if ("b" in part) into.append(el("b", undefined, part.b));
    else if ("you" in part) into.append(el("span", "you", part.you));
    else if ("ai" in part) into.append(el("span", "ai", part.ai));
    else into.append(el("span", "hv", part.hv));
  }
  return into;
}

/**
 * One picture, drawn by the board's own code from a real position.
 *
 * jsdom has no 2D context, so `drawSnapshot` returns false and the figure keeps only its
 * caption — the screen has to survive a canvas it cannot draw into (CLAUDE.md §6).
 */
function figure(f: Figure): HTMLElement {
  const box = el("figure", "ru-fig");
  const canvas = document.createElement("canvas");
  canvas.className = "ru-shot";
  const state = blank(f.hive);
  f.build(state);
  drawSnapshot(canvas, state, {
    tile: 38, view: f.view, selection: f.selection ?? null, valid: f.valid ?? [],
  });
  box.append(canvas, el("figcaption", "ru-cap", f.caption));
  return box;
}
