import { BUILD } from "./build";
import { isNative } from "./native";
import { readJson, writeJson } from "./storage";
import type { KeyValueStore } from "./storage";

export const LIVE_SITE = "https://ilebaca.github.io/zombie-ants/";
// Public broadcasts change independently of the bundled game and release metadata.
const MAIL_SOURCE = "https://raw.githubusercontent.com/Ilebaca/zombie-ants/main/public/live/";
const MAIL_CACHE = "zombie-ants.broadcast-mail";
const MAX_RESPONSE = 262144;
const BUILD_PATTERN = /^[a-f0-9]{7,40} · \d{4}-\d{2}-\d{2}$/;
export interface MailMessage {
  id: string;
  title: string;
  body: string;
  sentAt: number;
  expiresAt?: number;
}
export interface UpdateOffer {
  id: string;
  build: string;
  url: string;
  kind: "apk" | "web";
}
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const date = (value: unknown): number =>
  typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit;

export function parseMail(value: unknown, now = Date.now()): MailMessage[] {
  const root = object(value);
  if (root?.schema !== 1 || !Array.isArray(root.messages)) return [];
  const found = new Map<string, MailMessage>();
  for (const raw of root.messages.slice(0, 100)) {
    const item = object(raw);
    if (!item || !text(item.id, 80) || !/^[a-z0-9][a-z0-9._-]*$/.test(item.id)
      || found.has(item.id) || !text(item.title, 120) || !text(item.body, 12000)) continue;
    const sentAt = date(item.sentAt);
    const expiresAt = item.expiresAt === undefined ? undefined : date(item.expiresAt);
    if (!Number.isFinite(sentAt) || sentAt <= 0 || sentAt > now
      || (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt <= sentAt))) continue;
    found.set(item.id, { id: item.id, title: item.title, body: item.body, sentAt,
      ...(expiresAt === undefined ? {} : { expiresAt }) });
  }
  return [...found.values()].sort((a, b) => b.sentAt - a.sentAt);
}

export function apkOffer(value: unknown, installed: number): UpdateOffer | null {
  const item = object(value);
  if (!Number.isSafeInteger(installed) || installed <= 0 || !item
    || item.package !== "io.github.ilebaca.zombieants" || item.variant !== "debug"
    || typeof item.versionCode !== "number" || !Number.isSafeInteger(item.versionCode) || item.versionCode <= installed
    || !text(item.build, 80) || !BUILD_PATTERN.test(item.build)
    || !text(item.sha256, 64) || !/^[a-f0-9]{64}$/.test(item.sha256)) return null;
  // Derive the destination ourselves; a feed cannot redirect players to another APK host.
  const url = new URL("downloads/zombie-ants.apk", LIVE_SITE);
  url.searchParams.set("v", item.build.slice(0, item.build.indexOf(" ")));
  return { id: String(item.versionCode), build: item.build, kind: "apk", url: url.href };
}

export class Mailbox {
  private readonly key: string;
  constructor(private store: KeyValueStore, profileKey: string) { this.key = profileKey + ".mail-read"; }
  private readIds(): string[] {
    const ids = readJson<unknown>(this.store, this.key);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(-256) : [];
  }
  hasRead(id: string): boolean { return this.readIds().includes(id); }
  markRead(id: string): void {
    writeJson(this.store, this.key, [...new Set([...this.readIds(), id])].slice(-256));
  }
  unread(messages: readonly MailMessage[]): number {
    const ids = new Set(this.readIds());
    return messages.filter((message) => !ids.has(message.id)).length;
  }
}

