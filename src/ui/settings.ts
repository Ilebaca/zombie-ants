/**
 * SETTINGS, and it is a screen rather than a form.
 *
 * It was one card of six identical rows — a label on the left, a bordered button on the
 * right — and two of those rows were dead: "Sound  [On]" and "Vibration  [On]", both
 * disabled, both controlling nothing, because this build has no audio and no haptics. A
 * switch for something that does not exist is worse than no switch; they are gone until
 * there is something behind them.
 *
 * What is left is grouped by WHAT IT AFFECTS, with a line under each saying so, and it
 * uses the same row the profile screen does: a mark, a name, a sentence, and the value or
 * a chevron on the right. Three of the rows are new, and each is something the app could
 * already do and had nowhere to offer:
 *
 *   - the colony's NAME, which is printed on the board beside the player's nest
 *     (render/plates.ts) and on the profile, and until now could never be changed;
 *   - HOW TO PLAY, which was reachable only from the home screen;
 *   - and starting over, which `ProfileStore.reset` has always supported and nothing
 *     called. It asks twice, because it cannot be undone.
 *
 * The build stamp is not a setting and no longer pretends to be one. It sits at the foot
 * of the screen, which is where a version belongs — and it has to stay somewhere readable,
 * because a stale cached page and a real bug look identical on a phone without it.
 */
import { BUILD, exportProfile, importProfile } from "../platform";
import type { ProfileStore } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export interface SettingsOptions {
  profile: ProfileStore;
  onBack: () => void;
  /** Current values, shown on the rows that cycle. */
  board: string;
  difficulty: string;
  onCycleBoard: () => void;
  onCycleDifficulty: () => void;
  onHowToPlay: () => void;
  /** Flipping a switch writes the profile AND tells the live device — see `App`. */
  onFeedbackChanged: () => void;
  /** Run the guided tour again. It is a first-run thing, so this is the only way back. */
  onReplayTutorial: () => void;
  /** Everything erased and the app sent home. Asked twice before it is called. */
  onReset: () => void;
  /** A code was taken. Everything on screen is about a different colony now. */
  onRestored: () => void;
  /** Leave this colony for the sign-in screen. It destroys nothing. */
  onSignOut: () => void;
  /** The player code this colony signs back in with — shown beside the sign-out row. */
  playerCode: string;
}

