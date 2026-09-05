/**
 * WHEN SOMETHING THROWS.
 *
 * There was nothing here at all. An exception in a render loop, a screen builder or an
 * event handler went to the console — which nobody has on a phone — and the game simply
 * stopped: a board that no longer answers a tap, or a blank page. From the outside that is
 * indistinguishable from a frozen device, and the only way out is knowing to kill the app.
 *
 * What this adds is deliberately the smallest useful thing: SAY SO, AND OFFER THE WAY OUT.
 * It is not error reporting — nothing is sent anywhere, because there is no server and
 * because a crash panel that quietly uploads is not something to add without saying so.
 *
 * THE SAVE IS ALREADY SAFE, which is what makes a reload an honest offer rather than a
 * shrug. Every currency, every purchase and the colony are written the moment they change
 * (platform/profile.ts), and a match in progress is written after every move
 * (platform/suspend.ts) — so the reload lands back on the same board.
 *
 * IT SHOWS ONCE. One fault usually becomes many — a broken frame throws sixty times a
 * second — and a panel that redraws itself per frame is a worse fault than the one it is
 * reporting.
 */
import { BUILD } from "./build";
import { dropSplash } from "./splash";

/** The panel is plain DOM and its own styles: a crash may be the stylesheet's fault. */
const PANEL_ID = "crashpanel";

let shown = false;

/** For tests: forget that a panel has been shown. */
export function resetCrash(): void {
  shown = false;
  document.getElementById(PANEL_ID)?.remove();
}

/**
 * Catch what nothing else caught.
 *
 * Both halves are needed and they are different events: `error` is a throw that reached
 * the top, `unhandledrejection` is a promise nobody caught — and almost everything
 * asynchronous in this app is the second kind (the search worker, the storage bridge, the
 * build check).
 */
export function catchCrashes(root: Document = document): () => void {
  const onError = (e: ErrorEvent): void => report(e.error, e.message, root);
  const onReject = (e: PromiseRejectionEvent): void => report(e.reason, "", root);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onReject);
  };
}

/**
 * What the player sees.
 *
 * THE BUILD IS ON IT, for the same reason Settings carries one: on a phone a stale cached
 * page and a real bug look identical from the outside, and this is the one screen where
 * somebody might actually read the stamp out. The message is there too — not because a
 * player can act on it, but because it is what they can send to Support, which is the only
 * route a fault has to anybody who can fix it.
 */
function report(err: unknown, fallback: string, root: Document): void {
  if (shown) return;
  shown = true;
  // A BOOT THAT THREW NEVER TOOK THE COVER DOWN, and it sits at a z-index above everything
  // — so without this the panel explaining what went wrong would be behind it
  // (platform/splash.ts).
  dropSplash();

  const detail = messageOf(err) || fallback || "Unknown error";
  const box = root.createElement("div");
  box.id = PANEL_ID;
  box.setAttribute("role", "alert");
  // Written out rather than put in the stylesheet: the fault may BE the stylesheet, and a
  // crash panel that cannot be seen is not a crash panel.
  box.style.cssText = [
    "position:fixed", "inset:0", "z-index:99999",
    "display:flex", "flex-direction:column", "align-items:center", "justify-content:center",
    "gap:14px", "padding:24px", "text-align:center",
    "background:#0e1a12", "color:#e8f2e0",
    "font:15px/1.5 system-ui,-apple-system,sans-serif",
  ].join(";");

  const title = root.createElement("div");
  title.textContent = "Something went wrong";
  title.style.cssText = "font-size:19px;font-weight:900";

  const body = root.createElement("div");
  body.textContent = "Your colony is saved. Reload to carry on where you left off.";
  body.style.cssText = "max-width:320px;color:#b9cbaa";

  const again = root.createElement("button");
  again.id = "crashReload";
  again.textContent = "Reload";
  again.style.cssText = [
    "min-height:44px", "padding:0 22px", "border-radius:999px", "border:0",
    "background:#35d6c1", "color:#08110c", "font:900 15px system-ui,sans-serif",
    "cursor:pointer",
  ].join(";");
  again.onclick = () => { location.reload(); };

  const stamp = root.createElement("div");
  stamp.textContent = `${BUILD} · ${detail}`;
  stamp.style.cssText = "font-size:11px;color:#6f8168;max-width:320px;word-break:break-word";

  box.append(title, body, again, stamp);
  root.body.appendChild(box);
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}
