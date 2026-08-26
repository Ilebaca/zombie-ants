/**
 * The board painter.
 *
 * Reads GameState and never writes to it. Everything time-varying (reveal progress,
 * pulses, drifting motes) either lives in the renderer's own state or is derived from
 * the clock, so drawing a frame can never change the game.
 */
import { allTiles, hiveCells, isConnected, tile } from "../engine";
import type { Coord, GameState, Player, Tile } from "../engine";
import type { Layout } from "./layout";
import type { RevealTracker, RevealEdge } from "./reveal";
import type { Look } from "./art";
import { nestArt } from "./art";
import { COL, MAP, hexA, ownerCol } from "./palette";
import { capturedCorners, filletPath, rrect, rrectC } from "./shapes";
import { drawTerrain } from "./terrain";
import { floodAt, type Flood } from "./flood";
import { colonyTrails, drawTrail, drawVeinTrail } from "./trails";

const TAU = 6.283;

/** The colour a worked seam flashes, and how often. Blue: no species wears it. */
const SEAM_BLUE = "#59c8ff";
const SEAM_MS = 3200;
/** The share of that period the bloom is actually visible for. */
const SEAM_BLOOM = 0.3;

/** 0 for most of the period, then one smooth swell. `offset` staggers tiles a little. */
function gemBloom(offset: number): number {
  const p = ((performance.now() / SEAM_MS) + offset * 0.11) % 1;
  if (p > SEAM_BLOOM) return 0;
  return Math.sin((p / SEAM_BLOOM) * Math.PI);
}

export interface Scene {
  ctx: CanvasRenderingContext2D;
  layout: Layout;
  state: GameState;
  reveal: RevealTracker;
  /** Which skin each side is wearing. */
  looks: Record<Player, Look>;
  /** The win-flood finale hides every soldier count. */
  hideCounts: boolean;
  /** The winner's wash over the whole board, once the match is decided. */
  flood: Flood | null;
  /** Currently selected source tile, if any. */
  selection: Coord | null;
  /** Legal targets for the current selection/mode. */
  valid: readonly Coord[];
  /** Whose turn it is — drives the target highlight colour. */
  current: Player;
}

export interface Mote { x: number; y: number; s: number; sp: number; ph: number }

export function seedMotes(reduced: boolean): Mote[] {
  const n = reduced ? 0 : 34;
  const out: Mote[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random(), y: Math.random(),
      s: 0.4 + Math.random() * 1.4,
      sp: 0.02 + Math.random() * 0.05,
      ph: Math.random() * TAU,
    });
  }
  return out;
}

/**
 * The board's ground, edge to edge.
 *
 * There was a rounded tray with a pale rim here — a board game on a table. The playfield
 * is a cleared patch of forest floor now: the same soil runs to every edge of the screen,
 * the chequer fades out at the grid's border instead of being framed by one, and the
 * margin is undergrowth. See terrain.ts, which bakes all of that once.
 *
 * There is still not a single drawn grid line — the two ground shades do that job.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D, layout: Layout, motes: Mote[], startedAt: number,
): void {
  // The ground and everything growing on it, baked once and blitted (terrain.ts).
  drawTerrain(ctx, layout);

  const w = layout.width, h = layout.height;
  const t = (performance.now() - startedAt) / 1000;
  for (const p of motes) {
    p.y -= p.sp * 0.012;
    if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
    const x = (p.x + Math.sin(t * 0.6 + p.ph) * 0.01) * w, y = p.y * h;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = MAP.motes;
    ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * The marching ants: a dashed line travelling round the outside of each colony.
 *
 * Drawn after every tile face so it sits on top of the territory it encloses, and before
 * the selection, which has to stay the loudest thing on the board.
 */
export function drawTrails(scene: Scene): void {
  const { ctx, layout, state } = scene;
  const now = performance.now();
  const width = Math.max(1.6, layout.ts * 0.055);
  for (const p of ["you", "ai"] as const) {
    const style = {
      colour: hexA(ownerCol(p, "glow"), 0.85),
      width,
      // Half a phase apart, so the two colonies' ants are never in lockstep.
      phase: p === "ai" ? 0.5 : 0,
    };
    const traced = colonyTrails(state, settledOf(scene))[p];
    drawTrail(ctx, layout, traced.loops, style, now);
    drawVeinTrail(ctx, layout, traced.veins, style, now);
  }
}

