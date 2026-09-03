/**
 * THE SIGN-IN SCREEN, driven the way a player drives it.
 *
 * It is the only screen reachable with no save behind it, so what matters is that it works
 * from nothing, that it is over in one tap, and that it never strands somebody: a blank
 * name still starts a colony, and a code that matches nothing says so rather than doing
 * nothing at all.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { LocalAccounts, MemoryStore, PROFILE_KEY, ProfileStore, compact } from "../../platform";
import type { Account } from "../../platform";
import { buildSignIn } from "../signin";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

const build = (accounts: LocalAccounts): { root: HTMLElement; entered: Account[] } => {
  const entered: Account[] = [];
  const root = buildSignIn(accounts, { onEnter: (a) => { entered.push(a); } });
  document.body.replaceChildren(root);
  return { root, entered };
};

const type = (root: HTMLElement, id: string, value: string): void => {
  const field = root.querySelector<HTMLInputElement>(`#${id}`);
  expect(field, `no field #${id}`).toBeTruthy();
  field!.value = value;
  field!.dispatchEvent(new Event("input"));
};

const tap = (root: HTMLElement, id: string): void => {
  const btn = root.querySelector<HTMLButtonElement>(`#${id}`);
  expect(btn, `no button #${id}`).toBeTruthy();
  btn!.click();
};

describe("a device with nothing on it", () => {
  it("asks for a name and starts a colony with it", () => {
    const accounts = new LocalAccounts(new MemoryStore());
    const { root, entered } = build(accounts);

    expect(root.textContent).toContain("Name your colony");
    expect(root.querySelector(".sirow"), "there is nothing to come back to").toBe(null);

    type(root, "signinName", "Ridgeback");
    tap(root, "signinGo");

    expect(entered.length).toBe(1);
    expect(entered[0]?.name).toBe("Ridgeback");
    expect(accounts.current()?.name).toBe("Ridgeback");
  });

  /**
   * A Start button that does nothing until something is typed is the screen refusing to
   * begin the game. The name has a fallback, so the button always works.
   */
  it("starts on an empty name rather than blocking", () => {
    const accounts = new LocalAccounts(new MemoryStore());
    const { root, entered } = build(accounts);
    tap(root, "signinGo");
    expect(entered.length).toBe(1);
    expect(entered[0]?.name).toBe("Commander");
  });
});

describe("a device that has been played on", () => {
  const withColony = (name: string, colony: number): LocalAccounts => {
    const accounts = new LocalAccounts(new MemoryStore());
    const made = accounts.create(name);
    accounts.storeFor(made).update((p) => { p.colony = colony; });
    accounts.signOut();
    return accounts;
  };

  /**
   * A LIST OF NAMES SAYS NOTHING about which save has been played. The colony is the
   * number the whole game is played for, so it is what tells two of them apart.
   */
  it("lists each colony with its size, and opens one in a tap", () => {
    const accounts = withColony("Ridgeback", 88_000);
    const { root, entered } = build(accounts);

    expect(root.textContent).toContain("Welcome back");
    const row = root.querySelector<HTMLButtonElement>(".sirow");
    expect(row?.textContent).toContain("Ridgeback");
    expect(row?.textContent).toContain(compact(88_000));

    row?.click();
    expect(entered[0]?.name).toBe("Ridgeback");
  });

  it("offers a second colony without leaving the first", () => {
    const accounts = withColony("Ridgeback", 88_000);
    const { root, entered } = build(accounts);

    tap(root, "signinNew");
    expect(root.textContent).toContain("Name your colony");
    type(root, "signinName", "Second");
    tap(root, "signinGo");

    expect(entered[0]?.name).toBe("Second");
    expect(accounts.list().map((a) => a.name).sort()).toEqual(["Ridgeback", "Second"]);
  });

  /**
   * THERE IS NO CODE FIELD, and that is deliberate. Every account is local, so the rows
   * already list every colony a code could match — a box that can only find what is on
   * screen beside it is the screen pretending to be a login form for a server that does
   * not exist. What moves a colony to another phone is the save code, and the screen says
   * so rather than leaving somebody hunting for a field to paste into.
   */
  it("asks for no code, and points at what actually moves a save", () => {
    const accounts = withColony("Ridgeback", 88_000);
    const { root } = build(accounts);
    expect(root.querySelector("#signinCode")).toBe(null);

    tap(root, "signinNew");
    expect(root.textContent).toContain("save code");
  });
});

describe("upgrading from a build with no accounts", () => {
  it("goes straight past the sign-in screen, on the save already there", () => {
    const store = new MemoryStore();
    new ProfileStore(store, PROFILE_KEY).update((p) => { p.name = "Ridgeback"; p.colony = 5_000; });

    const accounts = new LocalAccounts(store);
    expect(accounts.current()?.name, "the existing colony was not adopted").toBe("Ridgeback");
  });
});
