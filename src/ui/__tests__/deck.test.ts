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

/** One drag, in the pixels jsdom pretends the window is. `from` is what it starts on. */
const drag = (deck: Deck<Id>, dx: number, dy = 0, ms = 400, from?: Element): void => {
  const on = from ?? deck.el;
  const at = (t: string, x: number, y: number, time: number): void => {
    const e = new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(e, "pointerId", { value: 1 });
    Object.defineProperty(e, "timeStamp", { value: time });
    on.dispatchEvent(e);
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

  /**
   * THE TIE GOES TO THE LIST.
   *
   * A thumb pivots as it flicks, so a gesture meant to scroll regularly starts off more
   * across than down — and comparing the two magnitudes on that first sample handed it to
   * the deck, whose `preventDefault` then killed the scroll for the rest of the touch. A
   * screen taller than the viewport simply would not move.
   *
   * `preventDefault` is the observable: it is the thing that stops the page scrolling, so
   * it is what a vertical gesture must never see.
   */
  describe("a gesture that starts across and then runs down", () => {
    /** Touch, not pointer: `preventDefault` on touchmove is what blocks a scroll. */
    const swipe = (deck: Deck<Id>, path: readonly (readonly [number, number])[]): boolean[] => {
      const down = new MouseEvent("pointerdown", { clientX: 500, clientY: 400, bubbles: true });
      Object.defineProperty(down, "pointerId", { value: 1 });
      deck.el.dispatchEvent(down);
      return path.map(([x, y]) => {
        const e = new Event("touchmove", { bubbles: true, cancelable: true });
        Object.defineProperty(e, "touches", { value: [{ clientX: 500 + x, clientY: 400 + y }] });
        deck.el.dispatchEvent(e);
        return e.defaultPrevented;
      });
    };

    it("lets the screen under it scroll", () => {
      const { deck } = make();
      // Fourteen across before eight down — a pivoting thumb — and then straight down.
      const blocked = swipe(deck, [[14, 8], [16, 60], [18, 200], [18, 420]]);
      expect(blocked.some(Boolean), "the deck blocked a scroll").toBe(false);
      expect(deck.at).toBe("a");
    });

    it("still takes a gesture that really is sideways", () => {
      const { deck } = make();
      const blocked = swipe(deck, [[-20, 4], [-120, 6], [-320, 8]]);
      expect(blocked.some(Boolean), "the deck let a swipe through to the page").toBe(true);
    });
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

/**
 * A TAP THE DECK STOLE.
 *
 * A finger wobbles. Ten pixels of sideways drift is enough for the deck to claim the
 * gesture — and claiming it kills the tap: `preventDefault` on the touchmove stops the
 * browser synthesising the click, and the pointer capture retargets the rest of the
 * sequence. The rail nudges, snaps back, and the button never hears about it. From the
 * outside that is a dead button, on every one of the five screens: "I hit Play and
 * nothing happens".
 */
describe("where the slides sit", () => {
  /**
   * ONE WHOLE-PIXEL STEP FOR BOTH THE WIDTH AND THE TRAVEL.
   *
   * They were percentages while the rail moved by `clientWidth`, a whole number — so on a
   * viewport that is not a whole number of pixels wide the two disagreed by a fraction and
   * the screen next door showed as a sliver down the edge. Sizing the slides in the same
   * fraction moved the sliver to the OTHER side rather than removing it: a flex item is
   * laid out at a rounded position, so the slides drift left of an exact fractional
   * multiple while a transform does not. Neither may carry a fraction, and the step rounds
   * UP so the slide on show is never narrower than the viewport.
   */
  it("gives the slides a whole-pixel width the rail travels by exactly", () => {
    const viewport = 390.5;
    const real = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      return this.classList.contains("deck")
        ? ({ width: viewport, height: 800, left: 0, top: 0 } as DOMRect)
        : real.call(this);
    };
    try {
      const { deck } = make();
      const rail = deck.el.querySelector(".deckrail") as HTMLElement;
      deck.goTo("b", false);
      const step = Math.abs(Number(
        /translate3d\((-?[\d.]+)px/.exec(rail.style.transform)?.[1] ?? NaN));

      expect(Number.isInteger(step), `the rail travelled a fraction: ${step}`).toBe(true);
      expect(step, "a slide is narrower than the screen it has to cover")
        .toBeGreaterThanOrEqual(viewport);
      for (const slide of Array.from(deck.el.querySelectorAll<HTMLElement>(".slide"))) {
        expect(slide.style.width, "a slide was still sized as a percentage").toMatch(/px$/);
        expect(parseFloat(slide.style.width), "a slide is not the width the rail moves by")
          .toBe(step);
      }
      expect(parseFloat(rail.style.width)).toBe(step * IDS.length);
    } finally {
      Element.prototype.getBoundingClientRect = real;
    }
  });
});

describe("a tap the deck stole", () => {
  /** A button on the screen that is showing, and how many times it was pressed. */
  const button = (): { deck: Deck<Id>; el: HTMLButtonElement; hits: () => number } => {
    let hits = 0;
    const el = document.createElement("button");
    el.onclick = () => { hits++; };
    const deck = new Deck<Id>(IDS, (id) => {
      const screen = document.createElement("div");
      if (id === "a") screen.appendChild(el);
      return screen;
    }, () => {});
    document.body.appendChild(deck.el);
    return { deck, el, hits: () => hits };
  };

  /**
   * Far enough across for the deck to have TAKEN the gesture, nowhere near far enough to
   * turn the page. A smaller wobble than this the deck never claims at all, and the
   * browser fires that click by itself — there is nothing to give back.
   */
  it("gives the press back when the drag went nowhere", () => {
    const { deck, el, hits } = button();
    drag(deck, 30, 3, 260, el);
    expect(hits(), "the button never heard about the tap").toBe(1);
    expect(deck.at, "a wobble turned the page").toBe("a");
  });

  it("does not press anything when the drag turned the page", () => {
    const { deck, el, hits } = button();
    drag(deck, -600, 0, 400, el);
    expect(deck.at).toBe("b");
    expect(hits(), "a real swipe pressed what it started on").toBe(0);
  });

  /** A short deliberate swipe is a swipe, not a press on whatever it began over. */
  it("does not press anything when the finger was going somewhere", () => {
    const { deck, el, hits } = button();
    drag(deck, -90, 0, 900, el);          // too far to be a wobble, too slow to commit
    expect(deck.at).toBe("a");
    expect(hits()).toBe(0);
  });

  /**
   * A confident press is a FAST one, and it wobbles as far as a slow one. Guarding on
   * speed rather than distance ate exactly those — the decisive taps.
   */
  it("gives back a fast press as readily as a slow one", () => {
    const { deck, el, hits } = button();
    drag(deck, -30, 0, 20, el);
    expect(hits()).toBe(1);
    expect(deck.at).toBe("a");
  });

  /** Vertical scrolling was never the deck's, so there is nothing to give back. */
  it("stays out of the way of a drag it never claimed", () => {
    const { deck, el, hits } = button();
    drag(deck, -4, -300, 400, el);
    expect(hits(), "the deck pressed a button during a scroll").toBe(0);
  });
});
