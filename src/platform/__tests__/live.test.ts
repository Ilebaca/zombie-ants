import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../storage";
import { BUILD } from "../build";
import { LiveService, Mailbox, apkOffer, parseMail } from "../live";
const NOW = Date.parse("2026-11-20T12:00:00Z");
const message = { id: "notice-1", title: "Colony news", body: "A message from the team.", sentAt: NOW - 1000 };
const release = {
  versionCode: 101, package: "io.github.ilebaca.zombieants", variant: "debug",
  build: "abcdef1 · 2026-11-20", sha256: "a".repeat(64),
};
const response = (data: unknown): Response => new Response(JSON.stringify(data));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("broadcast mail boundaries", () => {
  it("rejects malformed, duplicate, future and expired entries independently", () => {
    expect(parseMail({ schema: 1, messages: [message, message,
      { ...message, id: "../bad" }, { ...message, id: "future", sentAt: NOW + 1 },
      { ...message, id: "expired", expiresAt: NOW - 1 },
      { ...message, id: "long", title: "x".repeat(121) }, null] }, NOW)).toEqual([message]);
    expect(parseMail({ messages: [message] }, NOW)).toEqual([]);
  });
  it("isolates read state by colony and keeps it across new store instances", () => {
    const store = new MemoryStore();
    const one = new Mailbox(store, "one");
    one.markRead(message.id);
    expect(new Mailbox(store, "one").unread([message])).toBe(0);
    expect(new Mailbox(store, "two").unread([message])).toBe(1);
  });
});

describe("Android release ordering", () => {
  it("only offers a strictly newer valid APK for our package", () => {
    expect(apkOffer(release, 100)?.url).toBe(
      "https://ilebaca.github.io/zombie-ants/downloads/zombie-ants.apk?v=abcdef1");
    for (const versionCode of [99, 100, 100.5, "101", NaN]) {
      expect(apkOffer({ ...release, versionCode }, 100)).toBeNull();
    }
    expect(apkOffer({ ...release, package: "other.app" }, 100)).toBeNull();
    expect(apkOffer({ ...release, sha256: "bad" }, 100)).toBeNull();
    expect(apkOffer({ ...release, build: "<script>" }, 100)).toBeNull();
    expect(apkOffer({ ...release, variant: "release" }, 100)).toBeNull();
  });
});

describe("live refresh", () => {
  it("fetches updates and mail without player identity or cache reuse, then throttles duplicates", async () => {
    const store = new MemoryStore();
    const get = vi.fn<typeof fetch>(async (url) => response(String(url).includes("mail.json")
      ? { schema: 1, messages: [message] } : release));
    const live = new LiveService({ store: () => store, native: true,
      installedVersion: async () => 100, now: () => NOW, fetch: get });
    await live.check();
    expect(live.messages).toEqual([message]);
    expect(live.update?.id).toBe("101");
    for (const [url, options] of get.mock.calls) {
      expect(new URL(String(url)).search).toBe("");
      expect(options).toMatchObject({ cache: "no-store", credentials: "omit" });
    }
    await live.check();
    expect(get).toHaveBeenCalledTimes(2);
    await live.check(true);
    expect(get).toHaveBeenCalledTimes(4);
    live.dispose();
  });
  it("keeps saved mail offline without awarding or modifying colony progress", async () => {
    const store = new MemoryStore();
    const online = new LiveService({ store: () => store, native: false, now: () => NOW,
      fetch: async (url) => response(String(url).includes("mail.json")
        ? { schema: 1, messages: [message] } : { build: BUILD }) });
    await online.check();
    online.dispose();
    const offline = new LiveService({ store: () => store, native: false, now: () => NOW,
      fetch: async () => { throw new Error("offline"); } });
    await offline.check();
    expect(offline.messages).toEqual([message]);
    expect(offline.offline).toBe(true);
    expect(store.get("zombie-ants.profile")).toBeNull();
    offline.dispose();
  });
  it("clears an obsolete web offer after a rollback to the installed build", async () => {
    let build = release.build;
    const live = new LiveService({ store: () => new MemoryStore(), native: false, now: () => NOW,
      fetch: async (url) => response(String(url).includes("mail.json")
        ? { schema: 1, messages: [] } : { build }) });
    await live.check();
    expect(live.update).not.toBeNull();
    build = BUILD;
    await live.check(true);
    expect(live.update).toBeNull();
    live.dispose();
  });
  it("recovers from a hung native bridge or fetch and ignores late responses after disposal", async () => {
    vi.useFakeTimers();
    const live = new LiveService({ store: () => new MemoryStore(), native: true, now: () => NOW,
      installedVersion: () => new Promise(() => {}),
      fetch: () => new Promise(() => {}) });
    const check = live.check();
    await vi.advanceTimersByTimeAsync(5100);
    await check;
    expect(live.busy).toBe(false);
    live.dispose();
    const blocked = new LiveService({ store: () => new MemoryStore(), native: false,
      fetch: () => new Promise(() => {}) });
    const pending = blocked.check();
    blocked.dispose();
    await pending;
    expect(blocked.messages).toEqual([]);
  });
  it("retains the last valid inbox if the feed is corrupt or excessively large", async () => {
    const store = new MemoryStore();
    let bad = false;
    const live = new LiveService({ store: () => store, native: false, now: () => NOW,
      fetch: async (url) => String(url).includes("mail.json")
        ? bad ? new Response("x".repeat(262145)) : response({ schema: 1, messages: [message] })
        : response({ build: BUILD }) });
    await live.check();
    bad = true;
    await live.check(true);
    expect(live.messages).toEqual([message]);
    expect(live.offline).toBe(true);
    live.dispose();
  });
});
