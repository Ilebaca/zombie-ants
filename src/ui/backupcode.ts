/**
 * THE BACKUP CODE, IN ONE PLACE.
 *
 * It is offered from two screens now — Settings, where a player goes looking for it, and
 * the "Keep your colony" prompt, where the app goes looking for THEM — and the rules
 * around it are the fiddly kind that get out of step when they are written twice: the code
 * is generated at the moment it is shown rather than when the screen is built, copying has
 * a fallback that always works, and taking one stamps the save so the app can stop asking.
 */
import { exportProfile } from "../platform";
import type { ProfileStore } from "../platform";
import { el, toast } from "./chrome";

/**
 * A read-only field holding the code, and a Copy button under it.
 *
 * `onTaken` fires when the code is actually produced. Stamping happens on SHOWING rather
 * than on copying because copying cannot be observed: `writeText` is refused on plain http
 * and in older browsers, and the fallback is a selection the player takes with the
 * keyboard, which the page never hears about.
 */
export function codePanel(
  store: ProfileStore, root: HTMLElement, onTaken?: () => void,
): { panel: HTMLElement; fill: () => void } {
  const panel = el("div", "setpanel");

  const field = el("textarea", "setcode") as HTMLTextAreaElement;
  field.readOnly = true;
  field.setAttribute("aria-label", "Backup code");

  const copy = el("button", "setval setwide", "Copy") as HTMLButtonElement;
  copy.onclick = (): void => {
    // Selecting it is the fallback that always works: a page served over http, an older
    // browser or a denied permission all leave `writeText` unavailable, and a Copy button
    // that silently does nothing is worse than one that hands over the selection.
    field.select();
    void writeClipboard(field.value).then((ok) => {
      toast(root, ok ? "Code copied" : "Code selected — copy it", "hive");
    });
  };

  panel.append(field, copy);

  const fill = (): void => {
    // Written at the moment it is shown, never when the screen was built: a match played
    // in between would otherwise hand out a code for a colony the player no longer has.
    field.value = exportProfile(store.get());
    store.markBackedUp();
    onTaken?.();
  };

  return { panel, fill };
}

/** The field and the button, for a caller that wants to give them their own ids. */
export const codeField = (panel: HTMLElement): HTMLTextAreaElement | null =>
  panel.querySelector("textarea");
export const codeCopy = (panel: HTMLElement): HTMLButtonElement | null =>
  panel.querySelector("button");

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
    return !!navigator.clipboard;
  } catch {
    return false;
  }
}
