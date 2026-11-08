import { afterEach, describe, expect, it, vi } from "vitest";
import { displayReport, recordDisplay, watchDisplay } from "../display-report";

interface Report {
  build: string;
  events: { event: string; window: number[]; navigation: number[] | null }[];
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("on-device display diagnostics", () => {
  it("observes actual resize events after handlers settle and stops on disposal", async () => {
    const stop = watchDisplay();
    window.dispatchEvent(new Event("resize"));
    await Promise.resolve();
    let report = JSON.parse(displayReport()) as Report;
    expect(report.events.some((event) => event.event === "resize")).toBe(true);
    stop();
    const count = report.events.length;
    window.dispatchEvent(new Event("resize"));
    await Promise.resolve();
    report = JSON.parse(displayReport()) as Report;
    expect(report.events).toHaveLength(count + 1); // Only the explicit report snapshot.
  });


  it("records a shrinking host window and a navigation bar outside it without changing layout", () => {
    document.body.innerHTML = '<main id="app"><nav id="mainNav"></nav></main>';
    const nav = document.getElementById("mainNav");
    if (!nav) throw new Error("Missing test navigation");
    nav.style.top = "720px";
    vi.spyOn(nav, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 720, width: 390, height: 80,
    } as DOMRect);
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 800);
    recordDisplay("launch");
    vi.stubGlobal("innerHeight", 740);
    recordDisplay("resize");
    const report = JSON.parse(displayReport()) as Report;
    const resize = report.events.find((event) => event.event === "resize");
    expect(resize?.window.slice(0, 2)).toEqual([390, 740]);
    expect(resize?.navigation).toEqual([0, 720, 390, 80]);
    expect(nav.style.top).toBe("720px");
  });

  it("keeps the launch state and recent events in a bounded report without save data", () => {
    document.body.textContent = "Private player name";
    localStorage.setItem("private-test-save", "Secret colony code");
    recordDisplay("launch");
    for (let i = 0; i < 100; i++) recordDisplay("resize");
    const text = displayReport();
    const report = JSON.parse(text) as Report;
    expect(report.events).toHaveLength(24);
    expect(report.events[0]?.event).toBe("launch");
    expect(report.events[report.events.length - 1]?.event).toBe("report");
    expect(text).not.toContain("Private player name");
    expect(text).not.toContain("Secret colony code");
    localStorage.removeItem("private-test-save");
  });
});
