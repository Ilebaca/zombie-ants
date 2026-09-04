/**
 * SETTINGS.
 *
 * It was one card of six identical rows, two of them dead switches over nothing. What is
 * tested here is what the rebuild is FOR: that every row on the screen does something,
 * that the three new ones really reach the store, and that the one which cannot be undone
 * asks twice.
 */
import { describe, expect, it } from "vitest";
import { BUILD, MemoryStore, ProfileStore, exportProfile, importProfile } from "../../platform";
import { buildSettings } from "../settings";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

interface Spy { rules: number; tour: number; reset: number; board: number; diff: number; feedback: number; restored: number; signout: number }

const build = (store = new ProfileStore(new MemoryStore())): {
  root: HTMLElement; store: ProfileStore; spy: Spy;
} => {
  const spy: Spy = { rules: 0, tour: 0, reset: 0, board: 0, diff: 0, feedback: 0, restored: 0, signout: 0 };
  const root = buildSettings({
    profile: store,
    onBack: () => {},
    board: "Corridor (9×9)",
    difficulty: "Normal",
    onCycleBoard: () => { spy.board++; },
    onCycleDifficulty: () => { spy.diff++; },
    onHowToPlay: () => { spy.rules++; },
    onFeedbackChanged: () => { spy.feedback++; },
    onReplayTutorial: () => { spy.tour++; },
    onReset: () => { spy.reset++; },
    onRestored: () => { spy.restored++; },
    onSignOut: () => { spy.signout++; },
    onKeepSafe: () => {},
    playerCode: store.get().playerId,
  });
  document.body.replaceChildren(root);
  return { root, store, spy };
};

const press = (root: HTMLElement, id: string): void => {
  const btn = root.querySelector<HTMLElement>(`#${id}`);
  expect(btn, `no control #${id}`).toBeTruthy();
  btn?.click();
};

