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
 * WHERE AN AVATAR COMES FROM, in the fewest words that are actually useful.
 *
 * The road's fifty name their CHAPTER rather than saying "the Colony Road": a number is
 * something to play toward where the name of a screen is not, which is the rule the
 * granary's levels and the locked trait slots already follow.
 */
function source(id: string): string {
  if (FREE_AVATARS.includes(id)) return "Yours from the start";
  const chapter = ROAD_AVATARS.indexOf(id);
  if (chapter >= 0) return `Colony Road · chapter ${chapter + 1}`;
  return "Lucky hatch";
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
      const label = had
        ? (on ? `${name} · worn · ${source(id)}` : `Wear ${name} · ${source(id)}`)
        : `${name} · locked · ${source(id)}`;
      tile.title = label;
      tile.setAttribute("aria-label", label);
      tile.setAttribute("aria-pressed", String(on));
      // A LOCKED TILE IS DISABLED rather than refusing on tap with a toast. The source is
      // already written on it, so a press has nothing left to say — and the one mechanism
      // a player can see is the right one (the setup arrows' lesson).
      if (!had) tile.disabled = true;
      else {
        tile.onclick = () => {
          // THE DEFAULT IS STORED BY CLEARING THE FIELD, never by writing its id — the
          // same rule wearing a basic look follows. "Has not chosen" and "chose the one
          // every colony starts with" look identical on screen, and two ways to spell
          // one state is two states to keep in step.
          if (!store.wearAvatar(id === DEFAULT_AVATAR ? null : id)) return;
          opts.onChanged?.();
          render();
        };
      }
      grid.appendChild(tile);
    }
    wrap.appendChild(grid);

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
