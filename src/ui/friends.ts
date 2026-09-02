/**
 * FRIENDS: the list, the requests, and finding somebody.
 *
 * Three tabs, because the three do different jobs and stacking them down one page buries
 * the requests — the one part of the screen that is waiting on the player — under a list
 * that only grows. The tab with something waiting carries a count, so the screen says what
 * it needs before it is opened.
 *
 * NOBODY IS REALLY OUT THERE. The directory is generated and a request never leaves the
 * device (platform/friends.ts), and the screen is built as though it did: the search is
 * async, a sent request sits as "Asked", and the two requests a new colony arrives to can
 * be accepted or turned down. When the server exists, `FriendService` gets a real
 * implementation and this file does not change.
 */
import { FRIEND_MAX, compact } from "../platform";
import type { Friend, FriendService, Person, ProfileStore } from "../platform";
import { antPortrait, el, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

type Tab = "list" | "requests" | "find";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "list", label: "Friends" },
  { id: "requests", label: "Requests" },
  { id: "find", label: "Find" },
];

export function buildFriends(
  store: ProfileStore, service: FriendService, onBack: () => void,
): HTMLElement {
  const root = screenEl("friends");
  let tab: Tab = "list";
  let query = "";
  let results: Person[] = [];
  /** Kept so a re-render after a tap does not throw the search away. */
  let searched = false;

  const render = (): void => {
    const profile = store.get();
    redraw(root);
    screenHeader(root, { title: "Friends", sub: "Your colonies", onBack });

    const body = el("div", "screenbody sb-top frbody");

    const bar = el("div", "frtabs");
    for (const t of TABS) {
      const btn = el("button", "frtab" + (t.id === tab ? " on" : ""), t.label);
      btn.dataset.tab = t.id;
      // The count goes on the tab, not inside it: a request waiting is the reason to open
      // this screen at all, and it has to be visible from the tab row.
      if (t.id === "requests" && profile.friendsIn.length) {
        btn.appendChild(el("span", "frbadge", String(profile.friendsIn.length)));
      }
      btn.onclick = () => { tab = t.id; render(); };
      bar.appendChild(btn);
    }
    body.appendChild(bar);

    const panel = el("div", "frpanel");
    if (tab === "list") listPanel(panel, store, render, root);
    else if (tab === "requests") requestPanel(panel, store, render, root);
    else findPanel(panel);
    body.appendChild(panel);
    root.appendChild(body);
  };

  /** The search: a field, and whatever it last returned. */
  const findPanel = (panel: HTMLElement): void => {
    const form = el("div", "frsearch");
    const field = el("input", "frfield") as HTMLInputElement;
    field.type = "search";
    field.id = "frQuery";
    field.placeholder = "Search colonies";
    field.maxLength = 18;
    field.value = query;
    field.setAttribute("aria-label", "Search colonies");

    const run = (): void => {
      query = field.value;
      void service.search(query).then((hits) => {
        results = hits;
        searched = true;
        render();
        // The field is rebuilt by the render, so the caret is put back where it was.
        const again = root.querySelector<HTMLInputElement>("#frQuery");
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      });
    };
    field.onkeydown = (e: KeyboardEvent): void => { if (e.key === "Enter") run(); };

    const go = el("button", "frgo");
    go.id = "frSearch";
    go.setAttribute("aria-label", "Search");
    go.appendChild(icon("next", 16));
    go.onclick = run;
    form.append(field, go);
    panel.appendChild(form);

    if (!searched) {
      panel.appendChild(hint("Search for a colony by name, or press search to see the "
        + "largest ones."));
      return;
    }
    if (!results.length) {
      panel.appendChild(hint(`No colony matches "${query}".`));
      return;
    }
    const list = el("div", "frlist");
    for (const person of results) list.appendChild(findRow(person, store, render, root));
    panel.appendChild(list);
  };

  render();
  return root;
}

/* --------------------------------------------------------------------- THE PANELS */

function listPanel(
  panel: HTMLElement, store: ProfileStore, render: () => void, root: HTMLElement,
): void {
  const friends = [...store.get().friends].sort((a, b) => b.colony - a.colony);
  if (!friends.length) {
    panel.appendChild(hint("No friends yet. Find a colony and ask — they show up here "
      + "once they accept."));
    return;
  }
  panel.appendChild(el("div", "secthead", `${friends.length} of ${FRIEND_MAX}`));
  const list = el("div", "frlist");
  for (const friend of friends) list.appendChild(friendRow(friend, store, render, root));
  panel.appendChild(list);
}

