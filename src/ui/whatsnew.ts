/**
 * WHAT CHANGED WHILE YOU WERE AWAY.
 *
 * A build goes out every few days and nothing told a returning player anything had moved.
 * The News screen existed and was good; it sat behind the drawer with a small badge on it,
 * which is the right home for a FEED and no way at all to say "the thing you were annoyed
 * about is fixed".
 *
 * IT SHOWS THE MAJOR POSTS ONLY, and that is the whole of the design. `NewsPost.major` is
 * set by whoever writes the post rather than derived from its tag, because "update" covers
 * both a new feature and a button that moved — and a card that appears on every build is a
 * card a player learns to dismiss without reading, which costs the one build where it
 * actually mattered. Everything else waits behind the badge, where a feed belongs.
 *
 * IT IS A CARD, NOT A SCREEN. The lead line and the picture, never the body: a card that
 * reproduces the article is the feed with an extra tap in front of it, and the way into the
 * real thing is on it.
 *
 * MARKING READ IS THE CALLER'S JOB, and it marks only as far as the newest post shown
 * (`ProfileStore.markNewsRead(at)`). Marking everything would clear the badge on posts this
 * card never showed — the card claiming to have said something it did not.
 */
import type { NewsPost } from "../platform";
import { el } from "./chrome";
import { icon } from "./icons";
import { newsHero } from "./news";

export interface WhatsNewActions {
  /** Read the rest — the News screen, which is where the bodies are. */
  onAll: () => void;
  /** Done. The card goes, and the posts it showed are marked read. */
  onClose: () => void;
}

export function buildWhatsNew(posts: readonly NewsPost[], act: WhatsNewActions): HTMLElement {
  const ov = el("div", "overlay");
  ov.id = "whatsnew";

  const wrap = el("div", "overModalWrap");
  const card = el("div", "card wncard");
  card.id = "wnCard";

  const h1 = el("h1", undefined, "What's new");
  // The count is the reason to read on, and "1 update" beside a single row would be the
  // interface counting to one at somebody.
  const tag = el("div", "tag", posts.length > 1
    ? `${posts.length} things changed since you were last here`
    : "Something changed since you were last here");
  card.append(h1, tag);

  const list = el("div", "wnlist");
  for (const post of posts) {
    const row = el("div", "wnrow");
    row.appendChild(newsHero(post.art));
    const words = el("div", "wnwords");
    words.append(el("div", "wnt", post.title), el("div", "wnl", post.lead));
    row.appendChild(words);
    list.appendChild(row);
  }
  card.appendChild(list);

  const foot = el("div", "wnfoot");

  // NOT `.btn` — that is the MATCH screen's action-bar button, which stacks an icon over a
  // label in a column and carries its own face. Borrowing it here put the chevron on a
  // second line and left the gold button looking like plain text.
  const all = el("button", "wnghost") as HTMLButtonElement;
  all.type = "button";
  all.id = "wnAll";
  all.append(el("span", undefined, "Read more"), icon("next", 13));
  all.onclick = act.onAll;

  const go = el("button", "cta") as HTMLButtonElement;
  go.type = "button";
  go.id = "wnClose";
  go.textContent = "Got it";
  go.onclick = act.onClose;

  foot.append(all, go);
  card.appendChild(foot);
  wrap.appendChild(card);
  ov.appendChild(wrap);
  return ov;
}
