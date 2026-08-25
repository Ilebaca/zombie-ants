/**
 * TAKING A NEWER BUILD.
 *
 * The device holds the page's HTML in its cache for minutes after a deploy, so a fix can
 * be live and still not be what the phone is running — which looks exactly like a fix that
 * did not work. Everything here is about that one decision: reload, or leave it alone.
 */
import { describe, expect, it } from "vitest";
import { BUILD } from "../build";
import { takeNewerBuild } from "../freshness";

/** A fetch that answers with one version.json body. */
const serving = (body: unknown, ok = true): typeof globalThis.fetch =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof globalThis.fetch;

const memory = (): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};

const run = async (body: unknown, session = memory(), ok = true): Promise<string[]> => {
  const reloads: string[] = [];
  await takeNewerBuild({
    fetch: serving(body, ok),
    reload: (url) => reloads.push(url),
    session,
    href: "https://example.test/zombie-ants/",
  });
  return reloads;
};

describe("noticing a newer build", () => {
  it("reloads onto a URL the cache has never seen", async () => {
    const reloads = await run({ build: "cafe123 · 2026-08-26" });
    expect(reloads.length).toBe(1);
    // The query is the whole point: without it the browser hands back the same HTML.
    expect(reloads[0]).toContain("?v=");
    expect(reloads[0]).toContain("cafe123");
  });

  it("does nothing when the build running is the one that is live", async () => {
    expect(await run({ build: BUILD })).toEqual([]);
  });

  /**
   * A cache that ignores the query string too would otherwise reload for ever, which is a
   * far worse failure than being one version behind.
   */
  it("tries once per version and then leaves it alone", async () => {
    const session = memory();
    expect((await run({ build: "beef456" }, session)).length).toBe(1);
    expect((await run({ build: "beef456" }, session)).length).toBe(0);
    // A DIFFERENT new version is still worth one attempt.
    expect((await run({ build: "beef789" }, session)).length).toBe(1);
  });

  it("shrugs at anything it cannot read", async () => {
    expect(await run({ build: "" })).toEqual([]);
    expect(await run({ nope: true })).toEqual([]);
    expect(await run({ build: "newer" }, memory(), false)).toEqual([]);

    const thrown: string[] = [];
    await takeNewerBuild({
      fetch: (() => { throw new Error("offline"); }) as unknown as typeof globalThis.fetch,
      reload: (url) => thrown.push(url),
      session: memory(),
      href: "https://example.test/",
    });
    expect(thrown, "an offline check must never take the page down with it").toEqual([]);
  });
});
