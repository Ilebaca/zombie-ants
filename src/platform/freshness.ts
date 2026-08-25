/**
 * Noticing that a newer build is out, and taking it.
 *
 * GitHub Pages serves the page's HTML with a cache lifetime of its own, and the phone
 * honours it — so a deploy can be live for ten minutes while the device still loads the
 * previous bundle from disk. From the outside that is indistinguishable from a bug that
 * was never fixed, and it has cost several rounds of "it still does the old thing".
 *
 * The build writes `version.json` beside the bundle. This reads it with the cache
 * explicitly bypassed, and if it names a build other than the one running, reloads onto a
 * fresh URL — the query string is what makes the browser fetch the HTML again rather than
 * handing back the copy it already has.
 */
import { BUILD } from "./build";

/** Remembers the version we already reloaded for, so a stuck cache cannot loop. */
const TRIED_KEY = "zombie-ants.freshness";

export interface FreshnessHooks {
  /** Injected for tests. Defaults to the real ones. */
  fetch?: typeof globalThis.fetch;
  reload?: (url: string) => void;
  session?: Pick<Storage, "getItem" | "setItem">;
  href?: string;
}

/**
 * Returns the build that is live, if it differs and a reload was started.
 *
 * Everything here is best-effort: offline, a missing file, a blocked storage — any of them
 * simply mean the check did not happen, and the app carries on with what it has.
 */
export async function takeNewerBuild(hooks: FreshnessHooks = {}): Promise<string | null> {
  const get = hooks.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!get) return null;

  try {
    const res = await get("version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const live = (await res.json() as { build?: unknown }).build;
    if (typeof live !== "string" || !live || live === BUILD) return null;

    // Reload ONCE per live version. If the HTML is being served from a cache that ignores
    // the query string too, a second attempt would only spin.
    const store = hooks.session ?? safeSession();
    if (store?.getItem(TRIED_KEY) === live) return null;
    store?.setItem(TRIED_KEY, live);

    const href = hooks.href ?? location.href;
    const url = new URL(href);
    // The commit alone: the stamp carries a date too, and a URL is not the place for it.
    url.searchParams.set("v", live.split(" ")[0] ?? live);
    (hooks.reload ?? ((to: string) => location.replace(to)))(url.toString());
    return live;
  } catch {
    return null;                       // offline, blocked, malformed — none of it matters
  }
}

function safeSession(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;                       // private browsing can throw on the accessor itself
  }
}
