/**
 * NEWS: what changed, and a picture of it.
 *
 * The screen was a "Coming soon" panel, which is what the legacy build ships — but a game
 * that has no way to tell a player what it just did has to explain every change twice, in
 * a store listing nobody reads and in a screen that says nothing.
 *
 * THE PICTURES ARE DRAWN, NEVER FILES. Same rule as the manual and the pickers (CLAUDE.md
 * — the pickers show the game): a post about the board draws a real `GameState` with the
 * board's own code, so a change to how a vein or a nest is drawn reaches the news on the
 * same commit; a post about a screen draws that screen's mark on a plate of its colour.
 * There is no image to keep in step and no screenshot that can go stale.
 *
 * A post opens where it sits, like a chamber in the Anthill — one long page of every
 * article in full is a wall, and a second screen for one article is a screen too many.
 */
import { agoOf, newsFeed } from "../platform";
import type { NewsArt, NewsPost, ProfileStore } from "../platform";
import { createGame } from "../engine";
import { drawSnapshot } from "../render";
import { el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

const TAG_LABEL: Record<NewsPost["tag"], string> = {
  update: "Update",
  balance: "Balance",
  coming: "Coming soon",
};

export function buildNews(store: ProfileStore, onBack: () => void): HTMLElement {
  const root = screenEl("news");
  const posts = newsFeed();
  // The newest post stands open: a feed that opens fully collapsed asks the player to tap
  // before it has told them anything.
  let open = posts[0]?.id ?? "";

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, { title: "News", sub: "What changed", onBack });

    const body = el("div", "screenbody sb-top");
    const list = el("div", "newswrap");
    for (const post of posts) {
      list.appendChild(card(post, open === post.id, () => {
        // Tapping the open post closes it, so a reader can collapse what they have read.
        open = open === post.id ? "" : post.id;
        render();
      }));
    }
    body.appendChild(list);
    root.appendChild(body);
  };

  render();
  // Read on arrival. The badge is about posts the player has not SEEN, and they are
  // looking at them — holding it until they open each one would leave it standing forever.
  store.markNewsRead();
  return root;
}

/** One post: the picture, the date and tag, the title and lead, and the body when open. */
function card(post: NewsPost, open: boolean, onToggle: () => void): HTMLElement {
  const box = el("article", "newscard" + (open ? " open" : ""));
  box.dataset.post = post.id;

  const head = el("button", "newshead");
  head.type = "button";
  head.setAttribute("aria-expanded", String(open));
  head.appendChild(hero(post.art));

  const text = el("div", "newstext");
  const meta = el("div", "newsmeta");
  meta.append(
    el("span", `newstag tag-${post.tag}`, TAG_LABEL[post.tag]),
    el("span", "newsage", agoOf(post.at)),
  );
  text.append(meta, el("h3", "newstitle", post.title), el("p", "newslead", post.lead));
  head.appendChild(text);
  head.onclick = onToggle;
  box.appendChild(head);

  if (open) {
    const full = el("div", "newsbody");
    for (const para of post.body) full.appendChild(el("p", undefined, para));
    box.appendChild(full);
  } else {
    const more = el("div", "newsmore");
    more.append(el("span", undefined, "Read more"), icon("next", 12));
    box.appendChild(more);
  }
  return box;
}

/* -------------------------------------------------------------------- THE PICTURE */

/** Either a real board, or the mark of the screen the post is about, on a colour plate. */
function hero(art: NewsArt): HTMLElement {
  const box = el("div", "newshero");
  if (art.kind === "mark") {
    box.classList.add("newshero-mark");
    box.style.setProperty("--c", art.col);
    box.appendChild(icon(art.icon, 30));
    return box;
  }

  const canvas = document.createElement("canvas");
  const state = createGame({
    map: art.map,
    species: { you: art.species, ai: art.species === "fire" ? "ghost" : "fire" },
    seed: 0x0ff1ce,
  });
  // A window rather than the whole board: a 9x9 map in a thumbnail is a texture, and what
  // a picture beside a headline has room to say is "this is the game", not "this is the map".
  drawSnapshot(canvas, state, {
    tile: 26,
    terrain: true,
    view: { c: 0, r: state.size - 4, cols: 4, rows: 4 },
    padTiles: 0.2,
    fluid: true,
  });
  box.appendChild(canvas);
  return box;
}
