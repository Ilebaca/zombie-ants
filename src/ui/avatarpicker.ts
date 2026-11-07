/**
 * WHO YOU ARE — the ninety-eight faces, and the one being worn.
 *
 * Everything else a player collects in this game belongs to a COLONY: a skin is what the
 * Fire Ant looks like, a trait is what sits on its bench, research is what it has learned.
 * An avatar is the first thing that is theirs — the face beside their own name on the top
 * bar, on the profile, and across the board from somebody else the day there is a server.
 * That is why it is one screen rather than a tab on a colony's page, and why there is
 * exactly ONE worn rather than one per species.
 *
 * THE LOCKED ONES ARE DRAWN, which is the rule the skin picker already follows and the
 * whole reason a collection is a collection: seeing the ninety-odd you have not got is
 * what makes walking the road and opening the hatch worth doing. A padlock over a blank
 * square would say only "not yours"; the face behind it says what you are working toward.
 *
 * AND EACH LOCKED ONE SAYS WHERE IT COMES FROM. There are three answers — the chapter of
 * the road that pays it, the hatch, or the ten everybody starts with — and a collection
 * that will not say how a thing is got is a collection a player cannot play toward.
 *
 * AND IT SAYS IT ON A TAP, IN A BUBBLE ABOVE THE TILE. Asked for directly: "if a player
 * taps on an icon that he doesn't have it should pop up a message above it that says how
 * can he get that icon." It used to be written on the tile's `title` and nowhere a finger
 * can reach — a phone has no hover, so the one sentence the locked nine-tenths of this
 * screen exist to carry was readable only by a mouse or a screen reader.
 */
import {
  AVATAR_IDS, DEFAULT_AVATAR, FREE_AVATARS, HATCH_AVATARS, ROAD_AVATARS, TRAITS_CHAPTER,
  avatarName, avatarProgress,
} from "../platform";
import type { ProfileStore } from "../platform";
import { avatarFace, el, redraw, screenEl, screenHeader } from "./chrome";

export interface AvatarPickerOptions {
  onBack: () => void;
  /** Told after a change, so the screen behind can redraw the face it is showing. */
  onChanged?: () => void;
}

/**
 * WHERE AN AVATAR COMES FROM, AND HOW TO GET ONE — one function, both wordings.
 *
 * They are two different sentences for two different states: `from` is a fact about a
 * face you already hold ("Colony Road · chapter 5") and `how` is the route to one you do
 * not ("Reach chapter 5 on the Colony Road"). Written as two functions they would be two
 * copies of the same three branches, which is the duplication §7 is about — the day a
 * fourth way in lands, one of them gets it and the other does not.
 *
 * The road's fifty name their CHAPTER rather than saying "the Colony Road": a number is
 * something to play toward where the name of a screen is not, which is the rule the
 * granary's levels and the locked trait slots already follow.
 */
interface Route {
  /** Where a face the player HOLDS came from. */
  from: string;
  /** How a face they do NOT hold is got. */
  how: string;
}

function route(id: string): Route {
  if (FREE_AVATARS.includes(id)) {
    // Unreachable as a `how` — one of the ten is never locked — and it is spelled out
    // rather than left to fall through, because a bubble reading "undefined" on a save
    // somebody has hand-edited is worse than a sentence nobody sees.
    return { from: "Yours from the start", how: "Yours from the start" };
  }
  const chapter = ROAD_AVATARS.indexOf(id);
  if (chapter >= 0) {
    return {
      from: `Colony Road · chapter ${chapter + 1}`,
      how: `Reach chapter ${chapter + 1} on the Colony Road`,
    };
  }
  return { from: "Lucky hatch", how: "Open a Lucky hatch" };
}

/** How far the bubble floats clear of the tile it points at. */
const HINT_GAP = 7;

/**
 * ABOVE THE TILE, OR UNDER IT WHEN THERE IS NO ROOM.
 *
 * Asked for above, and above is where it goes — except on the FIRST row, where there is
 * nothing above but the "Collected 23 of 98" heading, and the bubble landed across it
 * with half the count behind it. A sentence written over another sentence is worse than
 * one on the other side of the thing it points at.
 *
 * It is a pure function of two numbers rather than a branch inside the measuring, because
 * jsdom has no layout: every offset there reads 0, so a test of the placed element can
 * only ever see one of the two answers. This one can be asked both questions.
 */
export function hintSide(tileTop: number, hintHeight: number): "above" | "below" {
  return tileTop - HINT_GAP - hintHeight >= 0 ? "above" : "below";
}

