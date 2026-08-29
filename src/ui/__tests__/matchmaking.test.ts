/**
 * THE MATCHMAKING SCREEN.
 *
 * It shows a search, so the things worth holding are the ones a player would notice if
 * they broke: that both seats are on it, that the right one REELS until somebody is found
 * and stops dead on them, that the halves part and the match starts UNDER them, and that
 * leaving abandons the search instead of starting a match behind the next screen.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { MatchmakingScreen } from "../matchmaking";
import { botsForChapter } from "../../platform";
import type { Opponent } from "../../platform";

const ROSTER = botsForChapter(4);
const FOE: Opponent = { name: "Chitin64", colony: 1_100_000, species: "fire", human: false };

const mount = (): HTMLElement => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
};

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

interface Built { host: HTMLElement; screen: MatchmakingScreen; found: Opponent[] }

function open(search?: () => Promise<Opponent>): Built {
  const host = mount();
  const found: Opponent[] = [];
  const screen = new MatchmakingScreen(host, {
    you: { name: "Milan", colony: 1_284_000, species: "leafcutter" },
    roster: ROSTER,
    search: search ?? (() => new Promise<Opponent>((r) => setTimeout(() => r(FOE), 5000))),
    onFound: (f) => found.push(f),
  });
  screen.start();
  return { host, screen, found };
}

describe("searching for an opponent", () => {
  it("puts you on one side and the search on the other", () => {
    vi.useFakeTimers();
    const { host, screen } = open();
    expect(host.querySelector(".mmk-you .mmk-name")?.textContent).toBe("Milan");
    expect(host.querySelector(".mmk-you .mmk-colony")?.textContent).toBe("1.2M troops");
    // Nobody is named on the right yet — it is still looking.
    expect(host.querySelector(".mmk-found")?.textContent).toBe("");
    expect(host.querySelector(".mmk-reel"), "the search is not reeling").toBeTruthy();
    screen.destroy();
  });

  /**
   * The reel is ONE STRIP that drifts, not a card swapped on a timer: a swap is a hard cut
   * however short the interval, and no blur hides a jump. The roster is laid down TWICE and
   * the strip travels exactly half its height, so the wrap shows what it was already
   * showing — the loop has no seam. Both halves are what this holds.
   */
  it("reels one continuous strip, with a seamless loop", () => {
    vi.useFakeTimers();
    const { host, screen } = open();
    const strip = host.querySelector(".mmk-strip");
    expect(strip, "the reel is not a strip").toBeTruthy();

    const names = Array.from(strip?.querySelectorAll(".mmk-name") ?? [])
      .map((n) => n.textContent);
    // Every profile in the roster is on it, so there is a list to scroll...
    expect(new Set(names).size).toBe(ROSTER.length);
    // ...and exactly twice, which is what makes the wrap invisible.
    expect(names.length).toBe(ROSTER.length * 2);
    expect(names.slice(0, ROSTER.length)).toEqual(names.slice(ROSTER.length));

    // It takes its pace from how many there are, so a longer roster is not faster.
    expect((strip as HTMLElement).style.animationDuration).toMatch(/^\d+ms$/);
    screen.destroy();
  });

  it("stops dead on whoever is seated", async () => {
    vi.useFakeTimers();
    const { host, screen } = open();
    await vi.advanceTimersByTimeAsync(5100);

    expect(host.querySelector(".mmk-reel"), "the reel kept turning").toBeNull();
    expect(host.querySelector(".mmk-found .mmk-name")?.textContent).toBe("Chitin64");
    expect(host.querySelector(".mmk-found .mmk-colony")?.textContent).toBe("1.1M troops");
    expect(host.querySelector(".mmk")?.className).toContain("found");
    screen.destroy();
  });

  /**
   * The match starts while the halves are still moving, so the camera's descent plays
   * through the widening gap. Starting it after would cut from a bare screen to a board.
   */
  it("parts the halves and starts the match under them", async () => {
    vi.useFakeTimers();
    const { host, found } = open();
    await vi.advanceTimersByTimeAsync(5100);
    expect(found, "the match started before the opponent was shown").toEqual([]);

    await vi.advanceTimersByTimeAsync(950);
    expect(host.querySelector(".mmk")?.className, "the halves never parted").toContain("split");
    expect(found).toEqual([FOE]);

    // ...and the screen takes itself away once they are off.
    await vi.advanceTimersByTimeAsync(600);
    expect(document.querySelector(".mmk")).toBeNull();
  });

  /** A player who backs out must not have a match start behind the screen they went to. */
  it("starts nothing when the search is abandoned", async () => {
    vi.useFakeTimers();
    const { screen, found } = open();
    screen.destroy();
    await vi.advanceTimersByTimeAsync(20000);
    expect(found).toEqual([]);
    expect(document.querySelector(".mmk")).toBeNull();
  });

  it("survives a search that fails", async () => {
    vi.useFakeTimers();
    const { host, found } = open(() => Promise.reject(new Error("offline")));
    await vi.advanceTimersByTimeAsync(100);
    expect(found).toEqual([]);
    // It stays put rather than throwing the player at a board with nobody on it.
    expect(host.querySelector(".mmk")).toBeTruthy();
  });

  /**
   * The search runs on `start`, not on construction — the caller's search closure wants
   * the screen (it hands over the abort signal), so a constructor that searched at once
   * ran it while that binding was still in its temporal dead zone. The throw was
   * swallowed and the reel turned for ever. This is that bug, held down.
   */
  it("does not search until it is started", async () => {
    vi.useFakeTimers();
    const host = mount();
    let asked = 0;
    const screen = new MatchmakingScreen(host, {
      you: { name: "Milan", colony: 40, species: "fire" },
      roster: ROSTER,
      search: () => { asked++; return Promise.resolve(FOE); },
      onFound: () => {},
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(asked, "it searched from the constructor").toBe(0);
    screen.start();
    await vi.advanceTimersByTimeAsync(50);
    expect(asked).toBe(1);
    screen.destroy();
  });
});