/**
 * Round the colony's INNER corners.
 *
 * A cell suppresses a corner radius wherever a same-owner neighbour touches it, which is
 * what fuses the cells into one slab — but it leaves a sharp reflex vertex wherever three
 * cells wrap an empty one. That is not a per-cell radius, it is a fillet dropped into the
 * notch afterwards, so it gets its own pass.
 *
 * `raise` lifts the fillet onto the under-band, so the shadow keeps the same silhouette as
 * the face above it.
 */
export function drawFillets(scene: Scene, raise = 0, tint?: (c: string) => string): void {
  const { ctx, layout, state } = scene;
  const radius = Math.max(3, layout.ts * 0.20);

  for (const p of ["you", "ai"] as const) {
    for (const k of colonyTrails(state, settledOf(scene))[p].notches) {
      // Only once the three cells around it have finished filling in — a fillet across a
      // half-revealed corner draws colour where the reveal has not reached yet.
      if (!settled(scene, k.c - 1, k.r - 1) || !settled(scene, k.c, k.r - 1)
        || !settled(scene, k.c - 1, k.r) || !settled(scene, k.c, k.r)) continue;
      // Take the colour from the cell diagonally OPPOSITE the notch: it is owned by
      // definition, and shares the notch's connectivity, so a cut-off arm greys out whole.
      const owned = tile(state, k.sx > 0 ? k.c - 1 : k.c, k.sy > 0 ? k.r - 1 : k.r);
      const face = isConnected(state, owned) ? ownerCol(p) : "rgb(56,68,88)";
      ctx.fillStyle = tint ? tint(face) : face;
      filletPath(ctx, layout.ox + k.c * layout.ts, layout.oy + k.r * layout.ts + raise,
        k.sx, k.sy, radius);
      ctx.fill();
    }
  }
}

/**
 * A tile joins the outline only once it has finished filling in, so the ants extend one tile
 * at a time along a send instead of snapping out to its far end on the first frame.
 */
const settledOf = (scene: Scene) => (c: number, r: number): boolean =>
  scene.reveal.progress(c, r) >= 1;

/** A cell that is either not the colony's or has finished revealing. */
function settled(scene: Scene, c: number, r: number): boolean {
  const t = scene.state.grid[r]?.[c];
  if (!t || !t.owner) return true;
  return scene.reveal.progress(c, r) >= 1;
}

/**
 * Pass one of two: the solid band under every owned tile.
 *
 * Drawn for the whole board before any tile face, so a colony reads as one thick slab —
 * the band only shows along its bottom edge, where no tile of the same colour covers it.
 */
export function drawTileBevels(scene: Scene): void {
  const { ctx, layout, state, reveal } = scene;
  const ts = layout.ts;
  const drop = Math.max(3, ts * 0.13);

  for (const row of state.grid) {
    for (const t of row) {
      if (!t.owner || t.struct === "vein") continue;
      if (reveal.progress(t.c, t.r) < 1) continue;        // still filling: no edge yet
      const [tl, tr, br, bl] = capturedCorners(state, t, Math.max(3, ts * 0.20));
      rrectC(ctx, layout.x0(t.c), layout.y0(t.r) + drop, ts, ts, tl, tr, br, bl);
      ctx.fillStyle = shade(ownerCol(t.owner), 0.42);
      ctx.fill();
    }
  }
  drawFillets(scene, drop, (c) => shade(c, 0.42));
}

/** Mix a colour toward black — the one way this renderer makes a darker face. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1] as string, 16);
  const r = Math.round(((v >> 16) & 255) * (1 - amount));
  const g = Math.round(((v >> 8) & 255) * (1 - amount));
  const b = Math.round((v & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

/** Clip to the revealed portion of a cell — a directional "progress bar" wipe. */
interface BadgeOptions {
  text: string;
  /** Centre of the badge. */
  cx: number;
  cy: number;
  stroke: string;
  ink: string;
  /** Shrinks the whole badge; the wild-garrison one sits slightly smaller. */
  scale?: number;
}

/**
 * The troop count.
 *
 * A single digit draws as a CIRCLE, and the badge only grows sideways once the number needs
 * the room — the corner radius stays at half the height, so 7, 42 and 128 read as the same
 * shape stretched, not as three different badges. Sizes are in tile units so it holds up on
 * a 7×7 board and a 13×13 one alike.
 */
