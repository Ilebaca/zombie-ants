/**
 * THE CHAPTER ROAD.
 *
 * The home screen and the Trophy Road are the same ladder seen two ways, so the one thing
 * that must never drift is which chapter a trophy count is in and what the next one costs.
 * The platforms themselves are canvas and cannot be asserted on here (jsdom has no
 * context, which is also proof the screen survives one it cannot draw into).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { ROAD_CHAPTER, ROAD_CHAPTERS, chapterOf, chapterStanding, MemoryStore, ProfileStore } from "../../platform";
import { App } from "../app";
import { buildChapterRoad } from "../chapters";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];
beforeEach(() => { document.body.replaceChildren(); });

describe("which chapter a trophy count is in", () => {
  it("starts at one and turns over on the boundary", () => {
    expect(chapterOf(0)).toBe(1);
    expect(chapterOf(ROAD_CHAPTER - 1)).toBe(1);
    expect(chapterOf(ROAD_CHAPTER)).toBe(2);
    expect(chapterOf(ROAD_CHAPTER * 2)).toBe(3);
  });

  it("matches the sketch's example exactly", () => {
    // 7,300 trophies: chapter 15, and chapter 16 opens at 7,500.
    const at = chapterStanding(7300);
    expect(at.current.index).toBe(15);
    expect(at.next?.from).toBe(7500);
    expect(at.previous?.index).toBe(14);
    expect(at.toGo).toBe(200);
    expect(at.into).toBe(300);
  });

  it("has nothing behind it at the start and nothing ahead at the end", () => {
    expect(chapterStanding(0).previous).toBeNull();
    expect(chapterStanding(0).next?.index).toBe(2);

    const end = chapterStanding(ROAD_CHAPTERS * ROAD_CHAPTER + 999);
    expect(end.current.index).toBe(ROAD_CHAPTERS);
    expect(end.next, "the road cannot promise a chapter it does not have").toBeNull();
    expect(end.toGo).toBe(0);
  });

  it("never reports a negative or a fractional chapter", () => {
    expect(chapterOf(-500)).toBe(1);
    expect(chapterStanding(-10).into).toBe(0);
  });
});

describe("the chapter road screen", () => {
  const road = (trophies: number): { root: HTMLElement; played: number[] } => {
    const played: number[] = [];
    const root = buildChapterRoad({ trophies, onPlay: () => played.push(1), onRoad: () => {} });
    document.body.appendChild(root);
    return { root, played };
  };

  it("names the chapter and what the next one costs", () => {
    const { root } = road(7300);
    expect(root.querySelector(".chapname b")?.textContent).toBe("Chapter 15");
    expect(root.querySelector(".chaplock")?.textContent).toContain("7,500");
    expect(root.querySelector(".chapprog small")?.textContent).toContain("Chapter 16");
  });

  it("plays", () => {
    const { root, played } = road(0);
    root.querySelector<HTMLButtonElement>("#goPlay")?.click();
    expect(played.length).toBe(1);
  });

  it("says so rather than promising a chapter that does not exist", () => {
    const { root } = road(ROAD_CHAPTERS * ROAD_CHAPTER);
    const lock = root.querySelector<HTMLButtonElement>(".chaplock");
    expect(lock?.textContent).toContain("Road complete");
    expect(lock?.disabled, "a chip that leads nowhere must not be pressable").toBe(true);
  });
});

describe("the home screen", () => {
  const mount = (): HTMLElement => {
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    return host;
  };

  it("opens on the chapter road", () => {
    const host = mount();
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tourSeen = 99; p.trophies = 1200; });
    new App(host, profile).start();

    expect(host.querySelector(".chaproad"), "no chapter road on the home screen").not.toBeNull();
    expect(host.querySelector(".chapname b")?.textContent).toBe("Chapter 3");
  });

  /** The screen it replaced is kept whole, so a build can be judged against it. */
  it("goes back to the title screen when the setting says so", () => {
    const host = mount();
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tourSeen = 99; p.homeStyle = "classic"; });
    new App(host, profile).start();

    expect(host.querySelector(".chaproad")).toBeNull();
    expect(host.querySelector(".homemark")?.textContent).toContain("ZOMBIE");
    expect(host.querySelector("#goPlay"), "either home has to offer a match").not.toBeNull();
  });
});
