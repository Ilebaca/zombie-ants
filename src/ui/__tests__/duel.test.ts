/**
 * CHALLENGING A FRIEND, DRIVEN THE WAY A PLAYER DRIVES IT.
 *
 * The feature is two paths through the SAME setup flow, and what has to be true is that
 * each one ends somewhere different:
 *
 *   challenging  formation → colony → WHO → the match
 *   invited      the bar → formation → colony → the match, on their ground
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
    expect(visible(host, "#formation"), "the challenge flow did not open").toBeTruthy();
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
    press(host, "#setupGo");            // the formation
    press(host, "#setupGo");            // the colony, and then: who?
    expect(visible(host, "#duelpick"), "a challenge went looking for a stranger").toBeTruthy();
    expect(host.querySelectorAll("#duelpick .duelrow").length).toBe(2);
  });

  /** ...and Play, from the same home screen, still does not. */
  it("leaves the ordinary flow alone", () => {
    const host = mount(ready());
    press(host, ".playbtn");
    press(host, "#setupGo");
    press(host, "#setupGo");
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
    press(host, ".duelfab");
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
    press(host, ".duelfab");
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
    press(host, ".duelfab");
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
    press(host, ".duelfab");
    press(host, "#setupGo");
    press(host, "#setupGo");
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
