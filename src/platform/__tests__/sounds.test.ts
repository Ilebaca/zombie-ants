/**
 * THE SEAM FOR REAL AUDIO.
 *
 * Everything the game plays is synthesised, which is right — it works offline, there is
 * nothing to download before the first tap and nothing that can go stale. But synthesis
 * has a ceiling: a recorded frame drum is a recorded frame drum. `platform/sounds.ts` is
 * the door, and what matters about it is not that a file CAN be named but that naming one
 * changes nothing else — a half-finished swap must never leave the game silent in the gaps.
 */
import { describe, expect, it } from "vitest";
import { SOUNDS, soundUrl } from "../sounds";

describe("the sound manifest", () => {
  /**
   * Empty is the SHIPPED state, not an oversight. A build with nothing named here is a
   * working game rather than a missing dependency, and a test says so because "add the
   * files" is exactly the kind of half-done change that would otherwise ship silent.
   */
  it("ships empty, and that is a complete game", () => {
    expect(Object.keys(SOUNDS.cues ?? {}), "a cue names a file that is not in the repo").toEqual([]);
    expect(Object.keys(SOUNDS.tracks ?? {}), "a bed names a file that is not in the repo").toEqual([]);
  });

  /**
   * Paths resolve against the DEPLOYED base. This game is served from a project page
   * (`/zombie-ants/`), so a manifest path written the obvious way — `audio/drum.mp3` —
   * has to end up under that prefix without the manifest knowing where it was deployed.
   */
  it("resolves a relative path against the deployed base", () => {
    const url = soundUrl("audio/drum.mp3");
    expect(url.endsWith("/audio/drum.mp3"), `got ${url}`).toBe(true);
    expect(url.includes("//audio"), "a doubled slash in the path").toBe(false);
  });

  it("leaves an absolute URL and a data URI alone", () => {
    expect(soundUrl("https://example.com/a.mp3")).toBe("https://example.com/a.mp3");
    expect(soundUrl("data:audio/wav;base64,AAAA")).toBe("data:audio/wav;base64,AAAA");
  });

  /** A leading slash is the other obvious way to write one, and must not double up. */
  it("takes a path written with a leading slash", () => {
    expect(soundUrl("/audio/drum.mp3").endsWith("/audio/drum.mp3")).toBe(true);
    expect(soundUrl("/audio/drum.mp3").includes("//audio")).toBe(false);
  });
});
