/**
 * THE GUIDED TOUR.
 *
 * The overlay is geometry, and jsdom measures everything as zero — so every test that
 * cares about the hole stubs the rectangle it is measuring. What is worth testing here is
 * not the pixels but the gating: a step ends only the way it says it does, a tap outside
 * the lit thing is not the tap being asked for, and Skip is on every step.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { Tour } from "../tour";
import type { TourStep } from "../tour";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

const host = (): HTMLElement => {
  const h = document.createElement("div");
  document.body.appendChild(h);
  return h;
};

/** Give one element a real rectangle; everything else keeps jsdom's zeros. */
const measure = (target: Element, box: { x: number; y: number; w: number; h: number }): void => {
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this !== target) return real.call(this);
    return {
      left: box.x, top: box.y, width: box.w, height: box.h,
      right: box.x + box.w, bottom: box.y + box.h, x: box.x, y: box.y,
      toJSON: () => ({}),
    } as DOMRect;
  });
};

const text = (h: HTMLElement): string => h.querySelector(".tourtxt")?.textContent ?? "";
const tap = (x: number, y: number): void => {
  window.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
};

describe("the guided tour", () => {
  it("shows one step at a time and finishes on the last", () => {
    const h = host();
    const tour = new Tour(h);
    let done = false;
    const steps: TourStep[] = [
      { id: "a", text: "first" },
      { id: "b", text: "second" },
    ];
    tour.start(steps, { onDone: () => { done = true; } });

    expect(text(h)).toBe("first");
    h.querySelector<HTMLButtonElement>("#tourNext")?.click();
    expect(text(h)).toBe("second");
    expect(done).toBe(false);

    h.querySelector<HTMLButtonElement>("#tourNext")?.click();
    expect(done).toBe(true);
    expect(h.querySelector(".tourwrap"), "the overlay outlived the tour").toBeNull();
  });

  it("carries a skip on every step, and skipping ends it", () => {
    const h = host();
    const tour = new Tour(h);
    let skipped = false, done = false;
    tour.start(
      [{ id: "a", text: "one" }, { id: "b", text: "two", advance: "tap" }],
      { onSkip: () => { skipped = true; }, onDone: () => { done = true; } },
    );

    expect(h.querySelector("#tourSkip")).not.toBeNull();
    h.querySelector<HTMLButtonElement>("#tourNext")?.click();
    // A tap step has no Next button — but it still has the way out.
    expect(h.querySelector("#tourNext")).toBeNull();
    const skip = h.querySelector<HTMLButtonElement>("#tourSkip");
    expect(skip).not.toBeNull();

    skip?.click();
    expect(skipped).toBe(true);
    expect(done, "skipping counted as finishing").toBe(false);
    expect(tour.running).toBe(false);
  });

  it("waits for the deed a signal step names, and ignores any other", () => {
    const h = host();
    const tour = new Tour(h);
    tour.start([
      { id: "select", text: "tap your nest", advance: "signal" },
      { id: "after", text: "done" },
    ]);

    tour.signal("move");                       // not this step
    expect(text(h)).toBe("tap your nest");
    tour.signal("select");
    expect(text(h)).toBe("done");
  });

  it("advances on a tap in the lit hole, and on nothing else", async () => {
    vi.useFakeTimers();
    const h = host();
    const button = document.createElement("button");
    document.body.appendChild(button);
    measure(button, { x: 100, y: 100, w: 60, h: 24 });

    const tour = new Tour(h);
    tour.start([
      { id: "press", text: "press it", find: () => button, advance: "tap" },
      { id: "next", text: "pressed" },
    ]);
    // The spotlight is placed on a timer, so nothing is tappable until it has measured.
    await vi.advanceTimersByTimeAsync(120);

    tap(400, 400);                             // out in the dark
    await vi.advanceTimersByTimeAsync(10);
    expect(text(h), "a tap on the shade counted").toBe("press it");

    tap(130, 110);                             // on the lit button
    await vi.advanceTimersByTimeAsync(10);
    expect(text(h)).toBe("pressed");
    tour.stop();
  });

  /**
   * A tap the dark swallowed used to do nothing at all, which is indistinguishable from a
   * broken button — and that is exactly how it was reported.
   */
  it("points at what it is waiting for when a tap lands in the dark", async () => {
    vi.useFakeTimers();
    const h = host();
    const button = document.createElement("button");
    document.body.appendChild(button);
    measure(button, { x: 100, y: 100, w: 60, h: 24 });

    const tour = new Tour(h);
    tour.start([{ id: "press", text: "press it", find: () => button, advance: "tap" }]);
    await vi.advanceTimersByTimeAsync(120);
    expect(h.querySelector(".tourbubble.tournudge")).toBeNull();

    tap(300, 500);                              // out in the dark
    await vi.advanceTimersByTimeAsync(10);
    expect(h.querySelector(".tourbubble.tournudge"), "the blocked tap said nothing").not.toBeNull();
    expect(h.querySelector(".tourring.tournudge")).not.toBeNull();
    tour.stop();
  });

  it("goes dark and waits when a step's target has not been built yet", async () => {
    vi.useFakeTimers();
    const h = host();
    const tour = new Tour(h);
    tour.start([{ id: "late", text: "waiting", find: () => document.querySelector("#later") }]);
    await vi.advanceTimersByTimeAsync(120);

    // One panel covers the viewport; the other three are collapsed to nothing.
    const shades = Array.from(h.querySelectorAll<HTMLElement>(".tourshade"));
    const covering = shades.filter((s) => s.style.width !== "0px" && s.style.height !== "0px");
    expect(covering.length).toBe(1);
    expect(covering[0]?.style.height).toBe(window.innerHeight + "px");
    tour.stop();
  });
});
