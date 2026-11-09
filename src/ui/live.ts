import type { MailMessage, Mailbox, UpdateOffer } from "../platform/live";
import { agoOf } from "../platform";
import { el, screenEl, screenHeader } from "./chrome";

export function buildUpdatePrompt(
  offer: UpdateOffer, update: () => void, later: () => void,
): HTMLElement {
  const overlay = el("div", "overlay");
  overlay.id = "updateAvailable";
  const wrap = el("div", "overModalWrap");
  const card = el("div", "card live-update");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "updateTitle");
  const title = el("h1", undefined, "Update available");
  title.id = "updateTitle";
  card.append(title, el("p", "live-copy", offer.kind === "apk"
    ? "A newer version of Zombie Ants is ready. Install the update, then reopen the game."
    : "A newer version of Zombie Ants is ready. Reload to get the latest improvements."));
  const actions = el("div", "live-update-actions");
  const go = el("button", "cta", "Update");
  go.onclick = update;
  const dismiss = el("button", "ghostbtn", "Not now");
  dismiss.onclick = later;
  actions.append(go, dismiss);
  card.appendChild(actions);
  wrap.appendChild(card);
  overlay.appendChild(wrap);
  return overlay;
}

export interface InboxOptions {
  messages: readonly MailMessage[];
  mailbox: Mailbox;
  openId: string | null;
  busy: boolean;
  offline: boolean;
  onBack: () => void;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
}
export function buildInbox(options: InboxOptions): HTMLElement {
  const root = screenEl("inbox");
  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, { title: "Inbox", onBack: options.onBack });
    const body = el("div", "screenbody");
    const head = el("div", "mail-toolbar");
    head.appendChild(el("span", "live-copy", options.offline
      ? "Offline · showing saved mail" : "Messages from Zombie Ants"));
    const refresh = el("button", "ghostbtn", options.busy ? "Checking…" : "Refresh");
    refresh.disabled = options.busy;
    refresh.onclick = options.onRefresh;
    head.appendChild(refresh);
    body.appendChild(head);
    const list = el("div", "mail-list");
    if (!options.messages.length) {
      const empty = el("div", "card");
      empty.append(el("h2", undefined, "No mail yet"),
        el("p", "live-copy", "Announcements from the team will appear here."));
      list.appendChild(empty);
    }
    for (const message of options.messages) {
      const open = message.id === options.openId;
      const read = options.mailbox.hasRead(message.id);
      const card = el("article", "card mail-card" + (read && !open ? " read" : ""));
      card.dataset.message = message.id;
      const toggle = el("button", "mail-head");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(open));
      const meta = el("div", "mail-meta");
      if (!read) meta.appendChild(el("span", "newsnew", "New"));
      meta.appendChild(el("time", undefined, agoOf(message.sentAt)));
      toggle.append(meta, el("h2", undefined, message.title));
      toggle.onclick = () => {
        options.mailbox.markRead(message.id);
        options.openId = open ? null : message.id;
        options.onSelect(options.openId);
        render();
      };
      card.appendChild(toggle);
      if (open) {
        const content = el("div", "mail-body");
        for (const paragraph of message.body.split(/\n\s*\n/)) {
          content.appendChild(el("p", undefined, paragraph));
        }
        card.appendChild(content);
      }
      list.appendChild(card);
    }
    body.appendChild(list);
    root.appendChild(body);
  };
  render();
  return root;
}
