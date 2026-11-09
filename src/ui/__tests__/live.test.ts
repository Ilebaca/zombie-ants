import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION } from "../../platform";
import { LiveService, Mailbox } from "../../platform/live";
import { buildInbox, buildUpdatePrompt } from "../live";
import { App } from "../app";
HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];
const now = Date.now();
const message = { id: "notice", title: "Team update", body: "<img src=x onerror=alert(1)>\n\nThanks for playing!", sentAt: now - 1000 };
let app: App | undefined;
afterEach(() => { app?.destroy(); app = undefined; document.body.replaceChildren(); });

describe("inbox", () => {
  it("renders received text safely and persists reading only when a message is opened", () => {
    const store = new MemoryStore();
    const mailbox = new Mailbox(store, "colony");
    const root = buildInbox({ messages: [message], mailbox, openId: null,
      busy: false, offline: false, onBack: () => {}, onSelect: () => {}, onRefresh: () => {} });
    document.body.appendChild(root);
    expect(mailbox.unread([message])).toBe(1);
    root.querySelector<HTMLButtonElement>(".mail-head")?.click();
    expect(root.querySelector(".mail-body")?.textContent).toContain("<img src=x");
    expect(root.querySelector(".mail-body img")).toBeNull();
    expect(mailbox.unread([message])).toBe(0);
  });
  it("presents update and postpone actions on an overlay", () => {
    let installed = 0, dismissed = 0;
    const root = buildUpdatePrompt({ id: "2", build: "abcdef1 · 2026-11-20",
      kind: "apk", url: "https://example.test/app.apk" }, () => { installed++; }, () => { dismissed++; });
    expect(root.classList.contains("overlay")).toBe(true);
    root.querySelector<HTMLButtonElement>(".cta")?.click();
    root.querySelector<HTMLButtonElement>(".ghostbtn")?.click();
    expect(installed).toBe(1);
    expect(dismissed).toBe(1);
  });
});

it("defers a new update during setup and presents it when the player returns home", async () => {
  const store = new MemoryStore();
  const profile = new ProfileStore(store);
  profile.update((p) => { p.tourSeen = TOUR_VERSION; p.newsSeen = now; });
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  app = new App(host, profile);
  app.start();
  host.querySelector<HTMLButtonElement>(".playbtn")?.click();
  expect(host.querySelector("#formation:not(.hidden)")).not.toBeNull();
  const service = new LiveService({ store: () => store, native: true, installedVersion: async () => 1,
    fetch: async (url) => new Response(JSON.stringify(String(url).includes("mail.json")
      ? { schema: 1, messages: [message] }
      : { package: "io.github.ilebaca.zombieants", variant: "debug", versionCode: 2,
        build: "abcdef1 · 2026-11-20", sha256: "a".repeat(64) })) });
  app.enableLiveServices(service);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(service.update).not.toBeNull();
  expect(host.querySelector("#updateAvailable")).toBeNull();
  host.querySelector<HTMLButtonElement>("#setupBack")?.click();
  await Promise.resolve();
  expect(host.querySelector("#updateAvailable")).not.toBeNull();
  host.querySelector<HTMLButtonElement>("#updateAvailable .ghostbtn")?.click();
  expect(host.querySelector("#updateAvailable")).toBeNull();
  app.goBack();
  await Promise.resolve();
  expect(host.querySelector("#updateAvailable")).toBeNull();
});

it("treats hardware Back on an update prompt as postponing it", async () => {
  const store = new MemoryStore();
  const profile = new ProfileStore(store);
  profile.update((p) => { p.tourSeen = TOUR_VERSION; p.newsSeen = now; });
  const host = document.createElement("div");
  document.body.appendChild(host);
  app = new App(host, profile);
  app.start();
  const live = new LiveService({ store: () => store, native: true, installedVersion: async () => 1,
    fetch: async (url) => new Response(JSON.stringify(String(url).includes("mail.json")
      ? { schema: 1, messages: [] }
      : { package: "io.github.ilebaca.zombieants", variant: "debug", versionCode: 2,
        build: "abcdef1 · 2026-11-20", sha256: "a".repeat(64) })) });
  app.enableLiveServices(live);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(host.querySelector("#updateAvailable")).not.toBeNull();
  expect(app.goBack()).toBe(true);
  await Promise.resolve();
  expect(host.querySelector("#updateAvailable")).toBeNull();
});
