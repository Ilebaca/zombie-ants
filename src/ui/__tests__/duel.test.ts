/**
 * CHALLENGING A FRIEND, DRIVEN THE WAY A PLAYER DRIVES IT.
 *
 * The feature is two paths through the SAME setup flow, and what has to be true is that
 * each one ends somewhere different:
 *
 *   challenging  the drawer → Friends → the crossed swords → formation → colony → the match
 *   invited      the bar on the setup screen → formation → colony → the match
 *
 * So these tests press the real buttons on the real screens rather than calling methods.
 * A flow that ends in the wrong place is the whole failure mode here, and only walking it
 * can see that.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION, inviteFrom } from "../../platform";
import { App } from "../app";
import { waitingFor } from "../duel";

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

/** The route a player takes to the list: the hamburger, then the drawer's Friends entry. */
const openFriends = (host: HTMLElement): void => {
  press(host, ".settingsfab");
  press(host, '.menuitem[data-go="friends"]');
};

/** The row for one friend, found by the name written on it. */
const rowFor = (host: HTMLElement, name: string): HTMLElement | undefined =>
  Array.from(host.querySelectorAll<HTMLElement>("#friends .frlist > *"))
    .find((r) => r.textContent?.includes(name));

describe("the way to a challenge", () => {
  /**
   * IT STARTS ON THE FRIEND. There was a floating button on home that opened a picker of
   * friends — a screen whose whole job was to ask a question the friends list is already
   * an answer to. The challenge is a button on the row now.
   */
  it("is a button on each friend, and it opens the setup flow", () => {
    const host = mount(ready());
    openFriends(host);
    const row = rowFor(host, "Kestra");
    expect(row, "the friends list has no row for Kestra").toBeTruthy();
    row?.querySelector<HTMLButtonElement>(".frfight")?.click();
    expect(visible(host, "#formation"), "the challenge flow did not open").toBeTruthy();
  });

  /** ...and home no longer carries a button for it at all. */
  it("is not a third floating button on home", () => {
    const host = mount(ready());
    expect(visible(host, ".duelfab"), "the home screen still asks about friends").toBeNull();
  });

  /**
   * THE BADGE IS THE WHOLE RECEIVING HALF. It rode the floating button; with that gone the
   * count belongs on the drawer's Friends entry, which is the only route to the list — a
   * badge nowhere at all makes an invitation unreachable.
   */
  it("counts the invitations waiting, on the way to the list", () => {
    const store = ready();
    expect(store.duels.length, "a new colony has nothing to accept").toBeGreaterThan(0);
    const host = mount(store);
    press(host, ".settingsfab");
    expect(visible(host, '.menuitem[data-go="friends"] .menudot')?.textContent)
      .toBe(String(store.duels.length));
  });

  it("carries no badge once they are answered", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    const host = mount(store);
    press(host, ".settingsfab");
    expect(visible(host, '.menuitem[data-go="friends"]'), "the way in went with the badge")
      .toBeTruthy();
    expect(visible(host, '.menuitem[data-go="friends"] .menudot'),
      "a badge with nothing behind it").toBeNull();
  });
});

describe("removing somebody", () => {
  /** The most destructive thing on the screen asks twice, on its own button. */
  it("asks before it does it", () => {
    const store = ready();
    const host = mount(store);
    openFriends(host);
    rowFor(host, "Vela")?.querySelector<HTMLButtonElement>(".frdrop")?.click();
    expect(store.get().friends.length, "one tap removed a friend").toBe(2);
    expect(rowFor(host, "Vela")?.textContent).toContain("Remove?");
    rowFor(host, "Vela")?.querySelector<HTMLButtonElement>(".frdrop.armed")?.click();
    expect(store.get().friends.map((f) => f.name)).toEqual(["Kestra"]);
  });

  /** And the question can be answered no, or it is not a question. */
  it("can be called off", () => {
    const store = ready();
    const host = mount(store);
    openFriends(host);
    rowFor(host, "Vela")?.querySelector<HTMLButtonElement>(".frdrop")?.click();
    rowFor(host, "Vela")?.querySelector<HTMLButtonElement>(".frkeep")?.click();
    expect(store.get().friends.length).toBe(2);
    expect(rowFor(host, "Vela")?.querySelector(".frfight"), "the row lost its challenge")
      .toBeTruthy();
  });
});

