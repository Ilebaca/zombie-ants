/**
 * SUPPORT: the answers, and a way to say something back.
 *
 * What a support screen is actually FOR, in order of how often it is needed: the question
 * the player has is usually one somebody has already asked, so the FAQ leads; failing
 * that they want to tell you something, so a composer comes next; and whoever reads it
 * needs the build and a way to identify the save, so those are on the screen rather than
 * asked for in a reply.
 *
 * NOTHING IS POSTED ANYWHERE — there is no server (roadmap step 6). A Send button that
 * throws the text away would be worse than none, so a message is KEPT on the device and
 * the screen opens a mail link carrying the same text, the build and the player's code.
 * The player is told that plainly. `SupportGateway` is the seam a real endpoint slots into.
 */
import { BUILD, FAQ, SUPPORT_EMAIL, TICKET_KINDS, TICKET_MAX, mailLink } from "../platform";
import type { ProfileStore, SupportGateway, TicketKind } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export function buildSupport(
  store: ProfileStore, gateway: SupportGateway, onBack: () => void,
): HTMLElement {
  const root = screenEl("support");
  /** Which answer is open. One at a time — an accordion of eight open answers is a page. */
  let openQ = -1;
  let kind: TicketKind = "bug";
  /** Kept across renders: choosing a subject must not wipe what has been typed. */
  let draft = "";

  const render = (): void => {
    const profile = store.get();
    root.replaceChildren();
    screenHeader(root, { title: "Support", sub: "Answers & contact", onBack });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "spwrap");

    /* ------------------------------------------------------------------ THE FAQ */
    wrap.appendChild(el("div", "secthead", "Common questions"));
    const faq = el("div", "spfaq");
    FAQ.forEach((entry, i) => {
      const item = el("div", "spq" + (i === openQ ? " open" : ""));
      const ask = el("button", "spqhead");
      ask.type = "button";
      ask.setAttribute("aria-expanded", String(i === openQ));
      // One mark, turned. A left-pointing chevron on an open answer says "go back", and
      // there is no down chevron in the family — the stylesheet rotates this one.
      ask.append(el("span", "spqt", entry.q), icon("next", 13));
      ask.onclick = () => { openQ = openQ === i ? -1 : i; render(); };
      item.appendChild(ask);
      if (i === openQ) item.appendChild(el("p", "spqa", entry.a));
      faq.appendChild(item);
    });
    wrap.appendChild(faq);

    /* -------------------------------------------------------------- THE COMPOSER */
    wrap.appendChild(el("div", "secthead", "Tell us something"));
    const compose = el("div", "spbox");

    const kinds = el("div", "spkinds");
    for (const k of TICKET_KINDS) {
      const chip = el("button", "spkind" + (k.id === kind ? " on" : ""));
      chip.dataset.kind = k.id;
      chip.append(icon(k.icon, 14), el("span", undefined, k.label));
      chip.onclick = () => {
        // Read the box back first: choosing a subject must not throw away the message.
        draft = root.querySelector<HTMLTextAreaElement>("#spText")?.value ?? draft;
        kind = k.id;
        render();
      };
      kinds.appendChild(chip);
    }
    compose.appendChild(kinds);

    const box = el("textarea", "sptext") as HTMLTextAreaElement;
    box.id = "spText";
    box.rows = 4;
    box.maxLength = TICKET_MAX;
    box.value = draft;
    box.placeholder = kind === "bug"
      ? "What happened, and what were you doing when it did?"
      : kind === "idea" ? "What would you like to see?" : "What do you need a hand with?";
    box.setAttribute("aria-label", "Your message");
    compose.appendChild(box);

    const send = el("button", "cta spsend", "Send");
    send.id = "spSend";
    send.onclick = () => {
      const ticket = store.fileTicket(kind, box.value, gateway);
      if (!ticket) { toast(root, "Write something first", "bad"); return; }
      draft = "";
      // Kept first, THEN the mail app. If the link does not open — a browser with no mail
      // handler — the message is still saved rather than gone.
      openMail(mailLink(ticket));
      render();
      toast(root, "Saved. Your mail app has the rest.", "hive");
    };
    compose.appendChild(send);
    // Said plainly, because it is surprising: this build has nowhere to post to.
    compose.appendChild(el("p", "spnote",
      "Your message is kept on this device and opened in your mail app — there is no "
      + "server yet. It carries your build and player code so nothing has to be asked for."));
    wrap.appendChild(compose);

    /* ---------------------------------------------------------------- WHAT WAS SENT */
    if (profile.tickets.length) {
      wrap.appendChild(el("div", "secthead", "Your messages"));
      const sent = el("div", "spsent");
      for (const t of [...profile.tickets].reverse().slice(0, 5)) {
        const line = el("div", "spmsg");
        line.append(
          el("span", "spmsg-k", TICKET_KINDS.find((k) => k.id === t.kind)?.label ?? t.kind),
          el("span", "spmsg-t", t.text),
        );
        sent.appendChild(line);
      }
      wrap.appendChild(sent);
    }

    /* ------------------------------------------------------------------- CONTACT */
    wrap.appendChild(el("div", "secthead", "Reaching us"));
    const contact = el("div", "spbox");
    contact.append(
      factRow("support", "Email", SUPPORT_EMAIL),
      // The code is what matches a message to a save, and it is on the screen rather than
      // asked for in a reply — a player should never have to go hunting for one.
      factRow("crown", "Player code", profile.playerId),
      factRow("gear", "Build", BUILD),
    );
    wrap.appendChild(contact);

    body.appendChild(wrap);
    root.appendChild(body);
  };

  render();
  return root;
}

/** A labelled fact worth copying into an email: a mark, what it is, and the value. */
function factRow(mark: string, label: string, value: string): HTMLElement {
  const row = el("div", "spfact");
  const slot = el("span", "spfact-i");
  slot.appendChild(icon(mark, 16));
  row.append(slot, el("span", "spfact-k", label), el("span", "spfact-v", value));
  return row;
}

/**
 * Open a mail link without navigating the app away.
 *
 * A `mailto:` assigned to `location` leaves a browser with no mail handler sitting on a
 * blank page with the game gone; a link click is handled by the browser and falls through
 * harmlessly when there is nothing to handle it.
 */
function openMail(href: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
