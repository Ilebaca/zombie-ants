/**
 * CHALLENGING A FRIEND, DRIVEN THE WAY A PLAYER DRIVES IT.
 *
 * The feature is two paths through the SAME setup flow, and what has to be true is that
 * each one ends somewhere different:
 *
 *   challenging  map → colony → formation → WHO → the match
 *   invited      the bar → colony → formation → the match, on their ground
 *
 * So these tests press the real buttons on the real screens rather than calling methods.
 * A flow that ends in the wrong place is the whole failure mode here, and only walking it
 * can see that.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION, inviteFrom } from "../../platform";
import { App } from "../app";
import { buildDuelPick, waitingFor } from "../duel";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

/** A profile past the tutorial, with friends — the state the feature is for. */
function ready(): ProfileStore {
  const store = new ProfileStore(new MemoryStore());
  store.update((p) => {
    p.tourSeen = TOUR_VERSION;
    p.friends = [
      { id: "p:vela", name: "Vela", colony: 900, species: "fire", since: 0 },
      { id: "p:kestra", name: "Kestra", colony: 1400, species: "ghost", since: 0 },
    ];
  });
  return store;
}

function mount(store: ProfileStore): HTMLElement {
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  new App(host, store).start();
  return host;
}

const visible = <T extends HTMLElement>(host: HTMLElement, sel: string): T | null =>
  Array.from(host.querySelectorAll<T>(sel)).find((e) => !e.closest(".hidden")) ?? null;

const press = (host: HTMLElement, sel: string): void => {
  const el = visible<HTMLButtonElement>(host, sel);
  expect(el, `nothing to press at ${sel}`).toBeTruthy();
  el?.click();
};

describe("the button under Daily", () => {
  it("is on the home screen and opens the flow that sets a challenge up", () => {
    const host = mount(ready());
    const button = visible<HTMLButtonElement>(host, ".duelfab");
    expect(button, "there is no way to challenge a friend").toBeTruthy();
    button?.click();
    expect(visible(host, "#mapsel"), "the challenge flow did not open").toBeTruthy();
  });

  /**
   * THE BADGE IS THE WHOLE RECEIVING HALF. Nothing else on the home screen can say that
   * somebody is waiting on an answer, so if this is not here the invitation is unreachable.
   */
  it("counts the invitations waiting", () => {
    const store = ready();
    expect(store.duels.length, "a new colony has nothing to accept").toBeGreaterThan(0);
    const host = mount(store);
    expect(visible(host, ".duelfab .fabdot")?.textContent).toBe(String(store.duels.length));
  });

  it("carries no badge once they are answered", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    const host = mount(store);
    expect(visible(host, ".duelfab"), "the button went away with the badge").toBeTruthy();
    expect(visible(host, ".fabdot"), "a badge with nothing behind it").toBeNull();
  });
});

describe("challenging somebody", () => {
  /**
   * The flow is the ORDINARY one until its last step, and then it asks who instead of
   * going looking for a stranger.
   */
  it("ends at the friend picker rather than at a search", () => {
    const host = mount(ready());
    press(host, ".duelfab");
    press(host, "#mapsel .cta");        // the ground
    press(host, "#start .cta");         // the colony
    press(host, "#formation .cta");     // the shape, and then: who?
    expect(visible(host, "#duelpick"), "a challenge went looking for a stranger").toBeTruthy();
    expect(host.querySelectorAll("#duelpick .duelrow").length).toBe(2);
  });

  /** ...and Play, from the same home screen, still does not. */
  it("leaves the ordinary flow alone", () => {
    const host = mount(ready());
    press(host, ".playbtn");
    press(host, "#mapsel .cta");
    press(host, "#start .cta");
    press(host, "#formation .cta");
    expect(visible(host, "#duelpick"), "Play asked which friend to play").toBeNull();
  });

  it("offers a way to get friends rather than an empty list", () => {
    const store = ready();
    store.update((p) => { p.friends = []; });
    let found = false;
    const screen = buildDuelPick({
      profile: store,
      onBack: () => {},
      onPick: () => {},
      onFindFriends: () => { found = true; },
    });
    expect(screen.querySelector(".duelrow")).toBeNull();
    screen.querySelector<HTMLButtonElement>(".duelempty .cta")?.click();
    expect(found, "the empty list is a dead end").toBe(true);
  });
});