export interface LiveHooks {
  store: () => KeyValueStore;
  native?: boolean;
  fetch?: typeof globalThis.fetch;
  installedVersion?: () => Promise<number | null>;
  now?: () => number;
}
export class LiveService {
  messages: MailMessage[] = [];
  update: UpdateOffer | null = null;
  busy = false;
  offline = false;
  private listeners = new Set<() => void>();
  private lastCheck = -Infinity;
  private disposed = false;
  private controller: AbortController | null = null;
  private native: boolean;
  private now: () => number;
  constructor(private hooks: LiveHooks) {
    this.native = hooks.native ?? isNative();
    this.now = hooks.now ?? Date.now;
    this.messages = parseMail(readJson(hooks.store(), MAIL_CACHE), this.now());
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private changed(): void {
    if (this.disposed) return;
    for (const listener of this.listeners) {
      try { listener(); } catch { /* Live UI must not interrupt the game. */ }
    }
  }
  private async installed(): Promise<number | null> {
    if (this.hooks.installedVersion) return this.hooks.installedVersion();
    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      const number = Number(info.build);
      return Number.isSafeInteger(number) && number > 0 ? number : null;
    } catch { return null; }
  }
  async check(force = false): Promise<void> {
    if (this.disposed || this.busy || (!force && this.now() - this.lastCheck < 60000)) return;
    const get = this.hooks.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!get) return;
    this.messages = this.messages.filter((message) => message.expiresAt === undefined || message.expiresAt > this.now());
    this.busy = true;
    this.lastCheck = this.now();
    this.controller = new AbortController();
    const controller = this.controller;
    const signal = controller.signal;
    const active = (): boolean => !this.disposed && !signal.aborted;
    let cancel: () => void = () => {};
    const cancelled = new Promise<void>((resolve) => { cancel = resolve; });
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), 5000);
    this.changed();
    const read = async (path: string, base = LIVE_SITE): Promise<unknown> => {
      const res = await get(new URL(path, base).href, {
        cache: "no-store", credentials: "omit", signal,
      });
      if (!res.ok) throw new Error("Live content unavailable");
      if (Number(res.headers.get("content-length")) > MAX_RESPONSE) throw new Error("Live content too large");
      const body = await res.text();
      if (body.length > MAX_RESPONSE) throw new Error("Live content too large");
      return JSON.parse(body) as unknown;
    };
    let mailLoaded = false;
    try {
      await Promise.race([cancelled, Promise.allSettled([
        (async () => {
          try {
            const raw = await read("mail.json", MAIL_SOURCE);
            const data = object(raw);
            if (data?.schema !== 1 || !Array.isArray(data.messages)) throw new Error("Invalid mail feed");
            if (!active()) return;
            this.messages = parseMail(raw, this.now());
            writeJson(this.hooks.store(), MAIL_CACHE, { schema: 1, messages: this.messages });
            this.offline = false;
            mailLoaded = true;
          } catch { if (active()) this.offline = true; }
        })(),
        (async () => {
          try {
            if (this.native) {
              const installed = await this.installed();
              if (installed === null) return;
              const raw = await read("downloads/zombie-ants.json");
              if (active()) this.update = apkOffer(raw, installed);
            } else {
              const raw = object(await read("version.json"));
              const build = raw?.build;
              if (active() && build === BUILD) this.update = null;
              else if (active() && text(build, 80) && BUILD_PATTERN.test(build)) {
                const url = new URL(LIVE_SITE);
                url.searchParams.set("v", build.slice(0, build.indexOf(" ")));
                this.update = { id: build, build, url: url.href, kind: "web" };
              }
            }
          } catch { /* An unavailable update service never blocks play or removes an existing offer. */ }
        })(),
      ])]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (signal.aborted && !this.disposed && !mailLoaded) this.offline = true;
      this.controller = null;
      this.busy = false;
      this.changed();
    }
  }
  dispose(): void {
    this.disposed = true;
    this.controller?.abort();
    this.listeners.clear();
  }
}

/** Native resume plus DOM visibility; duplicate events are throttled by LiveService. */
export function watchLiveResume(check: () => void): () => void {
  const visible = (): void => { if (!document.hidden) check(); };
  document.addEventListener("visibilitychange", visible);
  let active = true;
  let remove: (() => Promise<void>) | undefined;
  if (isNative()) void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appStateChange", ({ isActive }) => { if (active && isActive) check(); });
      if (active) remove = () => handle.remove();
      else await handle.remove();
    } catch { /* DOM visibility remains available. */ }
  })();
  return () => {
    active = false;
    document.removeEventListener("visibilitychange", visible);
    void remove?.().catch(() => {});
  };
}