describe("the settings screen", () => {
  /**
   * A switch over something that does not exist is worse than no switch. This build has
   * no audio and no haptics, and both rows were disabled buttons reading "On" — which is
   * a screen telling the player something untrue about itself.
   */
  /**
   * Sound and Vibration were disabled buttons reading "On" over nothing — this build had
   * no audio and no haptics, so they were removed. They are back because there is a device
   * behind them now, and what is held is that they are LIVE: no disabled control on the
   * screen, and flipping one writes the save and tells the app.
   */
  it("offers no control that does nothing", () => {
    const { root } = build();
    const dead = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
      .filter((b) => b.disabled);
    expect(dead.map((b) => b.textContent)).toEqual([]);
  });

  it("flips sound and vibration, and tells the app each time", () => {
    const { root, store: s, spy } = build();
    expect(s.get().sound, "a new colony should ship audible").toBe(true);
    root.querySelector<HTMLButtonElement>("#setSound")?.click();
    expect(s.get().sound).toBe(false);
    expect(root.querySelector("#setSound")?.textContent).toBe("Off");
    expect(spy.feedback, "the live device was never told").toBe(1);

    root.querySelector<HTMLButtonElement>("#setHaptics")?.click();
    expect(s.get().haptics).toBe(false);
    expect(spy.feedback).toBe(2);

    // ...and back, on the same button.
    root.querySelector<HTMLButtonElement>("#setSound")?.click();
    expect(s.get().sound).toBe(true);
    expect(root.querySelector("#setSound")?.getAttribute("aria-checked")).toBe("true");
  });

  it("opens on whatever the save says", () => {
    const s = new ProfileStore(new MemoryStore());
    s.update((p) => { p.sound = false; p.haptics = true; });
    const { root } = build(s);
    expect(root.querySelector("#setSound")?.textContent).toBe("Off");
    expect(root.querySelector("#setHaptics")?.textContent).toBe("On");
  });

  it("wires every row it does show", () => {
    const { root, spy } = build();
    press(root, "setBoard");
    press(root, "setDiff");
    press(root, "setRules");
    press(root, "setTutorial");
    expect(spy).toMatchObject({ board: 1, diff: 1, rules: 1, tour: 1 });
  });

  it("shows the current board and difficulty as the value of their rows", () => {
    const { root } = build();
    expect(root.querySelector("#setBoard")?.textContent).toBe("Corridor (9×9)");
    expect(root.querySelector("#setDiff")?.textContent).toBe("Normal");
  });

  // Every row says what it affects. That is the whole difference between a screen and a
  // list of labels, and it is the reason the rebuild happened.
  it("says what each setting is for, not only what it is called", () => {
    const { root } = build();
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".setrow2"));
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const row of rows) {
      expect(row.querySelector(".setrow-t")?.textContent, "a row with no name").toBeTruthy();
      const desc = row.querySelector(".setrow-d")?.textContent ?? "";
      expect(desc.length, `"${row.querySelector(".setrow-t")?.textContent}" explains nothing`)
        .toBeGreaterThan(20);
    }
  });

  /* ------------------------------------------------------------------- THE NAME */

  it("writes the name through to the profile", () => {
    const { root, store } = build();
    const field = root.querySelector<HTMLInputElement>("#setName");
    expect(field?.value).toBe(store.get().name);
    field!.value = "Ilebaca";
    field!.dispatchEvent(new Event("blur"));
    expect(store.get().name).toBe("Ilebaca");
  });

  // The store is the authority: it refuses an empty name, so the field has to be put back
  // to what was actually kept rather than left showing what was typed.
  it("refuses an empty name and puts the field back", () => {
    const { root, store } = build();
    const was = store.get().name;
    const field = root.querySelector<HTMLInputElement>("#setName");
    field!.value = "   ";
    field!.dispatchEvent(new Event("blur"));
    expect(store.get().name).toBe(was);
    expect(field!.value).toBe(was);
  });

  /* ------------------------------------------------------------------ THE RESET */

  it("asks twice before erasing everything", () => {
    const { root, spy } = build();
    press(root, "setReset");
    expect(spy.reset, "erased the save on the first tap").toBe(0);
    expect(root.querySelector("#setReset")?.textContent).toContain("confirm");
    press(root, "setReset");
    expect(spy.reset).toBe(1);
  });

  /* ------------------------------------------------------------------- THE SAVE */

  /**
   * The code is a couple of thousand characters. A wall of base64 sitting open in the
   * middle of Settings reads as a fault rather than as an offer, so the row opens it.
   */
  it("keeps the backup code hidden until it is asked for", () => {
    const { root } = build();
    const panel = root.querySelector<HTMLElement>("#setBackupPanel");
    expect(panel?.hidden).toBe(true);
    press(root, "setBackup");
    expect(panel?.hidden).toBe(false);
    press(root, "setBackup");
    expect(panel?.hidden, "would not close again").toBe(true);
  });

  /**
   * Written at the moment it is SHOWN, never at build time. The screen is rebuilt on
   * entry, but a match played between two openings would otherwise hand out a code for a
   * colony the player no longer has — the one thing a backup must never do.
   */
  it("writes the code out fresh, for the save as it stands now", () => {
    const { root, store } = build();
    press(root, "setBackup");
    const field = root.querySelector<HTMLTextAreaElement>("#setBackupCode");
    const first = importProfile(field!.value);
    expect(first.ok && first.profile.mycel).toBe(store.get().mycel);

    press(root, "setBackup");
    store.update((p) => { p.mycel += 500; });
    press(root, "setBackup");
    const again = importProfile(field!.value);
    expect(again.ok && again.profile.mycel).toBe(store.get().mycel);
  });

  it("takes a code and makes it the save", () => {
    const from = new ProfileStore(new MemoryStore());
    from.update((p) => { p.name = "Ilebaca"; p.mycel = 640; });

    const { root, store, spy } = build();
    press(root, "setRestore");
    const field = root.querySelector<HTMLTextAreaElement>("#setRestoreCode");
    field!.value = exportProfile(from.get());

    press(root, "setRestoreGo");
    expect(store.get().name, "replaced the save on the first tap").not.toBe("Ilebaca");
    expect(spy.restored).toBe(0);

    press(root, "setRestoreGo");
    expect(store.get().name).toBe("Ilebaca");
    expect(store.get().mycel).toBe(640);
    // The app has to be told: everything on screen is about a different colony now.
    expect(spy.restored).toBe(1);
  });

  /**
   * A bad code is refused BEFORE the confirmation, not after it. Arming on a code that
   * cannot load would ask the player to confirm destroying their save for nothing.
   */
  it("refuses a bad code without ever arming", () => {
    const { root, store, spy } = build();
    const was = store.get().name;
    press(root, "setRestore");
    const field = root.querySelector<HTMLTextAreaElement>("#setRestoreCode");
    field!.value = "definitely not a code";

    press(root, "setRestoreGo");
    expect(root.querySelector("#setRestoreGo")?.textContent).toBe("Restore");
    press(root, "setRestoreGo");
    expect(store.get().name).toBe(was);
    expect(spy.restored).toBe(0);
  });

  /**
   * Editing the field disarms it. Otherwise a confirmation given for one code would be
   * spent on whatever was pasted over it — a save replaced by a colony nobody confirmed.
   */
  it("forgets a confirmation when the code is changed", () => {
    const other = new ProfileStore(new MemoryStore());
    other.update((p) => { p.name = "Ilebaca"; });
    const { root, store, spy } = build();
    const was = store.get().name;

    press(root, "setRestore");
    const field = root.querySelector<HTMLTextAreaElement>("#setRestoreCode");
    field!.value = exportProfile(other.get());
    press(root, "setRestoreGo");

    field!.value = exportProfile(other.get());
    field!.dispatchEvent(new Event("input"));
    press(root, "setRestoreGo");
    expect(store.get().name, "replaced the save on an unconfirmed code").toBe(was);
    expect(spy.restored).toBe(0);
  });

  /* ------------------------------------------------------------------ THE BUILD */

  // Not a setting, and no longer sitting in the list pretending to be one — but it has to
  // stay readable, or a stale cached page and a real bug look identical on a phone.
  it("prints the build at the foot rather than as a row", () => {
    const { root } = build();
    const foot = root.querySelector("#setBuild");
    expect(foot?.textContent).toContain(BUILD);
    expect(foot?.classList.contains("setrow2")).toBe(false);
    expect(foot?.querySelector("button"), "the build is not a control").toBeNull();
  });
});
