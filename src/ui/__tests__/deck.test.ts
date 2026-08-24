/**
 * THE DECK'S GESTURE.
 *
 * The five main screens are one strip the player drags, which means the deck has to decide
 * — once, early, and correctly — whether a gesture belongs to it or to the list under the
 * finger. That decision is what these tests are about; the transform is only how it shows.
 *
 * jsdom lays nothing out, so `clientWidth` is 0 and the deck falls back to the window's
 * width (1024 here). Distances below are in those pixels.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { Deck } from "../deck";

const IDS = ["a", "b", "c"] as const;
type Id = (typeof IDS)[number];

const make = (): { deck: Deck<Id>; arrived: Id[] } => {
  const arrived: Id[] = [];
  const deck = new Deck<Id>(IDS, (id) => {
    const el = document.createElement("div");
    el.className = "screen";
    el.textContent = id;
    return el;
  }, (id) => arrived.push(id));
  document.body.appendChild(deck.el);
  return { deck, arrived };
};

/** One drag, in the pixels jsdom pretends the window is. */
const drag = (deck: Deck<Id>, dx: number, dy = 0, ms = 400): void => {
  const at = (t: string, x: number, y: number, time: number): void => {
    const e = new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(e, "pointerId", { value: 1 });
    Object.defineProperty(e, "timeStamp", { value: time });
    deck.el.dispatchEvent(e);
  };
  at("pointerdown", 500, 400, 0);
  for (let i = 1; i <= 5; i++) at("pointermove", 500 + (dx * i) / 5, 400 + (dy * i) / 5, (ms * i) / 5);
  at("pointerup", 500 + dx, 400 + dy, ms);
};

beforeEach(() => { document.body.replaceChildren(); });

describe("dragging the deck", () => {
  it("moves one screen per swipe, and only one", () => {
    const { deck, arrived } = make();
    expect(deck.at).toBe("a");

    drag(deck, -600);
    expect(deck.at).toBe("b");
    drag(deck, -600);
    expect(deck.at).toBe("c");
    expect(arrived).toEqual(["b", "c"]);
  });

  it("snaps back when the drag is too short to commit", () => {
    const { deck, arrived } = make();
    drag(deck, -80, 0, 900);          // slow and short: neither far enough nor a flick
    expect(deck.at).toBe("a");
    expect(arrived).toEqual([]);
  });

  it("takes a short flick as a swipe", () => {
    const { deck } = make();
    drag(deck, -120, 0, 90);
    expect(deck.at).toBe("b");
  });

  /**
   * The whole reason the deck owns its gesture: a screen with a scrolling list in it must
   * still scroll. A drag that is mostly vertical is never the deck's.
   */
  it("leaves a vertical drag alone", () => {
    const { deck, arrived } = make();
    // Far enough sideways to commit if the deck misjudged the axis — and much further
    // down, which is what a thumb running along a list actually looks like.
    drag(deck, -300, -700);
    expect(deck.at).toBe("a");
    expect(arrived).toEqual([]);
  });

  it("stops at both ends", () => {
    const { deck } = make();
    drag(deck, 600);                  // back past the first screen
    expect(deck.at).toBe("a");
    deck.goTo("c", false);
    drag(deck, -600);                 // on past the last
    expect(deck.at).toBe("c");
  });

  it("rebuilds the screen it arrives on", () => {
    let built = 0;
    const deck = new Deck<Id>(IDS, (id) => {
      built++;
      const el = document.createElement("div");
      el.textContent = id;
      return el;
    }, () => {});
    document.body.appendChild(deck.el);
    const afterConstruction = built;
    expect(afterConstruction).toBe(IDS.length);

    drag(deck, -600);
    expect(built, "the arriving screen was left as it was built").toBe(afterConstruction + 1);
  });
});