export function buildSettings(opts: SettingsOptions): HTMLElement {
  const root = screenEl("settings");
  screenHeader(root, { title: "Settings", sub: "Preferences", onBack: opts.onBack });

  const body = el("div", "screenbody sb-top");
  const scroll = el("div", "setwrap");

  scroll.append(
    el("div", "secthead", "Your colony"),
    nameRow(opts.profile, root),
    // SIGNING OUT DESTROYS NOTHING, and the row says so — it sits two headings above the
    // one that wipes the save, and a control that leaves your colony has to be plainly
    // different from the one that ends it. The code is on the row rather than a screen
    // away, because it is what signs this colony back in.
    goRow({
      mark: "friends",
      title: "Sign out",
      desc: `Back to the colony picker. Nothing is deleted. Your code is ${opts.playerCode}.`,
      id: "setSignOut",
      onGo: opts.onSignOut,
    }),

    el("div", "secthead", "The next match"),
    valueRow({
      mark: "board",
      title: "Board",
      desc: "Where a quick match is played.",
      value: opts.board,
      id: "setBoard",
      onPick: opts.onCycleBoard,
    }),
    valueRow({
      mark: "attack",
      title: "Enemy AI",
      // Said plainly, because it is surprising: a matchmade opponent stands in for a
      // person and always plays hard, so this is the challenge difficulty.
      desc: "Challenge difficulty. A matched opponent plays Hard.",
      value: opts.difficulty,
      id: "setDiff",
      onPick: opts.onCycleDifficulty,
    }),

    el("div", "secthead", "Sound & feel"),
    switchRow({
      mark: "spark",
      title: "Sound",
      desc: "The taps, the fights and the end of a match. Not the music.",
      id: "setSound",
      on: opts.profile.get().sound,
      onFlip: (on) => {
        opts.profile.update((p) => { p.sound = on; });
        opts.onFeedbackChanged();
      },
    }),
    switchRow({
      mark: "music",
      title: "Music",
      desc: "The bed under the menus, and the drums under a match.",
      id: "setMusic",
      on: opts.profile.get().music,
      onFlip: (on) => {
        opts.profile.update((p) => { p.music = on; });
        opts.onFeedbackChanged();
      },
    }),
    switchRow({
      mark: "attack",
      title: "Vibration",
      desc: "A short buzz on the moments worth feeling.",
      id: "setHaptics",
      on: opts.profile.get().haptics,
      onFlip: (on) => {
        opts.profile.update((p) => { p.haptics = on; });
        opts.onFeedbackChanged();
      },
    }),

    el("div", "secthead", "Learning the game"),
    goRow({
      mark: "book",
      title: "How to play",
      desc: "The rules in full, with pictures.",
      id: "setRules",
      onGo: opts.onHowToPlay,
    }),
    goRow({
      mark: "flag",
      title: "Replay the tutorial",
      desc: "Walk the guided tour again from the start.",
      id: "setTutorial",
      onGo: opts.onReplayTutorial,
    }),

    el("div", "secthead", "Your save"),
    backupRow(opts.profile, root),
    restoreRow(opts.profile, root, opts.onRestored),

    el("div", "secthead", "Start over"),
    resetRow(opts.onReset),
  );

  scroll.appendChild(buildFoot());
  body.appendChild(scroll);
  root.appendChild(body);
  return root;
}

/* ------------------------------------------------------------------- THE ROWS */

interface RowParts {
  mark: string;
  title: string;
  desc: string;
  id: string;
}

/** The shell every row shares: a mark, a name and a sentence, then whatever acts. */
function shell(parts: RowParts, tag: "div" | "button"): HTMLElement {
  const row = el(tag, `setrow2 ${tag === "button" ? "setrow-go" : ""}`.trim());
  row.id = parts.id;
  const slot = el("span", "setrow-i");
  slot.appendChild(icon(parts.mark, 18));
  const mid = el("span", "setrow-mid");
  mid.append(el("span", "setrow-t", parts.title), el("span", "setrow-d", parts.desc));
  row.append(slot, mid);
  return row;
}

interface ValueRow extends RowParts { value: string; onPick: () => void }

/** A setting that cycles through a short list. The value IS the control. */
function valueRow(parts: ValueRow): HTMLElement {
  const row = shell(parts, "div");
  const btn = el("button", "setval", parts.value);
  // The id belongs on the thing that is pressed, not on the row around it.
  btn.id = parts.id;
  row.id = `${parts.id}Row`;
  btn.onclick = parts.onPick;
  row.appendChild(btn);
  return row;
}

/** A setting that opens something else. The whole row takes the tap. */
function goRow(parts: RowParts & { onGo: () => void }): HTMLElement {
  const row = shell(parts, "button") as HTMLButtonElement;
  row.type = "button";
  row.appendChild(icon("next", 14));
  row.onclick = parts.onGo;
  return row;
}

/**
 * A switch.
 *
 * These two were disabled buttons reading "On" over nothing for months, and were taken off
 * this screen for exactly that reason — a switch for something that does not exist is a
 * screen lying about itself. There is a device behind them now (platform/feedback.ts).
 *
 * It reports its own state in a word rather than as a bare toggle: "On" and "Off" survive a
 * screenshot, a description and a player who has never seen this control before.
 */
