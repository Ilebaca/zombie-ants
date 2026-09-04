/**
 * KEEP YOUR COLONY.
 *
 * The screen is mostly words, so what is worth holding is that it says the RIGHT words for
 * the device in front of it — an Android player warned about Safari, or somebody whose
 * storage is broken told to install the app, is a page nobody believes the second time —
 * and that the code is there, generated, without a second tap.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore, ProfileStore, BACKUP_TAG } from "../../platform";
import { buildKeepSafe } from "../keepsafe";
import { codePanel } from "../backupcode";
import { el } from "../chrome";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

const store = (): ProfileStore => new ProfileStore(new MemoryStore());

const build = (risk: "none" | "eviction" | "unwritable", s = store()): HTMLElement => {
  const root = buildKeepSafe(s, { risk, onBack: () => {} });
  document.body.replaceChildren(root);
  return root;
};

describe("what it says about this device", () => {
  it("spells out the Home Screen steps only where they are the fix", () => {
    expect(build("eviction").querySelector("#ksInstall")).toBeTruthy();
    expect(build("none").querySelector("#ksInstall")).toBe(null);
    // Broken storage is not fixed by installing, and saying so would waste the one
    // instruction that player has time to act on.
    expect(build("unwritable").querySelector("#ksInstall")).toBe(null);
  });

  it("names Safari's week only to the player it applies to", () => {
    expect(build("eviction").textContent).toMatch(/week/i);
    expect(build("none").textContent).not.toMatch(/Safari/i);
  });

  it("says plainly when nothing is being saved at all", () => {
    const root = build("unwritable");
    expect(root.querySelector("#ksState")?.className).toContain("ks-unwritable");
    expect(root.textContent).toMatch(/not saving/i);
  });

  it("still explains where the save lives when there is no risk", () => {
    const root = build("none");
    expect(root.querySelector("#ksState")).toBeTruthy();
    expect(root.textContent).toMatch(/this phone/i);
  });
});

describe("the code", () => {
  /**
   * OPEN, not behind a Show button — the opposite of the Settings row on purpose. A player
   * who reached this screen came for exactly this, and a second tap between them and their
   * colony is a tap some of them will not take.
   */
  it("is generated and on screen, on every one of the three states", () => {
    for (const risk of ["none", "eviction", "unwritable"] as const) {
      const field = build(risk).querySelector<HTMLTextAreaElement>("#ksPanel textarea");
      expect(field?.value.startsWith(BACKUP_TAG), `no code for ${risk}`).toBe(true);
    }
  });

  /** Taking one is what stops the app asking, so it has to be written to the save. */
  it("stamps the save, so home stops offering it", () => {
    const s = store();
    expect(s.get().backupAt).toBe(0);
    build("eviction", s);
    expect(s.get().backupAt).toBeGreaterThan(0);
  });
});

/**
 * ONE FUNCTION OWNS THE CODE (ui/backupcode.ts). It is offered from two screens now, and
 * the fiddly rules around it — generated when shown rather than when built, stamped on the
 * save — are exactly the kind that drift when they are written twice.
 */
describe("the shared code panel", () => {
  it("writes the code at the moment it is asked for, not when it was built", () => {
    const s = store();
    const root = el("div");
    const { panel, fill } = codePanel(s, root);
    const field = panel.querySelector("textarea")!;
    expect(field.value, "a panel built is not a code taken").toBe("");

    s.update((p) => { p.colony = 4242; });
    fill();
    const first = field.value;
    expect(first.startsWith(BACKUP_TAG)).toBe(true);

    // A match played between two openings must not hand out the older colony.
    s.update((p) => { p.colony = 9999; });
    fill();
    expect(field.value).not.toBe(first);
  });
});