describe("challenging somebody", () => {
  /**
   * ABANDONING A CHALLENGE ABANDONS IT. The way in marks the setup screen as a challenge
   * and nothing unmarked it, so backing out to home and pressing PLAY played whoever was
   * seated last — the ordinary flow silently still being the one before it.
   */
  it("does not leave the next ordinary match against the friend", async () => {
    const host = mount(ready());
    openFriends(host);
    rowFor(host, "Kestra")?.querySelector<HTMLButtonElement>(".frfight")?.click();
    press(host, "#setupBack");          // out of the challenge, back to home
    press(host, ".playbtn");
    press(host, "#setupGo");
    press(host, "#setupGo");
    await Promise.resolve();
    const status = host.querySelector(".mmk-status")?.textContent ?? "";
    expect(status, `the ordinary match said: ${status}`).not.toContain("Kestra");
  });

  /** ...and Play, from the same home screen, goes looking for a stranger. */
  it("leaves the ordinary flow alone", async () => {
    const host = mount(ready());
    press(host, ".playbtn");
    press(host, "#setupGo");
    press(host, "#setupGo");
    await Promise.resolve();
    const status = host.querySelector(".mmk-status")?.textContent ?? "";
    expect(status, "Play named a friend").not.toContain("Kestra");
  });

  it("says how to get friends rather than showing an empty list", () => {
    const store = ready();
    store.update((p) => { p.friends = []; });
    const host = mount(store);
    openFriends(host);
    expect(visible(host, "#friends .frfight"), "a challenge with nobody to challenge")
      .toBeNull();
    expect(visible(host, "#friends")?.textContent).toContain("No friends yet");
  });
});

describe("being invited", () => {
  /**
   * The bar sits on the screen the invitation INTERRUPTS. It used to ride the map picker,
   * because the ground was the one choice an invitation had already made; with one board
   * (engine/config.ts) what it has chosen is the OPPONENT, and this is the screen standing
   * between the player and playing them.
   */
  it("shows who challenged you, on the setup screen", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    store.addDuel(inviteFrom("Vela", 900, "small", Date.now()));
    const host = mount(store);
    press(host, ".playbtn");
    const bar = visible(host, "#formation .invbar");
    expect(bar, "an invitation arrived with nowhere to read it").toBeTruthy();
    expect(bar?.textContent).toContain("Vela");
    expect(bar?.textContent, "the bar does not say how big their colony is").toContain("900");
  });

  /**
   * ACCEPTING KEEPS THE CHOICES THAT ARE STILL THE GUEST'S. The colony and the formation
   * are theirs to pick; what the invitation settled is who is across the board.
   */
  it("goes straight into the setup, with the invitation answered", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    store.addDuel(inviteFrom("Vela", 900, "small", Date.now()));
    const host = mount(store);
    press(host, ".playbtn");
    press(host, "#formation .invbtn");
    expect(visible(host, "#formation"), "accepting left the setup").toBeTruthy();
    expect(visible(host, "#formation .invbar"), "the bar outlived the answer").toBeNull();
    expect(store.duels.length, "the invitation is still in the inbox").toBe(0);
  });

  /** An invitation you can only accept is a demand. */
  it("can be declined, and then it is gone", () => {
    const store = ready();
    for (const d of [...store.duels]) store.answerDuel(d.id);
    store.addDuel(inviteFrom("Vela", 900, "small", Date.now()));
    const host = mount(store);
    press(host, ".playbtn");
    press(host, "#formation .invghost");
    expect(store.duels.length).toBe(0);
    expect(visible(host, "#formation .invbar"), "the bar outlived the invitation").toBeNull();
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
    openFriends(host);
    rowFor(host, "Kestra")?.querySelector<HTMLButtonElement>(".frfight")?.click();
    press(host, "#setupGo");
    press(host, "#setupGo");
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
