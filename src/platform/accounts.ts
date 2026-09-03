/**
 * ACCOUNTS — a colony you can sign back into.
 *
 * Everything a player has lived in ONE save under one key, so a device held exactly one
 * colony and there was no such thing as signing in: the game simply opened whatever was
 * there. That is fine until somebody wants a second colony, hands the phone to a friend,
 * or clears a browser and wants to know which of those two things just happened.
 *
 * THERE IS NO SERVER, and this does not pretend there is one. An account here is a save
 * SLOT on this device with a name and a code on it. What that buys is real — several
 * colonies on one phone, and a sign-out that does not destroy anything — and what it does
 * not buy is carrying a colony to another device. `platform/backup.ts` is still the honest
 * answer to THAT, and the two are deliberately different features: an account gets you back
 * into your save, a backup code moves it. A real account replaces both, and this is the
 * seam it arrives through — `AccountService` is an interface, `LocalAccounts` is the
 * offline one, and a server-backed one is a new class and one line in `App`. The same shape
 * `Matchmaker`, `PurchaseGateway` and `SupportGateway` already use.
 *
 * THE CODE IS THE CREDENTIAL, and it is the one the game already mints: `profile.playerId`,
 * `ZA-XXXX-XXXX`, drawn from an alphabet with the ambiguous characters left out because the
 * whole point of that string is that somebody reads it off a screen and types it. There is
 * NO PASSWORD. A password on a local save protects the colony from nobody — there is no
 * network to intercept and no other user to keep out of `localStorage` — and it is a way to
 * lose a colony rather than a way to keep one.
 */
import { defaultStore, readJson, writeJson, type KeyValueStore } from "./storage";
import { PROFILE_KEY, ProfileStore } from "./profile";

/** Where the roster lives. The saves themselves sit under `PROFILE_KEY:<id>`. */
const ROSTER_KEY = "zombie-ants.accounts";
/** Which account is signed in. Separate from the roster so a sign-out is one small write. */
const CURRENT_KEY = "zombie-ants.account";
/**
 * The highest account number ever issued. It only ever goes up.
 *
 * Kept OUTSIDE the roster on purpose: derived from the roster it would fall back every time
 * an account was forgotten, and the next colony created would be handed the deleted one's
 * number and therefore its save KEY — a new colony opening on somebody else's leftovers.
 * That is the same trap `traitSeq` exists to avoid, and the same fix.
 */
const SEQ_KEY = "zombie-ants.accountSeq";

export interface Account {
  /** Stable, and part of this account's save key — it may never be reused or renumbered. */
  id: string;
  name: string;
  /** The player code, which is also how this account is signed into. */
  code: string;
  created: number;
  /** Last time this account was signed in, so the picker can lead with the recent one. */
  seen: number;
}

export interface AccountService {
  /** Every account on this device, most recently used first. */
  list(): Account[];
  /** The one signed in, or null — which is what puts the sign-in screen up. */
  current(): Account | null;
  /** Make one and sign into it. The name is the colony's name. */
  create(name: string): Account;
  /** Sign in by code or by id. Null when nothing matches — never a thrown error. */
  signIn(codeOrId: string): Account | null;
  signOut(): void;
  /** Delete an account AND its save. Destructive; the screen asks twice. */
  forget(id: string): boolean;
  /** The save behind an account. One store per account, never shared. */
  storeFor(account: Account): ProfileStore;
}

/** The save key for an account. The FIRST account keeps the original key (see `adopt`). */
export const keyFor = (id: string): string =>
  id === LEGACY_ID ? PROFILE_KEY : `${PROFILE_KEY}:${id}`;

/**
 * The id the save that already exists is filed under.
 *
 * A player who has been playing for weeks must not open this build and find a sign-in
 * screen over an empty colony. Their save keeps the key it has always had and becomes
 * account number one, named after the colony they already named — so from the outside the
 * update adds a Sign out row and changes nothing else.
 */
export const LEGACY_ID = "a1";

export class LocalAccounts implements AccountService {
  constructor(private store: KeyValueStore = defaultStore()) {
    this.adopt();
  }

  list(): Account[] {
    const raw = readJson<unknown>(this.store, ROSTER_KEY);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(isAccount)
      .map((a) => ({ ...a, name: a.name.slice(0, 18) }))
      .sort((a, b) => b.seen - a.seen);
  }

  current(): Account | null {
    const id = this.store.get(CURRENT_KEY);
    return (id && this.list().find((a) => a.id === id)) || null;
  }

