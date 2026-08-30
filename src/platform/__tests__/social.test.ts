/**
 * NEWS, FRIENDS AND SUPPORT — the models behind the three screens.
 *
 * Nobody is really out there and nothing is really posted: there is no server. What is
 * tested is the part that will still be true when there is — that a request cannot end up
 * in two states at once, that the directory is stable, and that a message a player wrote
 * is never thrown away.
 */
import { describe, expect, it } from "vitest";
import {
  FAQ, FRIEND_MAX, LocalFriendService, LocalSupportGateway, MemoryStore, NEWS, ProfileStore,
  SUPPORT_EMAIL, agoOf, directory, mailLink, newsFeed, newsLatestAt, personId, seedRequests,
  unreadNews,
} from "../index";
import type { Person } from "../index";
import { SPECIES } from "../../engine";

const DAY = 86_400_000;
const store = (): ProfileStore => new ProfileStore(new MemoryStore());
const somebody = (n = 0): Person => directory()[n] as Person;

/* --------------------------------------------------------------------------- NEWS */

describe("the news feed", () => {
  it("reads newest first", () => {
    const feed = newsFeed();
    expect(feed.length).toBe(NEWS.length);
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i]!.at).toBeLessThanOrEqual(feed[i - 1]!.at);
    }
  });

  it("gives every post a stable id, a picture and something to read", () => {
    expect(new Set(NEWS.map((p) => p.id)).size).toBe(NEWS.length);
    for (const p of NEWS) {
      expect(p.title.length, p.id).toBeGreaterThan(3);
      expect(p.lead.length, p.id).toBeGreaterThan(10);
      expect(p.body.length, p.id).toBeGreaterThan(0);
      expect(["board", "mark"]).toContain(p.art.kind);
    }
  });

  it("counts what landed after the player last looked", () => {
    expect(unreadNews(0)).toBe(NEWS.length);
    expect(unreadNews(newsLatestAt())).toBe(0);
  });

  it("marks the feed read up to its newest post", () => {
    const s = store();
    expect(s.unread()).toBe(NEWS.length);
    s.markNewsRead();
    expect(s.unread()).toBe(0);
    expect(s.get().newsSeen).toBe(newsLatestAt());
  });

  // A date only says whether a post is new to a reader who knows today's date.
  it("dates a post by how long ago it was", () => {
    const now = Date.now();
    expect(agoOf(now, now)).toBe("Today");
    expect(agoOf(now - DAY, now)).toBe("Yesterday");
    expect(agoOf(now - 4 * DAY, now)).toBe("4 days ago");
    expect(agoOf(now - 21 * DAY, now)).toBe("3 weeks ago");
    expect(agoOf(now - 300 * DAY, now)).toBe("10 months ago");
  });
});

/* ------------------------------------------------------------------------ FRIENDS */

describe("the directory", () => {
  it("is the same every time it is read", () => {
    const a = directory(), b = directory();
    expect(a.map((p) => p.id + p.colony)).toEqual(b.map((p) => p.id + p.colony));
  });

  it("gives everybody a unique id and a colony a player could actually meet", () => {
    const all = directory();
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const p of all) {
      expect(p.id).toBe(personId(p.name));
      expect(p.colony).toBeGreaterThan(0);
      // A premium colony in the directory is a shop window, not a player.
      expect(SPECIES[p.species]?.premium, p.name).toBeFalsy();
    }
  });

  it("searches anywhere in a name, not only the start", async () => {
    const hits = await new LocalFriendService().search("ndib");
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.name.toLowerCase()).toContain("ndib");
  });

  // Before anything is typed the screen still has to show something.
  it("returns the biggest colonies for an empty query", async () => {
    const hits = await new LocalFriendService().search("");
    expect(hits.length).toBeGreaterThan(3);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.colony).toBeLessThanOrEqual(hits[i - 1]!.colony);
    }
  });

  it("finds nobody rather than everybody for nonsense", async () => {
    expect(await new LocalFriendService().search("zzqqxx")).toEqual([]);
  });
});

