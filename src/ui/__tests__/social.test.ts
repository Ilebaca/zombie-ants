/**
 * NEWS, FRIENDS AND SUPPORT: the three screens that were "Coming soon" panels.
 *
 * Driven the way a player drives them — tap a tab, type a name, press Add — and asserted
 * on the profile afterwards, because every one of these screens writes to the save.
 */
import { describe, expect, it, vi } from "vitest";
import {
  FAQ, LocalFriendService, LocalSupportGateway, MemoryStore, NEWS, ProfileStore,
  SUPPORT_EMAIL, directory, newsFeed,
} from "../../platform";
import type { Person } from "../../platform";
import { buildNews } from "../news";
import { buildFriends } from "../friends";
import { buildSupport } from "../support";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const store = (): ProfileStore => new ProfileStore(new MemoryStore());
const click = (el: Element | null | undefined): void => {
  expect(el, "expected a clickable element").toBeTruthy();
  (el as HTMLElement).click();
};
const tab = (root: HTMLElement, id: string): void =>
  click(root.querySelector(`.frtab[data-tab="${id}"]`));

/* --------------------------------------------------------------------------- NEWS */

describe("the news screen", () => {
  const build = (s = store()): HTMLElement => {
    const root = buildNews(s, () => {});
    document.body.replaceChildren(root);
    return root;
  };

  it("lists every post, newest first", () => {
    const root = build();
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".newscard"));
    expect(cards.map((c) => c.dataset.post)).toEqual(newsFeed().map((p) => p.id));
  });

  // A feed that opens fully collapsed asks the player to tap before it has said anything.
  it("opens with the newest post already open, and only that one", () => {
    const root = build();
    const open = Array.from(root.querySelectorAll<HTMLElement>(".newscard.open"));
    expect(open.length).toBe(1);
    expect(open[0]?.dataset.post).toBe(newsFeed()[0]?.id);
    expect(open[0]?.querySelectorAll(".newsbody p").length).toBe(newsFeed()[0]?.body.length);
    // The BODY, not just the class: the two can disagree, and a card that says it is
    // closed while printing four paragraphs is the version of this bug that looks right
    // in the DOM and wrong on the screen.
    expect(root.querySelectorAll(".newsbody").length).toBe(1);
    expect(root.querySelectorAll(".newsmore").length).toBe(newsFeed().length - 1);
  });

  it("opens the post that is tapped and closes the one that was", () => {
    const root = build();
    const second = newsFeed()[1]?.id;
    click(root.querySelector(`.newscard[data-post="${second}"] .newshead`));
    const open = Array.from(root.querySelectorAll<HTMLElement>(".newscard.open"));
    expect(open.length).toBe(1);
    expect(open[0]?.dataset.post).toBe(second);
  });

  it("closes a post tapped a second time", () => {
    const root = build();
    const first = newsFeed()[0]?.id;
    click(root.querySelector(`.newscard[data-post="${first}"] .newshead`));
    expect(root.querySelectorAll(".newscard.open").length).toBe(0);
  });

  // The badge is about posts the player has not SEEN, and they are looking at them.
  it("marks the feed read on arrival", () => {
    const s = store();
    expect(s.unread()).toBe(NEWS.length);
    build(s);
    expect(s.unread()).toBe(0);
  });

  it("gives every post a picture", () => {
    const root = build();
    for (const card of Array.from(root.querySelectorAll<HTMLElement>(".newscard"))) {
      expect(card.querySelector(".newshero"), card.dataset.post).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------------ FRIENDS */

describe("the friends screen", () => {
  const build = (s = store()): { root: HTMLElement; store: ProfileStore } => {
    const root = buildFriends(s, new LocalFriendService(), () => {});
    document.body.replaceChildren(root);
    return { root, store: s };
  };

  it("opens on the list and says what would be in it when it is empty", () => {
    const { root } = build();
    expect(root.querySelector(".frtab.on")?.textContent).toContain("Friends");
    expect(root.querySelector(".frhint")?.textContent).toMatch(/no friends yet/i);
  });

  // A request waiting is the reason to open this screen at all.
  it("counts waiting requests on the tab", () => {
    const { root, store: s } = build();
    expect(root.querySelector(".frtab[data-tab='requests'] .frbadge")?.textContent)
      .toBe(String(s.get().friendsIn.length));
  });

  it("accepts a request and moves the person onto the list", () => {
    const { root, store: s } = build();
    const person = s.get().friendsIn[0] as Person;
    tab(root, "requests");
    click(root.querySelector(`.frrow[data-person="${person.id}"] .frbtn`));
    expect(s.get().friends.map((f) => f.id)).toContain(person.id);
    tab(root, "list");
    expect(root.querySelector(`.frrow[data-person="${person.id}"]`)).toBeTruthy();
  });

  it("declines a request and it does not come back", () => {
    const { root, store: s } = build();
    const person = s.get().friendsIn[0] as Person;
    tab(root, "requests");
    click(root.querySelector(`.frrow[data-person="${person.id}"] .frghost`));
    expect(s.get().friendsIn.some((f) => f.id === person.id)).toBe(false);
    expect(s.get().friends.some((f) => f.id === person.id)).toBe(false);
  });

  it("searches, and asks somebody it found", async () => {
    const { root, store: s } = build();
    tab(root, "find");
    const field = root.querySelector<HTMLInputElement>("#frQuery");
    field!.value = "Mandible";
    click(root.querySelector("#frSearch"));
    await vi.waitFor(() => expect(root.querySelectorAll(".frrow").length).toBeGreaterThan(0));
    const row = root.querySelector<HTMLElement>(".frrow");
    const id = row?.dataset.person as string;
    click(row?.querySelector(".frbtn"));
    expect(s.friendship(id)).toBe("sent");
  });

  // A sent request has to READ as sent, or the player taps Add again and again.
  it("shows a sent request as asked, and lets it be taken back", async () => {
    const { root, store: s } = build();
    const person = directory()[3] as Person;
    s.sendFriendRequest(person);
    tab(root, "find");
    click(root.querySelector("#frSearch"));
    await vi.waitFor(() => expect(root.querySelectorAll(".frrow").length).toBeGreaterThan(0));
    tab(root, "requests");
    click(root.querySelector(`.frrow[data-person="${person.id}"] .frghost`));
    expect(s.friendship(person.id)).toBe("none");
  });

  it("says nothing is waiting when nothing is", () => {
    const s = store();
    s.update((p) => { p.friendsIn = []; p.friendsOut = []; });
    const { root } = build(s);
    tab(root, "requests");
    expect(root.querySelector(".frhint")?.textContent).toMatch(/nothing waiting/i);
  });

  /** Removing asks twice, the way Settings' reset does: a stray tap in a list is easy. */
  it("asks twice before removing a friend", () => {
    const s = store();
    const person = s.get().friendsIn[0] as Person;
    s.acceptFriend(person.id);
    const { root } = build(s);
    const btn = root.querySelector<HTMLElement>(`.frrow[data-person="${person.id}"] .frghost`);
    click(btn);
    expect(s.get().friends.length, "removed on the first tap").toBe(1);
    expect(btn?.textContent).toMatch(/sure/i);
    click(root.querySelector(`.frrow[data-person="${person.id}"] .frghost`));
    expect(s.get().friends.length).toBe(0);
  });
});

/* ------------------------------------------------------------------------ SUPPORT */

describe("the support screen", () => {
  const build = (s = store()): { root: HTMLElement; store: ProfileStore } => {
    const root = buildSupport(s, new LocalSupportGateway(), () => {});
    document.body.replaceChildren(root);
    return { root, store: s };
  };

  it("leads with the answers, all of them closed", () => {
    const { root } = build();
    expect(root.querySelectorAll(".spq").length).toBe(FAQ.length);
    expect(root.querySelectorAll(".spq.open").length).toBe(0);
  });

  it("opens one answer at a time", () => {
    const { root } = build();
    const heads = Array.from(root.querySelectorAll<HTMLElement>(".spqhead"));
    click(heads[2]);
    const open = Array.from(root.querySelectorAll<HTMLElement>(".spq.open"));
    expect(open.length).toBe(1);
    expect(open[0]?.querySelector(".spqa")?.textContent).toBe(FAQ[2]?.a);
  });

  it("files a message and keeps it", () => {
    const { root, store: s } = build();
    const box = root.querySelector<HTMLTextAreaElement>("#spText");
    box!.value = "the granary pill did nothing";
    click(root.querySelector("#spSend"));
    expect(s.get().tickets.length).toBe(1);
    expect(s.get().tickets[0]?.text).toBe("the granary pill did nothing");
    expect(root.querySelector(".spmsg-t")?.textContent).toBe("the granary pill did nothing");
  });

  it("files nothing for an empty message", () => {
    const { root, store: s } = build();
    click(root.querySelector("#spSend"));
    expect(s.get().tickets).toEqual([]);
  });

  // Choosing a subject re-renders the panel. It must not throw away what has been typed.
  it("keeps the draft when the subject changes", () => {
    const { root } = build();
    root.querySelector<HTMLTextAreaElement>("#spText")!.value = "half typed";
    click(root.querySelector(".spkind[data-kind='idea']"));
    expect(root.querySelector<HTMLTextAreaElement>("#spText")?.value).toBe("half typed");
    expect(root.querySelector(".spkind[data-kind='idea']")?.className).toContain("on");
  });

  /** Whoever reads a message needs these, and asking for them in a reply wastes a round. */
  it("puts the address, the player code and the build on the screen", () => {
    const { root, store: s } = build();
    const facts = root.querySelector(".spwrap")?.textContent ?? "";
    expect(facts).toContain(SUPPORT_EMAIL);
    expect(facts).toContain(s.get().playerId);
  });
});