/**
 * THE BUBBLE IS PLACED BY MEASUREMENT, and that is a deliberate exception.
 *
 * Almost everything on these screens is LAID OUT rather than measured (the three home
 * buttons are on record for it), and the obvious laid-out answer here does not work: the
 * tile carries `overflow: hidden` to clip its picture to the rounded corner, so a bubble
 * inside it is cut off at the tile's own edge — the same clip the top bar's tap targets
 * are already on record for. Positioned against the GRID instead, `offsetLeft`/`offsetTop`
 * give the exact geometry with no column arithmetic in the TypeScript and nothing for the
 * stylesheet's `repeat(5, 1fr)` to drift against.
 *
 * It flips UNDER the tile when the row it is on has nothing above it but the heading
 * (`hintSide`), and it is CLAMPED into the grid rather than centred blindly: a bubble centred on the first
 * or last column hangs past the screen's edge, and the screen is the scroller, so that is
 * a clipped sentence and a sideways scrollbar. The TAIL is what keeps it pointing at the
 * right tile once the box has been pushed back in.
 *
 * A measured position goes stale on a resize, which is acceptable here and nowhere else:
 * the bubble lives for one tap and the next press anywhere puts it away.
 *
 * NONE OF THIS IS VISIBLE TO A TEST — jsdom has no layout, so every offset reads 0 and
 * the bubble lands in the corner. What the tests hold is that it exists, says the route
 * and goes away again; where it sits was checked in a browser.
 */
function place(hint: HTMLElement, grid: HTMLElement, tile: HTMLElement): void {
  const box = hint.offsetWidth;
  const span = grid.offsetWidth;
  const mid = tile.offsetLeft + tile.offsetWidth / 2;
  const left = span > box ? Math.min(Math.max(mid - box / 2, 0), span - box) : 0;
  hint.style.left = `${left}px`;
  const below = hintSide(tile.offsetTop, hint.offsetHeight) === "below";
  hint.classList.toggle("below", below);
  hint.style.top = below
    ? `${tile.offsetTop + tile.offsetHeight + HINT_GAP}px`
    : `${tile.offsetTop - HINT_GAP - hint.offsetHeight}px`;
  hint.style.setProperty("--tailx", `${mid - left}px`);
}

/**
 * RAISE THE BUBBLE, or put it away if it was already on this tile.
 *
 * There is no state to keep: the open bubble IS the state, found by querying the grid.
 * A field on the screen would have to be cleared on every render — the grid is rebuilt
 * whole when a face is worn — and a stale node reference is exactly the fault the tour's
 * "targets are looked up on every measure" rule exists for.
 */
function showHint(grid: HTMLElement, tile: HTMLElement, text: string): void {
  const open = grid.querySelector<HTMLElement>(".av-hint");
  const id = tile.dataset.av ?? "";
  const again = open?.dataset.av === id;
  open?.remove();
  // A SECOND TAP ON THE SAME FACE PUTS IT AWAY. A bubble that can only be dismissed by
  // tapping something else is one the player has to find a way out of.
  if (again) return;
  const hint = el("span", "av-hint", text);
  hint.dataset.av = id;
  // The sentence is already the tile's own `aria-label`, so the bubble is decoration to
  // a screen reader and says so — announced twice it reads as two different faces.
  hint.setAttribute("aria-hidden", "true");
  grid.appendChild(hint);
  place(hint, grid, tile);
}