function switchRow(
  parts: RowParts & { on: boolean; onFlip: (on: boolean) => void },
): HTMLElement {
  const row = shell(parts, "div");
  const btn = el("button", "setval setswitch" + (parts.on ? " on" : ""), parts.on ? "On" : "Off");
  btn.id = parts.id;
  btn.setAttribute("role", "switch");
  btn.setAttribute("aria-checked", String(parts.on));
  row.id = `${parts.id}Row`;
  let on = parts.on;
  btn.onclick = () => {
    on = !on;
    btn.textContent = on ? "On" : "Off";
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-checked", String(on));
    parts.onFlip(on);
  };
  row.appendChild(btn);
  return row;
}

/**
 * The one row that cannot be undone, so it asks twice.
 *
 * A confirm dialog would be a second overlay for one button; the row asks for the same
 * tap again instead, and says what it is about to destroy while it waits.
 */
function resetRow(onReset: () => void): HTMLElement {
  const row = shell({
    mark: "trash",
    title: "Reset everything",
    desc: "Erase the colony, chambers, research and road.",
    id: "setReset",
  }, "div");

  row.classList.add("setrow-danger");
  const btn = el("button", "setval setdanger", "Reset");
  btn.id = "setReset";
  row.id = "setResetRow";
  let armed = false;
  btn.onclick = (): void => {
    if (!armed) {
      armed = true;
      btn.textContent = "Tap to confirm";
      btn.classList.add("armed");
      const desc = row.querySelector(".setrow-d");
      if (desc) desc.textContent = "This cannot be undone.";
      return;
    }
    onReset();
  };
  row.appendChild(btn);
  return row;
}

/**
 * The colony's name, edited where it is read.
 *
 * It is written on the forest floor beside the player's nest for the whole match
 * (render/plates.ts) and heads the profile, and there has never been a way to change it.
 * Saved on blur and on Enter rather than per keystroke — a write per character is a write
 * per character, and the profile is normalised and persisted on every one.
 */
function nameRow(store: ProfileStore, root: HTMLElement): HTMLElement {
  const row = shell({
    mark: "crown",
    title: "Name",
    desc: "Written beside your nest for the whole match.",
    id: "setNameRow",
  }, "div");

  const field = el("input", "setname") as HTMLInputElement;
  field.id = "setName";
  field.type = "text";
  field.maxLength = 18;
  field.value = store.get().name;
  field.setAttribute("aria-label", "Colony name");

  const save = (): void => {
    const typed = field.value.trim();
    const saved = store.update((p) => { p.name = typed || p.name; }).name;
    // The store is the authority: it clamps the length and refuses an empty name, so the
    // field is put back to whatever was actually kept rather than to what was typed.
    field.value = saved;
    toast(root, `Name → ${saved}`, "hive");
  };
  field.onblur = save;
  field.onkeydown = (e: KeyboardEvent): void => { if (e.key === "Enter") field.blur(); };

  row.appendChild(field);
  return row;
}

/* --------------------------------------------------------------- YOUR SAVE */

/**
 * THE BACKUP CODE.
 *
 * Everything the player has lives in `localStorage` on one device, so a new phone or a
 * cleared browser takes all of it with nothing they could have done. Until there is a
 * server to hang an account on, the honest thing is the save written out as one string
 * they can keep somewhere — a note, a message to themselves — and read back on the other
 * side (platform/backup.ts).
 *
 * It is HIDDEN until asked for. The code is a couple of thousand characters and a wall of
 * base64 sitting open in the middle of Settings reads as a fault; a row that says what it
 * is and opens on a tap reads as an offer.
 */
