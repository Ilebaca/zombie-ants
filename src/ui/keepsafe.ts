/**
 * KEEP YOUR COLONY — the one screen in the app that is about losing it.
 *
 * Everything a player has is in `localStorage` on one phone (§12), and two browsers treat
 * that as disposable: iOS Safari deletes it after seven days without a visit unless the
 * game is on the Home Screen, and any browser can be running with site data blocked, in
 * which case nothing has ever been saved at all.
 *
 * WHAT IT SAYS DEPENDS ON WHICH OF THOSE THE DEVICE IS IN (`platform/persistence.ts`), and
 * that is the whole reason it is a screen rather than a paragraph: a page that warns an
 * Android player about Safari, or tells somebody whose storage is broken to install the
 * app, is a page nobody believes the second time.
 *
 * THE FIX COMES FIRST AND THE CODE SECOND. Installing to the Home Screen is what actually
 * saves an iPhone colony — the backup code is what saves it after the fact — so the steps
 * lead and the code sits under them. Both are offered every time: a player who has already
 * installed still wants a code before a new phone.
 */
import { installSteps } from "../platform";
import type { ProfileStore, SaveRisk } from "../platform";
import { el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";
import { codePanel } from "./backupcode";

export interface KeepSafeOptions {
  risk: SaveRisk;
  onBack: () => void;
  /** Told when a code is taken, so the prompt on home can stop asking. */
  onChanged?: () => void;
}

export function buildKeepSafe(store: ProfileStore, opts: KeepSafeOptions): HTMLElement {
  const root = screenEl("keepsafe");
  screenHeader(root, {
    title: "Keep your colony",
    sub: "Where your progress lives",
    onBack: opts.onBack,
    backId: "ksBack",
  });

  const body = el("div", "screenbody sb-top");
  const wrap = el("div", "kswrap");
  wrap.id = "ksBody";

  wrap.appendChild(state(opts.risk));
  if (opts.risk === "eviction") wrap.appendChild(install());
  wrap.appendChild(backup(store, root, opts.onChanged));

  body.appendChild(wrap);
  root.appendChild(body);
  return root;
}

/**
 * WHERE THE SAVE STANDS, in plain words and in the right tone.
 *
 * "Unwritable" is the only one that is an emergency — nothing has been saved and nothing
 * will be — so it is the only one drawn in the losing colour. An iPhone in a tab is a
 * risk, not a fault, and dressing it as a fault makes a player distrust the game rather
 * than act on it.
 */
function state(risk: SaveRisk): HTMLElement {
  const box = el("div", `kscard ks-${risk}`);
  box.id = "ksState";

  const head = el("div", "ks-h");
  head.append(icon(risk === "unwritable" ? "cross" : "granary", 18));

  if (risk === "unwritable") {
    head.append(el("span", undefined, "This device is not saving"));
    box.append(head, el("p", "ks-p",
      "Your browser is blocking saved data — usually private browsing, or site data turned "
      + "off. Nothing from this session will be here when you come back. Take the code "
      + "below before you close the game, or switch off private browsing and start again."));
    return box;
  }

  if (risk === "eviction") {
    head.append(el("span", undefined, "Your colony is at risk"));
    box.append(head, el("p", "ks-p",
      "On iPhone, Safari deletes a website's saved data after about a week without a "
      + "visit — and that includes this colony. Adding the game to your Home Screen stops "
      + "it, and takes ten seconds."));
    return box;
  }

  head.append(el("span", undefined, "Your colony is saved on this device"));
  box.append(head, el("p", "ks-p",
    "Your progress is kept on this phone and nowhere else. It survives closing the game "
    + "and restarting the phone — but not a new phone, and not clearing your browser. The "
    + "code below is how you carry it."));
  return box;
}

/** The Share-sheet steps, spelled out — that is exactly where somebody gives up. */
function install(): HTMLElement {
  const box = el("div", "kscard");
  box.id = "ksInstall";
  box.appendChild(el("div", "ks-h2", "Add it to your Home Screen"));
  const list = el("ol", "kssteps");
  for (const step of installSteps()) list.appendChild(el("li", undefined, step));
  box.appendChild(list);
  return box;
}

/**
 * The code, OPEN rather than behind a Show button.
 *
 * The opposite of the Settings row on purpose: there it is one offer among a dozen and a
 * wall of base64 would read as a fault, while a player who reached THIS screen came for
 * exactly this. A second tap between them and their colony is a tap some of them will not
 * take.
 */
function backup(
  store: ProfileStore, root: HTMLElement, onChanged?: () => void,
): HTMLElement {
  const box = el("div", "kscard");
  box.id = "ksBackup";
  box.append(
    el("div", "ks-h2", "Your backup code"),
    el("p", "ks-p",
      "Keep this somewhere you will still have it — a note, or a message to yourself. "
      + "Paste it into Settings on any device to bring this colony back. Saved replays "
      + "stay behind; everything else travels."),
  );
  const { panel, fill } = codePanel(store, root, onChanged);
  panel.id = "ksPanel";
  box.appendChild(panel);
  fill();
  return box;
}