  create(name: string): Account {
    const accounts = this.list();
    const account: Account = {
      // Numbered past the highest id EVER issued, never off the roster: forgetting an
      // account would otherwise hand its number — and therefore its save key — to the
      // next one created, which is one colony reading another's leftovers.
      id: this.nextId(),
      name: cleanName(name),
      code: "",
      created: Date.now(),
      seen: this.freshStamp(),
    };
    // THE CODE COMES OFF THE SAVE, never minted here. `ProfileStore` mints one on first
    // read and that is the code the whole app already shows (Support, Settings); a second
    // one issued here would be two codes for one colony, and the one a player reads off
    // Support would not sign them in.
    const store = this.storeFor(account);
    store.update((p) => { p.name = account.name; });
    account.code = store.get().playerId;
    this.write([account, ...accounts]);
    this.store.set(CURRENT_KEY, account.id);
    return account;
  }

  signIn(codeOrId: string): Account | null {
    const want = codeOrId.trim().toUpperCase();
    if (!want) return null;
    const found = this.list().find((a) => a.code.toUpperCase() === want || a.id === want);
    if (!found) return null;
    // Stamped on the way in, so the picker leads with the colony this device actually
    // plays — and stamped strictly PAST every other account rather than with the bare
    // clock. Two sign-ins inside one millisecond are ordinary on a phone, and a "most
    // recent first" list that can tie is a picker whose order moves on its own.
    const seen = this.freshStamp();
    this.write(this.list().map((a) => (a.id === found.id ? { ...a, seen } : a)));
    this.store.set(CURRENT_KEY, found.id);
    return { ...found, seen };
  }

  signOut(): void { this.store.remove(CURRENT_KEY); }

  forget(id: string): boolean {
    const accounts = this.list();
    if (!accounts.some((a) => a.id === id)) return false;
    this.write(accounts.filter((a) => a.id !== id));
    this.store.remove(keyFor(id));
    if (this.store.get(CURRENT_KEY) === id) this.signOut();
    return true;
  }

  storeFor(account: Account): ProfileStore {
    return new ProfileStore(this.store, keyFor(account.id));
  }

  /** A "last used" stamp that is always past every other account's. */
  private freshStamp(): number {
    return Math.max(Date.now(), ...this.list().map((a) => a.seen + 1), 0);
  }

  /** The next number, past everything ever issued and past whatever the roster holds. */
  private nextId(): string {
    const stored = Number(this.store.get(SEQ_KEY)) || 0;
    const inRoster = this.list().reduce(
      (n, a) => Math.max(n, Number(a.id.replace(/\D/g, "")) || 0), 0);
    const next = Math.max(stored, inRoster) + 1;
    this.store.set(SEQ_KEY, String(next));
    return `a${next}`;
  }

  private write(accounts: Account[]): void {
    writeJson(this.store, ROSTER_KEY, accounts);
  }

  /**
   * THE SAVE THAT IS ALREADY THERE BECOMES ACCOUNT ONE, and is signed in.
   *
   * Without this the first launch of this build shows a sign-in screen to a player whose
   * colony is sitting right there under the old key, with no way to reach it — the update
   * would read as the game having deleted everything. It runs once: after it the roster is
   * not empty, so it never fires again, and a device with no save at all gets a clean
   * sign-in screen exactly as it should.
   */
  private adopt(): void {
    if (this.list().length) return;
    const existing = readJson<{ name?: unknown; playerId?: unknown }>(this.store, PROFILE_KEY);
    if (!existing) return;
    const store = new ProfileStore(this.store, PROFILE_KEY);
    const saved = store.get();
    const account: Account = {
      id: LEGACY_ID,
      name: saved.name,
      code: saved.playerId,
      created: Date.now(),
      seen: Date.now(),
    };
    this.write([account]);
    this.store.set(SEQ_KEY, String(1));
    this.store.set(CURRENT_KEY, account.id);
  }
}

/**
 * A colony's name.
 *
 * Trimmed, capped at the same eighteen characters `normalise` caps the save's own name to
 * — two different limits would let an account be created under a name the profile then
 * shortened, so the roster and the save would disagree on the first screen that showed
 * both. An empty one falls back rather than being refused: the name is the only thing this
 * screen asks for, and refusing a blank field is a dead end a player has to solve before
 * they have seen the game.
 */
export const cleanName = (name: string): string =>
  name.trim().slice(0, 18) || "Commander";

function isAccount(a: unknown): a is Account {
  const it = a as Account;
  return !!it && typeof it === "object"
    && typeof it.id === "string" && !!it.id
    && typeof it.name === "string"
    && typeof it.code === "string"
    && typeof it.created === "number" && Number.isFinite(it.created)
    && typeof it.seen === "number" && Number.isFinite(it.seen);
}
