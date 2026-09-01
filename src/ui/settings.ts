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
import { BUILD } from "../platform";
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
}

export function buildSettings(opts: SettingsOptions): HTMLElement {
  const root = screenEl("settings");
  screenHeader(root, { title: "Settings", sub: "Preferences", onBack: opts.onBack });

  const body = el("div", "screenbody sb-top");
  const scroll = el("div", "setwrap");

  scroll.append(
    el("div", "secthead", "Your colony"),
    nameRow(opts.profile, root),

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