describe("requests", () => {
  it("arrives with two, so accept and decline are reachable", () => {
    expect(seedRequests().length).toBe(2);
    expect(store().get().friendsIn.length).toBe(2);
  });

  it("sends, and reports where a person stands", () => {
    const s = store();
    const p = somebody(3);
    expect(s.friendship(p.id)).toBe("none");
    expect(s.sendFriendRequest(p)).toBe(true);
    expect(s.friendship(p.id)).toBe("sent");
    expect(s.get().friendsOut.map((f) => f.id)).toEqual([p.id]);
  });

  it("refuses to ask the same colony twice", () => {
    const s = store();
    const p = somebody(3);
    s.sendFriendRequest(p);
    expect(s.sendFriendRequest(p)).toBe(false);
    expect(s.get().friendsOut.length).toBe(1);
  });

  it("refuses to befriend yourself", () => {
    const s = store();
    const me = { id: s.get().playerId, name: "Me", colony: 40, species: "fire" as const };
    expect(s.sendFriendRequest(me)).toBe(false);
  });

  // Two people tapping Add on each other should end up friends, not with a request each.
  it("accepts instead of sending back when they already asked you", () => {
    const s = store();
    const asked = s.get().friendsIn[0] as Person;
    expect(s.sendFriendRequest(asked)).toBe(true);
    expect(s.friendship(asked.id)).toBe("friend");
    expect(s.get().friendsIn.some((f) => f.id === asked.id)).toBe(false);
    expect(s.get().friendsOut.some((f) => f.id === asked.id)).toBe(false);
  });

  it("accepts one and declines the other, and neither comes back", () => {
    const s = store();
    const [a, b] = s.get().friendsIn as [Person, Person];
    expect(s.acceptFriend(a.id, 1000)).toBe(true);
    expect(s.declineFriend(b.id)).toBe(true);
    expect(s.get().friendsIn).toEqual([]);
    expect(s.get().friends.map((f) => f.id)).toEqual([a.id]);
    expect(s.get().friends[0]?.since).toBe(1000);
    // Neither can be acted on twice.
    expect(s.acceptFriend(a.id)).toBe(false);
    expect(s.declineFriend(b.id)).toBe(false);
  });

  it("cancels a request it sent", () => {
    const s = store();
    const p = somebody(5);
    s.sendFriendRequest(p);
    expect(s.cancelFriendRequest(p.id)).toBe(true);
    expect(s.friendship(p.id)).toBe("none");
    expect(s.cancelFriendRequest(p.id)).toBe(false);
  });

  it("removes a friend, and only one that is there", () => {
    const s = store();
    const p = s.get().friendsIn[0] as Person;
    s.acceptFriend(p.id);
    expect(s.removeFriend(p.id)).toBe(true);
    expect(s.get().friends).toEqual([]);
    expect(s.removeFriend(p.id)).toBe(false);
  });

  it("stops at the cap rather than growing forever", () => {
    const s = store();
    s.update((d) => {
      d.friends = directory().slice(0, FRIEND_MAX).map((p) => ({ ...p, since: 0 }));
    });
    expect(s.sendFriendRequest(somebody(FRIEND_MAX + 1))).toBe(false);
  });
});

describe("a save that has been tampered with", () => {
  it("drops a malformed friend rather than putting undefined on the screen", () => {
    const s = store();
    s.update((d) => {
      d.friends = [
        { id: "p:ok", name: "Fine", colony: 900, species: "fire", since: 5 },
        { id: "p:bad" } as never,
        null as never,
        { id: "p:ghost", name: "Nope", colony: 1, species: "notaspecies", since: 0 } as never,
      ];
    });
    expect(s.get().friends.map((f) => f.id)).toEqual(["p:ok"]);
  });
});

/* ------------------------------------------------------------------------ SUPPORT */

describe("support", () => {
  it("asks the questions this game actually raises, and answers them", () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(6);
    for (const e of FAQ) {
      expect(e.q.endsWith("?") || e.q.endsWith("."), e.q).toBe(true);
      expect(e.a.length, e.q).toBeGreaterThan(60);
    }
  });

  it("mints a player code that can be read off a screen and typed", () => {
    const id = store().get().playerId;
    expect(id).toMatch(/^ZA-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    // No characters a reader would confuse: no O against 0, no I against 1.
    expect(id.slice(3)).not.toMatch(/[O0I1]/);
  });

  it("keeps the code across a reload", () => {
    const disk = new MemoryStore();
    const id = new ProfileStore(disk).get().playerId;
    expect(new ProfileStore(disk).get().playerId).toBe(id);
  });

  // A Send button that throws the text away is worse than no button.
  it("keeps a message, with the build and the code needed to answer it", () => {
    const s = store();
    const t = s.fileTicket("bug", "  the board went blank  ", new LocalSupportGateway());
    expect(t?.text).toBe("the board went blank");
    expect(t?.player).toBe(s.get().playerId);
    expect(t?.build).toBeTruthy();
    expect(s.get().tickets.length).toBe(1);
  });

  it("files nothing for an empty message", () => {
    const s = store();
    expect(s.fileTicket("idea", "   ", new LocalSupportGateway())).toBeNull();
    expect(s.get().tickets).toEqual([]);
  });

  // The build and the code go in the body rather than being asked for in a reply.
  it("writes a mail link carrying everything an answer needs", () => {
    const s = store();
    const t = s.fileTicket("bug", "it broke", new LocalSupportGateway());
    const link = mailLink(t!);
    expect(link.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    expect(decodeURIComponent(link)).toContain("it broke");
    expect(decodeURIComponent(link)).toContain(t!.build);
    expect(decodeURIComponent(link)).toContain(t!.player);
  });
});