describe("being invited", () => {
  /** The bar sits on the screen the invitation REPLACES: the ground is already chosen. */
  it("shows who challenged you, on the map picker", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    store.addDuel(inviteFrom("Vela", 900, "mid", Date.now()));
    const host = mount(store);
    press(host, ".duelfab");
    const bar = visible(host, "#mapsel .invbar");
    expect(bar, "an invitation arrived with nowhere to read it").toBeTruthy();
    expect(bar?.textContent).toContain("Vela");
    expect(bar?.textContent, "the bar does not say which ground").toContain("Gauntlet");
  });

  /**
   * ACCEPTING SKIPS THE GROUND AND KEEPS THE REST. The person who sent it picked the map;
   * the colony and the shape are still the guest's to choose.
   */
  it("goes to the colony picker, on their map", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    store.addDuel(inviteFrom("Vela", 900, "mid", Date.now()));
    const host = mount(store);
    press(host, ".duelfab");
    press(host, "#mapsel .invbtn");
    expect(visible(host, "#start"), "accepting did not open the colony picker").toBeTruthy();
    expect(store.duels.length, "the invitation is still in the inbox").toBe(0);

    // ...and the ground really is THEIRS. Stepping back to the picker, it is sitting on
    // the map the invitation named rather than on whatever the player last chose — which
    // is the entire reason the guest does not get a map step of their own.
    press(host, "#specBack");
    const deck = visible(host, "#mapDeck");
    const slides = Array.from(deck?.querySelectorAll<HTMLElement>(".slide") ?? []);
    const shown = slides.findIndex((sl) => sl.dataset.slide === "mid");
    const rail = deck?.querySelector<HTMLElement>(".deckrail");
    expect(shown, "the invitation named a map the picker does not have").toBeGreaterThan(-1);
    // The rail's travel divided by one slide's width is the slide on show. Read that way
    // rather than as pixels, because jsdom lays nothing out and the deck falls back to the
    // window's width — the INDEX is the fact being asserted, not the number of pixels.
    const step = Number((rail?.style.transform.match(/-?([\d.]+)px/) ?? [])[1] ?? 0);
    const width = deck?.getBoundingClientRect().width || window.innerWidth;
    expect(Math.round(step / width), "the picker did not open on their map").toBe(shown);
  });

  /** An invitation you can only accept is a demand. */
  it("can be declined, and then it is gone", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    store.addDuel(inviteFrom("Vela", 900, "mid", Date.now()));
    const host = mount(store);
    press(host, ".duelfab");
    press(host, "#mapsel .invghost");
    expect(store.duels.length).toBe(0);
    expect(visible(host, "#mapsel .invbar"), "the bar outlived the invitation").toBeNull();
  });
});

describe("the wait", () => {
  /**
   * A CHALLENGE IS NOT A SEARCH. The screen between choosing and playing is the same one,
   * because the moment is the same; the sentence on it is not, because a player who has
   * picked the person is not looking for anybody.
   */
  it("names the person being waited for", async () => {
    const host = mount(ready());
    press(host, ".duelfab");
    press(host, "#mapsel .cta");
    press(host, "#start .cta");
    press(host, "#formation .cta");
    const row = Array.from(host.querySelectorAll<HTMLElement>(".duelrow"))
      .find((r) => r.textContent?.includes("Kestra"));
    row?.click();
    await Promise.resolve();
    const status = host.querySelector(".mmk-status")?.textContent ?? "";
    expect(status, `the wait said: ${status}`).toContain("Kestra");
    expect(status, "a chosen opponent was described as a search").not.toContain("Searching");
  });
});

describe("how long it has been waiting", () => {
  /**
   * Minutes and hours, not days. `agoOf` in the news feed answers "Today" for anything
   * that arrived since midnight, which tells a player nothing about whether the person
   * who challenged them is still sitting there.
   */
  it("is written in a unit an invitation lives in", () => {
    const now = 1_700_000_000_000;
    expect(waitingFor(now - 10_000, now)).toBe("just now");
    expect(waitingFor(now - 4 * 60_000, now)).toBe("4m ago");
    expect(waitingFor(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(waitingFor(now - 50 * 3_600_000, now)).toBe("2d ago");
  });
});