function backupRow(store: ProfileStore, root: HTMLElement): HTMLElement {
  const wrap = el("div", "setgroup");
  const row = shell({
    mark: "granary",
    title: "Backup code",
    desc: "Carries this colony to another phone. Saved replays stay behind.",
    id: "setBackupRow",
  }, "div");

  const btn = el("button", "setval", "Show");
  btn.id = "setBackup";
  const panel = el("div", "setpanel");
  panel.id = "setBackupPanel";
  panel.hidden = true;

  const field = el("textarea", "setcode") as HTMLTextAreaElement;
  field.id = "setBackupCode";
  field.readOnly = true;
  field.setAttribute("aria-label", "Backup code");

  const copy = el("button", "setval setwide", "Copy") as HTMLButtonElement;
  copy.id = "setBackupCopy";
  copy.onclick = (): void => {
    // Selecting it is the fallback that always works: a page served over http, an older
    // browser or a denied permission all leave `writeText` unavailable, and a Copy button
    // that silently does nothing is worse than one that hands the player the selection.
    field.select();
    void writeClipboard(field.value).then((ok) => {
      toast(root, ok ? "Code copied" : "Code selected — copy it", "hive");
    });
  };

  panel.append(field, copy);

  btn.onclick = (): void => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.textContent = open ? "Hide" : "Show";
    // Written at the moment it is shown, never at build time: the screen is rebuilt on
    // entry but a match played in between would otherwise hand out a stale colony.
    if (open) field.value = exportProfile(store.get());
  };

  row.appendChild(btn);
  wrap.append(row, panel);
  return wrap;
}

/**
 * RESTORING, which is the destructive half.
 *
 * Taking a code REPLACES the save on this device — that is what it is for, and it is the
 * most damaging thing in the app after Reset — so it asks twice on the same button, the
 * way Reset does, rather than opening a second overlay for one control.
 *
 * A code that will not load says WHICH of the three things went wrong. "Invalid" tells a
 * player nothing they can act on; "the end is missing" tells them to copy it again.
 */
function restoreRow(store: ProfileStore, root: HTMLElement, onRestored: () => void): HTMLElement {
  const wrap = el("div", "setgroup");
  const row = shell({
    mark: "brood",
    title: "Restore a colony",
    desc: "Paste a backup code from another device. It replaces this save.",
    id: "setRestoreRow",
  }, "div");

  const btn = el("button", "setval", "Paste");
  btn.id = "setRestore";
  const panel = el("div", "setpanel");
  panel.id = "setRestorePanel";
  panel.hidden = true;

  const field = el("textarea", "setcode") as HTMLTextAreaElement;
  field.id = "setRestoreCode";
  field.placeholder = "ZA1...";
  field.setAttribute("aria-label", "Backup code to restore");

  const go = el("button", "setval setdanger setwide", "Restore") as HTMLButtonElement;
  go.id = "setRestoreGo";
  let armed = false;
  const disarm = (): void => {
    armed = false;
    go.textContent = "Restore";
    go.classList.remove("armed");
  };
  field.oninput = disarm;

  go.onclick = (): void => {
    const read = importProfile(field.value);
    if (!read.ok) {
      disarm();
      toast(root, whyNot(read.why), "bad");
      return;
    }
    if (!armed) {
      armed = true;
      go.textContent = "Tap to replace this save";
      go.classList.add("armed");
      return;
    }
    store.restore(read.profile);
    onRestored();
  };

  panel.append(field, go);
  btn.onclick = (): void => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.textContent = open ? "Hide" : "Paste";
    if (!open) disarm();
  };

  row.appendChild(btn);
  wrap.append(row, panel);
  return wrap;
}

/** Say what is actually wrong with the code, not that it is "invalid". */
function whyNot(why: "not-a-code" | "damaged" | "unreadable"): string {
  if (why === "not-a-code") return "That is not a backup code";
  if (why === "damaged") return "That code is incomplete — copy all of it";
  return "That code could not be read";
}

/** Copy, where copying is allowed. Never throws; says whether it worked. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
    return !!navigator.clipboard;
  } catch {
    return false;
  }
}

/** The build, at the foot of the screen where a version belongs. */
function buildFoot(): HTMLElement {
  const foot = el("div", "setfoot");
  foot.append(
    el("div", "setfoot-n", "Zombie Ants"),
    el("div", "setfoot-b", `Build ${BUILD}`),
  );
  foot.id = "setBuild";
  return foot;
}