function countBadge(scene: Scene, o: BadgeOptions): void {
  const { ctx, layout } = scene;
  const ts = layout.ts;
  const scale = o.scale ?? 1;
  const ph = ts * 0.42 * scale;

  ctx.font = `900 ${Math.max(13, ts * 0.34 * scale)}px var(--font),sans-serif`;
  const pw = Math.max(ph, ctx.measureText(o.text).width + ts * 0.24 * scale);
  const px = o.cx - pw / 2;
  const py = o.cy - ph / 2;

  ctx.fillStyle = "rgba(18,26,16,0.86)";      // deep forest, so it belongs on this ground
  rrect(ctx, px, py, pw, ph, ph / 2); ctx.fill();
  ctx.lineWidth = Math.max(1.2, ts * 0.022);
  ctx.strokeStyle = o.stroke;
  rrect(ctx, px, py, pw, ph, ph / 2); ctx.stroke();

  ctx.fillStyle = o.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(o.text, o.cx, o.cy + 1);
}

function clipReveal(ctx: CanvasRenderingContext2D, layout: Layout, t: Tile, rv: number, edge: RevealEdge): void {
  const x = layout.x0(t.c), y = layout.y0(t.r), s = layout.ts;
  let cx0 = x, cy0 = y, cw = s, ch = s;
  if (edge === "L") { cw = s * rv; }
  else if (edge === "R") { cx0 = x + s * (1 - rv); cw = s * rv; }
  else if (edge === "U") { ch = s * rv; }
  else { cy0 = y + s * (1 - rv); ch = s * rv; }
  ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.clip();
}

