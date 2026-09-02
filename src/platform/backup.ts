/**
 * TAKING YOUR COLONY WITH YOU.
 *
 * Everything a player has is in `localStorage` on one device: the colony, the currencies,
 * every chamber and every research level, a career going back to their first match. A new
 * phone, a cleared browser, a switch from the web build to the installed one — any of
 * those and it is gone, with nothing they could have done about it.
 *
 * There is no account to hang it on and will not be until there is a server, so this is
 * the honest thing that can be done meanwhile: the save, written out as one string the
 * player can keep, and read back on the other side.
 *
 * Three rules, and each of them is about not lying to somebody about their own save:
 *
 *  - a code is TAGGED and VERSIONED, so a string that is not one of ours is refused as a
 *    wrong code rather than silently producing an empty colony;
 *  - a code carries a CHECKSUM, because the way this actually gets moved is a person
 *    copying it out of a message, and half a code that loads is worse than one that does
 *    not;
 *  - and importing goes through `normalise` like every other read, so a code that has been
 *    edited cannot put a NaN chamber level into somebody's combat maths.
 */
import type { Profile } from "./profile";
import { normalise } from "./profile";

/** What every code starts with, so one can be recognised on sight. */
export const BACKUP_TAG = "ZA1";

/** Bumped if the shape ever changes in a way an older reader would misread. */
export const BACKUP_VERSION = 1;

export type ImportFailure = "not-a-code" | "damaged" | "unreadable";

export type ImportResult =
  | { ok: true; profile: Profile }
  | { ok: false; why: ImportFailure };

/**
 * The save, as one string.
 *
 * Base64 rather than raw JSON for one plain reason: a player is going to paste this into a
 * message or a note, and JSON is full of quotes and braces that chat apps helpfully
 * "correct". The tag and the checksum ride outside it so a truncated code can be told from
 * a foreign one.
 */
export function exportProfile(profile: Readonly<Profile>): string {
  const body = encode(JSON.stringify(profile));
  return `${BACKUP_TAG}.${BACKUP_VERSION}.${checksum(body)}.${body}`;
}

/**
 * Read a code back.
 *
 * Never throws and never half-applies: it either hands back a whole normalised profile or
 * says why it could not. The caller decides what to do with it, because overwriting a save
 * is the most destructive thing in this app and is not this function's decision to make.
 */
export function importProfile(code: string): ImportResult {
  const trimmed = code.trim().replace(/\s+/g, "");
  const parts = trimmed.split(".");
  if (parts.length !== 4 || parts[0] !== BACKUP_TAG) return { ok: false, why: "not-a-code" };
  const [, version, sum, body] = parts;
  if (Number(version) > BACKUP_VERSION) return { ok: false, why: "not-a-code" };
  if (!body || checksum(body) !== sum) return { ok: false, why: "damaged" };
  try {
    const raw: unknown = JSON.parse(decode(body));
    // Through `normalise` like every other read: a code somebody has edited is a hostile
    // save, and the trust boundary is the same one (profile.ts).
    return { ok: true, profile: normalise(raw) };
  } catch {
    return { ok: false, why: "unreadable" };
  }
}

/**
 * A short checksum over the body.
 *
 * Not security — anybody can recompute it — and it is not trying to be. It is here to
 * catch the thing that really happens: a code copied without its last few characters.
 */
export function checksum(body: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0").slice(0, 7);
}

/**
 * UTF-8 safe base64, both ways.
 *
 * `btoa` alone throws on anything outside Latin-1, and a colony can be named in any
 * alphabet — so the text goes through UTF-8 first. Node has no `btoa` in every version
 * either, hence the Buffer fallback; the tests run there.
 */
function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (typeof btoa === "function") {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/=+$/, "");
  }
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "");
}

function decode(body: string): string {
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}