export function buildAvatarPicker(
  store: ProfileStore, opts: AvatarPickerOptions,
): HTMLElement {
  const root = screenEl("avatars");

  const render = (): void => {
    redraw(root);
    const { has, of } = avatarProgress(store.avatars);
    screenHeader(root, {
      title: "Avatars", onBack: opts.onBack,
      backId: "avBack",
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "avwrap");
    wrap.id = "avBody";

    /**
     * THE ONE BEING WORN, ABOVE THE REST AND AT THE SIZE IT IS CHOSEN AT.
     *
     * The grid is five across so the collection reads at a glance, which makes every
     * tile in it too small to judge a face by. The current one is shown big because it
     * is the only one the player is actually deciding about.
     */
    // The CHOICE can be null; the face never is (`faceOf`), so the hero always shows a
    // real painting rather than the drawn worker a brand-new colony used to open behind.
    const worn = store.face;
    const hero = el("div", "av-hero");
    hero.appendChild(avatarFace(worn, 96, "av-hero-f"));
    /**
     * AND THE LINE UNDER IT IS THE FACE'S NAME, asked for directly: "instead of the
     * road name it has to be the name of the icon."
     *
     * It said where the avatar came FROM — "Colony Road · chapter 5" — which is a fact
     * about a face you have not got yet, and the hero is the one you are WEARING. The
     * source is still written on every tile (§ EVERY CONTROL SAYS WHAT IT IS) and under
     * the grid for the ones that are locked, which is where somebody asking "how do I
     * get that" is looking.
     */
    hero.appendChild(el("div", "av-hero-k", avatarName(worn)));
    wrap.appendChild(hero);

    /**
     * HOW MANY OF THEM YOU HAVE, ONCE, DIRECTLY OVER THE GRID IT COUNTS.
     *
     * It was printed twice — above the hero and again above the tiles — which is the
     * same fault the cooldown had on the species page: a number said twice on one
     * screen reads as two different numbers until you check. The one that stays is the
     * one touching the thing it is about.
     */
    wrap.appendChild(el("div", "secthead", `Collected ${has} of ${of}`));

    const grid = el("div", "avgrid");
    grid.id = "avGrid";
    for (const id of AVATAR_IDS) {
      const had = store.hasAvatar(id);
      const on = worn === id;
      const tile = el("button", `av-t${had ? "" : " off"}${on ? " on" : ""}`) as HTMLButtonElement;
      tile.type = "button";
      tile.dataset.av = id;
      tile.appendChild(avatarFace(id, 62, "av-f"));
      // A tile is a picture with no words on it at any width, so what it carries is the
      // face's NAME and where it came from (§ EVERY CONTROL SAYS WHAT IT IS). The name
      // leads, because that is what the tile is a picture OF; the source is the second
      // half and is the whole answer on a locked one.
      const name = avatarName(id);
      const { from, how } = route(id);
      const label = had
        ? (on ? `${name} · worn · ${from}` : `Wear ${name} · ${from}`)
        : `${name} · locked · ${how}`;
      tile.title = label;
      tile.setAttribute("aria-label", label);
      tile.setAttribute("aria-pressed", String(on));
      // A LOCKED TILE IS NOT DISABLED, which reverses what stood here. It was, on the
      // argument that the source is already written on it so a press has nothing left to
      // say — and on a phone that writing is `title`, which no finger can reach. A
      // disabled button dispatches no click at all, so the tap had nowhere to go.
      grid.appendChild(tile);
    }
    wrap.appendChild(grid);

    /**
     * ONE DELEGATED HANDLER, because three things share one rule: wearing a face,
     * opening a locked one's bubble, and putting that bubble away. Split across a
     * per-tile `onclick` and a listener on the page they fight over the same press —
     * the tile's handler raises the bubble and the page's, firing later up the same
     * path, takes it straight back down.
     */
    wrap.onclick = (e: Event): void => {
      const target = e.target as Element | null;
      const tile = target?.closest?.(".av-t") as HTMLButtonElement | null;
      const id = tile?.dataset.av ?? "";
      // A press on the page that is not a face at all puts the bubble away.
      if (!tile || !id) { grid.querySelector(".av-hint")?.remove(); return; }
      if (store.hasAvatar(id)) {
        // AND WEARING ONE PUTS IT AWAY BY REBUILDING, not by clearing it here. A second
        // `remove()` on this branch was unreachable code dressed as a rule — `render()`
        // throws the whole grid out and the bubble with it, and the mutation that deleted
        // the line passed every test (the ability card's clock guard, again).
        // THE DEFAULT IS STORED BY CLEARING THE FIELD, never by writing its id — the
        // same rule wearing a basic look follows. "Has not chosen" and "chose the one
        // every colony starts with" look identical on screen, and two ways to spell
        // one state is two states to keep in step.
        if (!store.wearAvatar(id === DEFAULT_AVATAR ? null : id)) return;
        opts.onChanged?.();
        render();
        return;
      }
      showHint(grid, tile, route(id).how);
    };

    /**
     * WHERE THE REST ARE, once, under the grid rather than on every locked tile.
     *
     * The hatch is gated on the same chapter traits are, so a player who cannot open one
     * yet is told the chapter rather than pointed at a screen that will turn them away.
     */
    const left = HATCH_AVATARS.filter((id) => !store.hasAvatar(id)).length;
    const note = left > 0
      ? `${ROAD_AVATARS.length} are paid by the Colony Road, one a chapter. The other ${HATCH_AVATARS.length} hatch from larva${store.traitsOpen() ? "" : ` — the lucky hatch opens at chapter ${TRAITS_CHAPTER}`}.`
      : `${ROAD_AVATARS.length} are paid by the Colony Road, one a chapter. Every hatchable one has been found.`;
    wrap.appendChild(el("div", "av-note", note));

    body.appendChild(wrap);
    root.appendChild(body);
  };

  render();
  return root;
}