export function drawTile(scene: Scene, t: Tile): void {
  const { ctx, layout, state, reveal } = scene;
  const ts = layout.ts;
  const pad = Math.max(1, ts * 0.05);              // gap scales with tile size
  const x = layout.x0(t.c) + pad, y = layout.y0(t.r) + pad;
  const w = ts - pad * 2, h = ts - pad * 2;
  const r = Math.max(3, ts * 0.18);

  if (t.terrain === "blocked") {
    // A rock is a block, not a blob: ground shade, solid side, lit top — the same three
    // layers every raised object on this board is built from.
    const bx = x + w * 0.11, by = y + h * 0.10, bw = w * 0.78, bh = h * 0.74;
    const drop = Math.max(3, ts * 0.12);
    ctx.fillStyle = MAP.groundShade;
    rrect(ctx, bx + drop * 0.5, by + drop * 1.2, bw, bh, r * 0.75); ctx.fill();
    ctx.fillStyle = MAP.rockEdge;
    rrect(ctx, bx, by + drop, bw, bh, r * 0.75); ctx.fill();
    ctx.fillStyle = MAP.rock;
    rrect(ctx, bx, by, bw, bh, r * 0.75); ctx.fill();
    ctx.fillStyle = MAP.rockTop;
    rrect(ctx, bx + bw * 0.16, by + bh * 0.13, bw * 0.5, bh * 0.34, r * 0.5); ctx.fill();
    return;
  }

  const hive = t.terrain === "hiveQ" || t.terrain === "hiveG";
  const isVein = t.struct === "vein";
  const detached = !!t.owner && !isConnected(state, t);        // cut off from the nest
  const rvState = t.owner ? reveal.get(t.c, t.r) : undefined;
  const rev = rvState ? rvState.rv : 1;

  if (t.owner) {
    // backdrop while filling: the previous holder fades out under the incoming colour
    if (rvState && rev < 1 && rvState.prev) {
      ctx.fillStyle = hexA(ownerCol(rvState.prev), 0.12);
      rrect(ctx, x, y, w, h, r); ctx.fill();
    }
    ctx.save();
    if (rvState && rev < 1) clipReveal(ctx, layout, t, rev, rvState.edge);

    const X0 = layout.x0(t.c), Y0 = layout.y0(t.r);            // full cell — edge to edge, no gap
    ctx.fillStyle = detached
      ? (isVein ? "rgba(150,165,190,0.75)" : "rgb(56,68,88)")
      : ownerCol(t.owner);

    if (isVein) {
      // A trail, not territory: a half-bar toward each linked neighbour, so it renders as a
      // straight line, an L-corner, a T-branch or a cross depending on what it connects.
      const owner = t.owner;
      const thick = ts * 0.20, half = thick / 2;
      const px = layout.cx(t.c), py = layout.cy(t.r);
      const linked = (c: number, rr: number): boolean => {
        const nb = state.grid[rr]?.[c];
        return !!(nb && nb.owner === owner && (nb.struct === "vein" || nb.struct === "stable" || nb.struct === "nest"));
      };
      const L = linked(t.c - 1, t.r), R = linked(t.c + 1, t.r);
      const U = linked(t.c, t.r - 1), D = linked(t.c, t.r + 1);

      ctx.fillRect(px - half, py - half, thick, thick);        // hub, so arms join with sharp corners
      if (L) ctx.fillRect(X0, py - half, px - X0, thick);
      if (R) ctx.fillRect(px, py - half, X0 + ts - px, thick);
      if (U) ctx.fillRect(px - half, Y0, thick, py - Y0);
      if (D) ctx.fillRect(px - half, py, thick, Y0 + ts - py);
      if (!L && !R && !U && !D) {                              // lone vein mid-animation
        const edge = rvState?.edge;
        const horiz = edge === "L" || edge === "R" || !edge;
        if (horiz) ctx.fillRect(X0, py - half, ts, thick);
        else ctx.fillRect(px - half, Y0, thick, ts);
      }
    } else {
      // Captured territory fills the whole cell; only OUTER corners round, so neighbours fuse.
      const r0 = Math.max(3, ts * 0.20);
      const [tl, tr, br, bl] = capturedCorners(state, t, r0);
      rrectC(ctx, X0, Y0, ts, ts, tl, tr, br, bl); ctx.fill();
    }
    ctx.restore();

  } else if (t.terrain === "resource") {
    // a warm patch under the gem, rounded like everything else on this board
    ctx.fillStyle = MAP.resCell;
    rrect(ctx, layout.x0(t.c) + ts * 0.06, layout.y0(t.r) + ts * 0.06, ts * 0.88, ts * 0.88, r * 0.8);
    ctx.fill();
  }

  if (t.terrain === "resource") {
    // A cut gem: a shaded base, the stone, and one lit facet across the top-left. The glow
    // is the only blur on the board, and it earns it — this is the thing worth fighting for.
    const gx = layout.cx(t.c), gy = layout.cy(t.r) - (t.owner ? h * 0.16 : 0);
    /*
     * A WORKED SEAM CATCHES THE LIGHT.
     *
     * A held resource pays three a turn where a plain stable pays one, and nothing on the
     * board said so — it looked like any other captured cell with a gem on it. Under a
     * colony a cold blue bloom runs over the stone every few seconds and then it is still
     * again; unowned it never does, because an idle seam is not producing anything.
     *
     * A short bump in a long period rather than a constant throb: the eye catches the one
     * thing that just changed, and a board of gems all breathing at once is noise.
     */
    const beat = t.owner ? gemBloom(t.c + t.r) : 0;
    const s = w * 0.19 * (1 + 0.07 * beat), drop = Math.max(2, ts * 0.07);
    const diamond = (cx: number, cy: number, rad: number): void => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - rad); ctx.lineTo(cx + rad, cy);
      ctx.lineTo(cx, cy + rad); ctx.lineTo(cx - rad, cy);
      ctx.closePath();
    };
    ctx.fillStyle = MAP.groundShade; diamond(gx, gy + drop * 1.6, s); ctx.fill();
    ctx.fillStyle = MAP.gemEdge; diamond(gx, gy + drop, s); ctx.fill();
    ctx.save();
    ctx.shadowColor = beat > 0.02 ? SEAM_BLUE : MAP.gemTop;
    ctx.shadowBlur = ts * (0.26 + 0.5 * beat);
    ctx.fillStyle = MAP.gem; diamond(gx, gy, s); ctx.fill();
    if (beat > 0.02) {                       // the bloom itself, over the cut stone
      ctx.fillStyle = hexA(SEAM_BLUE, 0.55 * beat);
      diamond(gx, gy, s * 1.35); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = MAP.gemTop;
    ctx.beginPath();
    ctx.moveTo(gx, gy - s * 0.86); ctx.lineTo(gx + s * 0.42, gy - s * 0.12);
    ctx.lineTo(gx - s * 0.42, gy - s * 0.12);
    ctx.closePath(); ctx.fill();
  }

  if (hive) drawHiveTile(scene, t);

  // wild neutral garrison — a defended tile you must fight through
  if (!t.owner && t.guard > 0 && !scene.hideCounts) {
    countBadge(scene, {
      text: "🛡" + t.guard,
      cx: layout.cx(t.c),
      cy: layout.cy(t.r),
      stroke: "rgba(190,205,225,0.7)",
      ink: "#eef3fb",
      scale: 0.9,
    });
  }

  if (t.owner && (t.struct === "stable" || t.struct === "nest")) {
    ctx.save();
    ctx.globalAlpha = rev;
    if (t.tunnel) {                                            // gallery mouth: dark shaft, lit rim
      const gx = layout.cx(t.c), gy = layout.cy(t.r) - h * 0.30, gr = w * 0.15;
      ctx.fillStyle = "rgba(4,8,14,0.92)";
      ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * 0.74, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = ownerCol(t.owner, "glow"); ctx.lineWidth = Math.max(1.5, w * 0.035);
      ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * 0.74, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = hexA(ownerCol(t.owner, "glow"), 0.55);
      ctx.beginPath(); ctx.ellipse(gx, gy + gr * 0.30, gr * 0.46, gr * 0.26, 0, 0, TAU); ctx.fill();
    }
    if (t.struct === "nest") {                                 // only the base carries an illustration
      const look = scene.looks[t.owner];
      nestArt(
        ctx, layout.cx(t.c), layout.cy(t.r) - h * 0.14, w * 0.44,
        look.hill, detached ? "rgba(150,165,190,0.7)" : ownerCol(t.owner, "glow"),
      );
    }
    ctx.restore();
  }

  // Detachment needs no badge — the grey fill and muted count already read as "cut off".

  drawTileEffects(scene, t);

  if (t.owner && t.soldiers > 0 && !scene.hideCounts) {
    ctx.save();
    ctx.globalAlpha = rev;
    countBadge(scene, {
      text: String(t.soldiers),
      cx: layout.cx(t.c),
      cy: t.struct === "nest" ? layout.cy(t.r) + h * 0.14 + ts * 0.21 : layout.cy(t.r),
      stroke: detached ? "rgba(150,165,190,0.7)" : ownerCol(t.owner, "glow"),
      ink: detached ? "#c7d0de" : "#fff",
    });
    ctx.restore();
  }

  // Ghost cloak: YOUR hidden tiles render at ~50%. The enemy sees nothing — the AI skips them.
  if (t.hidden && t.owner === "you") {
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = MAP.groundA;
    rrect(ctx, x, y, w, h, r); ctx.fill();
    ctx.globalAlpha = 0.35 + 0.12 * Math.sin(performance.now() / 300 + t.c + t.r);
    ctx.strokeStyle = "#cfe0ff"; ctx.lineWidth = Math.max(1, ts * 0.04);
    ctx.setLineDash([ts * 0.14, ts * 0.10]);
    rrect(ctx, x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88, r); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export function drawTileEffects(scene: Scene, t: Tile): void {
  const { ctx, layout, state } = scene;
  const ts = layout.ts;
  const x = layout.x0(t.c), y = layout.y0(t.r), s = ts, now = performance.now();

  for (const e of state.effects) {
    if (e.c !== t.c || e.r !== t.r) continue;

    if (e.kind === "armor") {
      /*
       * PLATING, NOT A DASHED RING.
       *
       * Leaf armour used to be a dashed rounded rect in the owner's colour — which is now
       * exactly what the marching ants are (render/trails.ts). Casting Fungal Growth
       * armours every frontline tile at once, so the board filled up with dashed rings
       * that read as broken colony outlines rather than as a defence bonus. It draws as
       * two overlapping plates in the corner instead: a badge, with no continuous edge for
       * the eye to mistake for the trail.
       */
      const px = x + s * 0.80, py = y + s * 0.80, pr = s * 0.13;
      ctx.save();
      ctx.fillStyle = hexA(ownerCol(e.owner, "glow"), 0.22);
      rrect(ctx, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.18); ctx.fill();
      ctx.fillStyle = hexA(ownerCol(e.owner, "glow"), 0.9);
      ctx.beginPath();                                   // a shield: flat top, pointed base
      ctx.moveTo(px - pr, py - pr);
      ctx.lineTo(px + pr, py - pr);
      ctx.lineTo(px + pr, py + pr * 0.2);
      ctx.quadraticCurveTo(px + pr, py + pr, px, py + pr);
      ctx.quadraticCurveTo(px - pr, py + pr, px - pr, py + pr * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      continue;
    }

    let rgb: string, alpha: number;
    if (e.kind === "fire") { rgb = "200,60,20"; alpha = 0.55; }
    else if (e.kind === "venom") { rgb = "120,40,190"; alpha = 0.50; }
    else if (e.kind === "leaf") { rgb = "70,150,55"; alpha = 0.62; }
    else continue;

    ctx.save();
    ctx.fillStyle = `rgba(${rgb},${alpha})`;
    rrect(ctx, x + 1, y + 1, s - 2, s - 2, 8); ctx.fill();

    if (e.kind === "fire") {
      for (let i = 0; i < 4; i++) {
        const ph = (now / 300 + i * 0.27) % 1;
        const fx = x + s * (0.22 + 0.18 * i), fy = y + s * 0.82 - ph * s * 0.62;
        const fr = s * 0.13 * (1 - ph * 0.5);
        ctx.fillStyle = `rgba(255,${Math.round(150 + 90 * (1 - ph))},40,${0.85 * (1 - ph)})`;
        ctx.beginPath();
        ctx.moveTo(fx, fy + fr);
        ctx.quadraticCurveTo(fx - fr, fy, fx, fy - fr * 1.6);
        ctx.quadraticCurveTo(fx + fr, fy, fx, fy + fr);
        ctx.fill();
      }
    }
    if (e.kind === "venom") {
      ctx.fillStyle = "rgba(190,120,255,0.9)";
      for (let i = 0; i < 3; i++) {
        const dy = (now / 260 + i * 0.4) % 1;
        ctx.beginPath();
        ctx.arc(x + s * (0.3 + 0.2 * i), y + s * 0.2 + dy * s * 0.6, s * 0.05, 0, TAU);
        ctx.fill();
      }
    }
    if (e.kind === "leaf") {
      ctx.strokeStyle = "rgba(30,80,25,0.8)"; ctx.lineWidth = Math.max(1, ts * 0.035);
      ctx.beginPath(); ctx.moveTo(x + s * 0.5, y + s * 0.22); ctx.lineTo(x + s * 0.5, y + s * 0.78); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, y + s * 0.4); ctx.lineTo(x + s * 0.3, y + s * 0.3);
      ctx.moveTo(x + s * 0.5, y + s * 0.4); ctx.lineTo(x + s * 0.7, y + s * 0.3);
      ctx.moveTo(x + s * 0.5, y + s * 0.6); ctx.lineTo(x + s * 0.32, y + s * 0.52);
      ctx.moveTo(x + s * 0.5, y + s * 0.6); ctx.lineTo(x + s * 0.68, y + s * 0.52);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawHiveTile(scene: Scene, t: Tile): void {
  const { ctx, layout, state } = scene;
  const ts = layout.ts;
  const x = layout.cx(t.c), y = layout.cy(t.r), R = ts * 0.30;

  /*
   * A CAPTURED HIVE TILE IS NOT VIOLET.
   *
   * Violet is the colour of the thing nobody owns — it is what makes the shared objective
   * read as neutral. Once a colony holds these five they are its tiles, drawn like the rest
   * of its territory, and keeping the slab on them said the opposite: the prize still looked
   * like it belonged to the board. All that is left is the fungus itself, in the holder's
   * own light, so the objective is still findable.
   */
  if (t.owner) {
    const light = ownerCol(t.owner, "glow");
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(1.2, ts * 0.035);
    ctx.lineCap = "round";
    if (t.terrain === "hiveQ") {
      for (let i = 0; i < 5; i++) {
        const a = -1.57 + (i - 2) * 0.5;
        const ex = x + Math.cos(a) * R * 1.5, ey = y + Math.sin(a) * R * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * R, y + Math.sin(a) * R - R * 0.6, ex, ey);
        ctx.stroke();
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.arc(ex, ey, ts * 0.04, 0, TAU); ctx.fill();
      }
    }
    ctx.fillStyle = hexA(light, 0.55);
    ctx.beginPath(); ctx.arc(x, y, R * (t.terrain === "hiveQ" ? 0.44 : 0.30), 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  // "cooling" is a grave, not a hive: the queen is dead and her tiles hold nothing. It gets
  // the dim look, or the board shows a glowing queen on ground with nothing to fight.
  const awake = state.hive.phase === "awake" || state.hive.phase === "buff";
  const col = awake ? (COL.hive ?? "#b14de0") : (COL["hive-dim"] ?? "#4b3a6e");
  const glow = awake ? (COL["hive-soft"] ?? "#d9c2ff") : "rgba(255,255,255,0.55)";
  const pulse = awake ? (0.6 + 0.4 * Math.sin(performance.now() / 300)) : 0.3;

  // The hive sits on its own violet slab, so the fungus reads against any ground colour
  // and the five tiles group into one object rather than five loose circles. Violet is the
  // one hue no species uses, which is what makes the shared objective read as neutral.
  const px = layout.x0(t.c), py = layout.y0(t.r);
  const drop = Math.max(3, ts * 0.11);
  ctx.fillStyle = MAP.groundShade;
  rrect(ctx, px + ts * 0.05, py + ts * 0.05 + drop, ts * 0.9, ts * 0.9, ts * 0.26); ctx.fill();
  ctx.fillStyle = awake ? "#7c4fd0" : "#a99ab8";
  rrect(ctx, px + ts * 0.05, py + ts * 0.05, ts * 0.9, ts * 0.9, ts * 0.26); ctx.fill();
  ctx.fillStyle = awake ? "#9166e0" : "#bbaec8";
  rrect(ctx, px + ts * 0.11, py + ts * 0.10, ts * 0.78, ts * 0.42, ts * 0.20); ctx.fill();

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = ts * (awake ? 0.6 : 0.25) * pulse;
  if (t.terrain === "hiveQ") {                       // spore stalks erupting from the queen
    ctx.strokeStyle = glow; ctx.lineWidth = Math.max(1.5, ts * 0.04); ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const a = -1.57 + (i - 2) * 0.5;
      const ex = x + Math.cos(a) * R * 1.7, ey = y + Math.sin(a) * R * 1.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * R, y + Math.sin(a) * R - R * 0.6, ex, ey);
      ctx.stroke();
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(ex, ey, ts * 0.05, 0, TAU); ctx.fill();
    }
  }
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, R * (t.terrain === "hiveQ" ? 1 : 0.78), 0, TAU); ctx.fill();
  ctx.restore();

  ctx.fillStyle = hexA(glow, awake ? 0.9 : 0.4);
  ctx.beginPath(); ctx.arc(x, y, R * 0.34, 0, TAU); ctx.fill();

  // The finale takes every number off the board at once, the Hive's garrison included.
  if (t.owner === null && !scene.hideCounts) {
    ctx.font = `900 ${Math.max(10, ts * 0.22)}px var(--font),sans-serif`;
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🛡" + t.soldiers, x, y + R * 1.25);
  }
}

/**
 * How the surge wave travels: tiles a second, how wide the bright front is, and how much
 * empty distance follows it before the next one leaves the queen.
 *
 * A constant SPEED rather than a fixed period, so the wave looks the same crossing a
 * four-tile colony and a forty-tile one — a fixed period would have it crawl early and
 * streak across the board late. The gap is in tiles for the same reason: the pause between
 * waves stays the same length whatever the colony is doing.
 */
const SURGE_TILES_PER_SEC = 9;
const SURGE_WIDTH = 1.1;
const SURGE_GAP = 13;

/**
 * The growth surge, made visible: a wave leaving the queen and washing out across
 * EVERYTHING the holder owns, for as long as the surge runs.
 *
 * The surge is a colony-wide effect — every tile is producing more — so it has to look like
 * one. Lighting only the five hive tiles said the opposite: that whatever was happening was
 * happening over there, on the ground the queen used to sit on.
 *
 * One pass over the board rather than per tile, because the whole point is that they move
 * TOGETHER: each tile lights as the front reaches its distance from the queen, so the
 * brightness sweeps outward instead of the colony blinking as a whole.
 */
export function drawSurge(scene: Scene): void {
  const { ctx, layout, state } = scene;
  const owner = state.hive.owner;
  if (state.hive.phase !== "buff" || !owner) return;
  const queen = hiveCells(state).find((t) => t.terrain === "hiveQ");
  if (!queen) return;

  const ts = layout.ts;
  const held = allTiles(state).filter((t) => t.owner === owner);
  if (!held.length) return;

  const ringOf = (t: Tile): number => Math.abs(t.c - queen.c) + Math.abs(t.r - queen.r);
  let furthest = 0;
  for (const t of held) furthest = Math.max(furthest, ringOf(t));

  // The front runs past the furthest tile before the cycle restarts, so the wave leaves the
  // colony rather than stopping dead on its edge.
  const cycle = furthest + SURGE_WIDTH + SURGE_GAP;
  const front = ((performance.now() / 1000) * SURGE_TILES_PER_SEC) % cycle;
  const light = ownerCol(owner, "glow");
  const radius = Math.max(3, ts * 0.20);

  ctx.save();
  for (const t of held) {
    const d = Math.abs(front - ringOf(t));
    if (d > SURGE_WIDTH) continue;
    const k = (1 - d / SURGE_WIDTH) ** 2;
    ctx.fillStyle = hexA(light, 0.40 * k);
    if (t.struct === "vein") {
      // A vein is a bar through the middle of its tile, not a filled cell. Washing the whole
      // cell would make the trail read as solid ground every time the wave passed.
      const half = ts * 0.17;
      rrect(ctx, layout.cx(t.c) - half, layout.cy(t.r) - half, half * 2, half * 2, ts * 0.08);
    } else {
      // The colony's own fused silhouette, so the wave washes over the shape that is there.
      const [tl, tr, br, bl] = capturedCorners(state, t, radius);
      rrectC(ctx, layout.x0(t.c), layout.y0(t.r), ts, ts, tl, tr, br, bl);
    }
    ctx.fill();
  }
  ctx.restore();
}

/**
 * THE FINALE: one colour eating the board (flood.ts).
 *
 * Drawn last and over everything, because "consumed" is exactly that — the veins, the
 * garrisons, the Hive and the gem seams all go under it. Doing it as a pass rather than by
 * lying to `drawTile` about who owns what is also what keeps it honest: the board beneath
 * is unchanged, so the result card still reports the position the match actually ended in.
 *
 * A cell blooms from its middle as the front reaches it and then settles edge to edge with
 * only its OUTER corners rounded — the same corner suppression every colony uses, so what
 * closes over the board reads as one slab rather than a grid of lozenges arriving.
 */
export function drawFlood(scene: Scene): void {
  const { ctx, layout, state, flood } = scene;
  if (!flood) return;

  const now = performance.now();
  const ts = layout.ts;
  const radius = Math.max(3, ts * 0.20);
  const drop = Math.max(3, ts * 0.13);
  const base = ownerCol(flood.owner);
  const light = ownerCol(flood.owner, "glow");
  const under = shade(base, 0.42);

  // A cell is "taken" only once it has finished, so the fused silhouette grows with the
  // front instead of the whole wave being drawn as one slab from the first frame.
  const taken = (c: number, r: number): boolean => floodAt(flood, c, r, now) >= 1;
  const corners = (t: Tile): [number, number, number, number] => [
    taken(t.c - 1, t.r) || taken(t.c, t.r - 1) ? 0 : radius,
    taken(t.c + 1, t.r) || taken(t.c, t.r - 1) ? 0 : radius,
    taken(t.c + 1, t.r) || taken(t.c, t.r + 1) ? 0 : radius,
    taken(t.c - 1, t.r) || taken(t.c, t.r + 1) ? 0 : radius,
  ];

  ctx.save();

  /*
   * The slab's own under-band, first and underneath, exactly as a colony gets one
   * (drawTileBevels). It is not only for depth: a colony's band hangs BELOW its cells, so
   * without one of its own the wash left a sliver of the loser's colour showing along the
   * bottom edge of the finished board.
   */
  ctx.fillStyle = under;
  for (const row of state.grid) {
    for (const t of row) {
      if (!taken(t.c, t.r)) continue;
      const [tl, tr, br, bl] = corners(t);
      rrectC(ctx, layout.x0(t.c), layout.y0(t.r) + drop, ts, ts, tl, tr, br, bl);
      ctx.fill();
    }
  }

  for (const row of state.grid) {
    for (const t of row) {
      const p = floodAt(flood, t.c, t.r, now);
      if (p <= 0) continue;
      const X = layout.x0(t.c), Y = layout.y0(t.r);

      if (p >= 1) {
        const [tl, tr, br, bl] = corners(t);
        ctx.fillStyle = base;
        rrectC(ctx, X, Y, ts, ts, tl, tr, br, bl);
        ctx.fill();
        continue;
      }

      // Arriving: a square swelling out of the middle, brightest as it lands, so the front
      // itself is visible rather than the wave being a hard edge of flat colour.
      const e = 1 - (1 - p) * (1 - p);
      const size = ts * (0.45 + 0.55 * e);
      const off = (ts - size) / 2;
      ctx.globalAlpha = e;
      ctx.fillStyle = base;
      rrect(ctx, X + off, Y + off, size, size, radius);
      ctx.fill();
      ctx.globalAlpha = e * (1 - p) * 0.85;
      ctx.fillStyle = light;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/** The white selection ring plus the pulsing dashed rings on every legal target. */
export function drawSelection(scene: Scene): void {
  const { ctx, layout, selection, valid } = scene;
  const ts = layout.ts;

  if (selection) {
    const x = layout.x0(selection.c) + 2, y = layout.y0(selection.r) + 2;
    const w = ts - 4, h = ts - 4, r = Math.max(6, ts * 0.18);
    ctx.save();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.shadowColor = "#fff"; ctx.shadowBlur = 10;
    rrect(ctx, x, y, w, h, r); ctx.stroke();
    ctx.restore();
  }

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  const col = ownerCol(scene.current, "glow");
  for (const v of valid) {
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.4 * pulse;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.setLineDash([ts * 0.12, ts * 0.10]);
    ctx.beginPath(); ctx.arc(layout.cx(v.c), layout.cy(v.r), ts * 0.34, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
