/**
 * THE FIRST SCREEN: name your colony, or sign back into one.
 *
 * It is the only screen in the app that can be reached without a save, so it has to work
 * with nothing behind it and it has to be over in one tap. A new player types a name and
 * plays; a returning one taps the colony they already have. Nothing here asks a question
 * the game could answer for them.
 *
 * WHAT IT DOES NOT DO. There is no password (platform/accounts.ts: there is nothing local
 * to protect a save from, and a password is a way to LOSE a colony), no email, and no
 * confirmation step. The name is the one field, and even that is not required — an empty
 * one falls back rather than blocking somebody who has not seen the game yet.
 *
 * THE COLONIES ON THIS DEVICE ARE ROWS, AND THERE IS NO CODE FIELD. One was built and
 * removed: every account is local, so the roster already lists every colony a code could
 * possibly match — a "sign in with your code" box could never find anything the rows were
 * not already showing, and a field that can only match what is on screen beside it is the
 * screen pretending to be a login form for a server that does not exist. The player code
 * is still the account's credential in `AccountService.signIn`, which is the seam a real
 * one arrives through; it is simply not something a player has to type on this device.
 *
 * What DOES move a colony to another phone is the save code in Settings, so the note under
 * the name field says that rather than leaving somebody hunting for a field to paste into.
 */
import { compact } from "../platform";
import type { Account, AccountService } from "../platform";
import { antPortrait, el } from "./chrome";
import { icon } from "./icons";

export interface SignInOptions {
  /** The account to open. The shell swaps its profile store and shows home. */
  onEnter: (account: Account) => void;
}

export function buildSignIn(accounts: AccountService, opts: SignInOptions): HTMLElement {
  const root = el("div", "screen");
  root.id = "signin";
  /** True once the player asks for a new colony on a device that already has one. */
  let creating = false;

  const render = (): void => {
    root.replaceChildren();
    const known = accounts.list();
    const wrap = el("div", "siwrap");
    wrap.id = "signinBody";

    wrap.append(
      el("div", "si-mark", "ZOMBIE ANTS"),
      el("div", "si-h", known.length && !creating ? "Welcome back" : "Name your colony"),
    );

    if (known.length && !creating) wrap.append(roster(known), orCreate());
    else wrap.appendChild(namer(known.length > 0));

    root.appendChild(wrap);
  };

  /* ------------------------------------------------------------- COMING BACK */

  /**
   * One row per colony on this device.
   *
   * Each carries its own head and its SIZE, because the colony is the number the whole
   * game is played for and it is the only thing that tells two saves apart at a glance —
   * a list of names says nothing about which one a player has been playing.
   *
   * The name comes off the SAVE, not off the account row. Settings can rename a colony, and
   * reading the roster's copy would mean a second write to keep the two in step — which is
   * one more place for them to disagree, on the screen where a player picks between them.
   */
  const roster = (known: readonly Account[]): HTMLElement => {
    const list = el("div", "silist");
    for (const account of known) {
      const save = accounts.storeFor(account).get();
      const row = el("button", "sirow") as HTMLButtonElement;
      row.type = "button";
      row.dataset.account = account.id;
      row.append(antPortrait(save.lastSpecies, 72, "si-face"));

      const text = el("div", "si-txt");
      text.append(
        el("div", "si-name", save.name),
        el("div", "si-sub", `${compact(save.colony)} troops · ${account.code}`),
      );
      row.append(text, icon("next", 15));
      row.onclick = () => opts.onEnter(account);
      list.appendChild(row);
    }
    return list;
  };

  const orCreate = (): HTMLElement => {
    const more = el("button", "si-alt") as HTMLButtonElement;
    more.type = "button";
    more.id = "signinNew";
    more.append(icon("plus", 15), el("span", undefined, "Start a new colony"));
    more.onclick = () => { creating = true; render(); };
    return more;
  };

  /* ---------------------------------------------------------------- STARTING */

  const namer = (canGoBack: boolean): HTMLElement => {
    const box = el("div", "sibox");

    const field = el("input", "si-field") as HTMLInputElement;
    field.id = "signinName";
    field.type = "text";
    field.maxLength = 18;
    field.placeholder = "Commander";
    field.setAttribute("aria-label", "Colony name");

    const go = el("button", "si-go") as HTMLButtonElement;
    go.type = "button";
    go.id = "signinGo";
    go.textContent = "Start";
    // Never disabled on an empty field: the name has a fallback, and a Start button that
    // does nothing until something is typed is the screen refusing to begin the game.
    go.onclick = () => opts.onEnter(accounts.create(field.value));

    box.append(field, go);
    box.appendChild(el("p", "si-note",
      "This names your colony and keeps your progress on this device. You can rename it, "
      + "or move it to another phone with the save code, in Settings."));
    if (canGoBack) {
      const back = el("button", "si-alt") as HTMLButtonElement;
      back.type = "button";
      back.id = "signinBack";
      back.append(icon("back", 15), el("span", undefined, "Back to my colonies"));
      back.onclick = () => { creating = false; render(); };
      box.appendChild(back);
    }
    return box;
  };

  render();
  return root;
}
