import { afterEach, describe, expect, it, vi } from "vitest";
import { redraw } from "../chrome";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("preserving the reader's position during a page redraw", () => {
  it("restores the page itself when its header and content share one scroller", async () => {
    const page = document.createElement("div");
    page.appendChild(document.createElement("section"));
    document.body.appendChild(page);
    page.scrollTop = 240;
    redraw(page);
    // Removing content can clamp the browser's scroll offset while a view rebuilds.
    page.scrollTop = 0;
    page.appendChild(document.createElement("section"));
    await Promise.resolve();
    expect(page.scrollTop).toBe(240);
  });

  it("retains support for custom views with an inner scroller", async () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const page = document.createElement("div"), oldBody = document.createElement("div");
    oldBody.id = "scrollBody";
    page.appendChild(oldBody);
    document.body.appendChild(page);
    oldBody.scrollTop = 175;
    redraw(page);
    const newBody = document.createElement("div");
    newBody.id = "scrollBody";
    page.appendChild(newBody);
    await Promise.resolve();
    expect(newBody.scrollTop).toBe(175);
    expect(page.scrollTop).toBe(0);
  });
});