function requestPanel(
  panel: HTMLElement, store: ProfileStore, render: () => void, root: HTMLElement,
): void {
  const profile = store.get();
  if (!profile.friendsIn.length && !profile.friendsOut.length) {
    panel.appendChild(hint("Nothing waiting. Requests you send and receive show up here."));
    return;
  }
  if (profile.friendsIn.length) {
    panel.appendChild(el("div", "secthead", "Asking to join you"));
    const list = el("div", "frlist");
    for (const person of profile.friendsIn) {
      list.appendChild(incomingRow(person, store, render, root));
    }
    panel.appendChild(list);
  }
  if (profile.friendsOut.length) {
    panel.appendChild(el("div", "secthead", "You asked"));
    const list = el("div", "frlist");
    for (const person of profile.friendsOut) {
      list.appendChild(outgoingRow(person, store, render, root));
    }
    panel.appendChild(list);
  }
}

/* ----------------------------------------------------------------------- THE ROWS */

/** The shell every row shares: a face, a name and a colony, then whatever acts. */
function personRow(person: Person, sub: string): HTMLElement {
  const row = el("div", "frrow");
  row.dataset.person = person.id;
  const face = el("div", "frface");
  face.appendChild(antPortrait(person.species, 72));
  const mid = el("div", "frmid");
  mid.append(el("div", "frname", person.name), el("div", "frsub", sub));
  row.append(face, mid);
  return row;
}

function findRow(
  person: Person, store: ProfileStore, render: () => void, root: HTMLElement,
): HTMLElement {
  const row = personRow(person, `${compact(person.colony)} troops`);
  const state = store.friendship(person.id);
  if (state === "friend") {
    row.appendChild(el("span", "frstate", "Friends"));
  } else if (state === "sent") {
    const undo = el("button", "frbtn frghost", "Asked");
    undo.onclick = () => {
      store.cancelFriendRequest(person.id);
      render();
    };
    row.appendChild(undo);
  } else {
    const add = el("button", "frbtn", "Add");
    add.onclick = () => {
      if (!store.sendFriendRequest(person)) {
        toast(root, "Your list is full", "bad");
        return;
      }
      render();
      toast(root, `Asked ${person.name}`, "hive");
    };
    row.appendChild(add);
  }
  return row;
}

function incomingRow(
  person: Person, store: ProfileStore, render: () => void, root: HTMLElement,
): HTMLElement {
  const row = personRow(person, `${compact(person.colony)} troops`);
  const pair = el("div", "frpair");
  const yes = el("button", "frbtn", "Accept");
  yes.onclick = () => {
    if (!store.acceptFriend(person.id)) {
      toast(root, "Your list is full", "bad");
      return;
    }
    render();
    toast(root, `${person.name} joined you`, "hive");
  };
  const no = el("button", "frbtn frghost", "Decline");
  no.onclick = () => { store.declineFriend(person.id); render(); };
  pair.append(yes, no);
  row.appendChild(pair);
  return row;
}

function outgoingRow(
  person: Person, store: ProfileStore, render: () => void, _root: HTMLElement,
): HTMLElement {
  const row = personRow(person, `${compact(person.colony)} troops`);
  const undo = el("button", "frbtn frghost", "Cancel");
  undo.onclick = () => { store.cancelFriendRequest(person.id); render(); };
  row.appendChild(undo);
  return row;
}

/**
 * A friend, with the one control that can go wrong on the screen.
 *
 * Removing asks twice on the same button, the way Settings' reset does: a confirm dialog
 * for one row would be an overlay over a list, and an accidental tap in a list of fifty is
 * exactly the thing to guard.
 */
function friendRow(
  friend: Friend, store: ProfileStore, render: () => void, root: HTMLElement,
): HTMLElement {
  const row = personRow(friend, `${compact(friend.colony)} troops`);
  const drop = el("button", "frbtn frghost", "Remove");
  let armed = false;
  drop.onclick = () => {
    if (!armed) {
      armed = true;
      drop.textContent = "Sure?";
      drop.classList.add("armed");
      return;
    }
    store.removeFriend(friend.id);
    render();
    toast(root, `Removed ${friend.name}`, "bad");
  };
  row.appendChild(drop);
  return row;
}

/** What an empty panel says. Never nothing: a blank panel reads as a broken one. */
const hint = (text: string): HTMLElement => el("p", "frhint", text);
