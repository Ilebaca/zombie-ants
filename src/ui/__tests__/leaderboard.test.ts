/**
 * THE LADDER, IN TWO TABS.
 *
 * The screen was answering two questions with one table — how is my WEEK going, and how big
 * is my colony against everybody's — and answering neither. This holds the split: the week
 * tab is the league (a place, a score that is the week's gain, a prize and a clock), the
 * other is a plain list of every colony by size with its chapter, and the head of the screen
 * stays out of the scroller in both.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore, PAID_PLACES, ProfileStore, LEAGUE_SIZE, LEAGUES, leagueOf } from "../../platform";
import { buildLeaderboard, ordinal } from "../leaderboard";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const WEEK = 604_800_000;

const store = (colony: number, name = "Milan"): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.colony = colony; p.name = name; });
  return s;
};

const build = (s: ProfileStore): HTMLElement => {
  const root = buildLeaderboard(s, () => {});
  document.body.replaceChildren(root);
  return root;
};

const tab = (root: HTMLElement, label: string): void => {
  Array.from(root.querySelectorAll<HTMLButtonElement>(".lbtab"))
    .find((b) => b.textContent === label)?.click();
};

const rows = (root: HTMLElement): Element[] =>
  Array.from(document.querySelectorAll(".lbrow"));

describe("the two tabs", () => {
  it("opens on the week and can be switched to the whole list", () => {
    const root = build(store(24_000));
    expect(root.querySelector(".lbtab.on")?.textContent).toBe("This week");
    tab(root, "Biggest colonies");
    expect(document.querySelector(".lbtab.on")?.textContent).toBe("Biggest colonies");
    tab(document.body.firstElementChild as HTMLElement, "This week");
    expect(document.querySelector(".lbtab.on")?.textContent).toBe("This week");
  });

  /**
   * THE HEAD DOES NOT SCROLL. It was inside the one scroller the player's own row is
   * brought into view within, so arriving at the screen scrolled it away.
   */
  it("keeps the banner and the tabs out of the scrolling table", () => {
    const root = build(store(24_000));
    for (const label of ["This week", "Biggest colonies"]) {
      tab(document.body.firstElementChild as HTMLElement, label);
      const list = document.querySelector(".lblist");
      expect(list, `no table on ${label}`).toBeTruthy();
      expect(list?.querySelector(".lbbanner"), `the banner scrolls on ${label}`).toBeNull();
      expect(list?.querySelector(".lbtabs"), `the tabs scroll on ${label}`).toBeNull();
      expect(document.querySelector(".lbtop .lbbanner")).toBeTruthy();
    }
    expect(root).toBeTruthy();
  });
});

describe("this week", () => {
  it("seats fifty colonies and says where the player stands in words", () => {
    const root = build(store(24_000));
    const list = rows(root);
    expect(list.length).toBe(LEAGUE_SIZE);
    const rank = list.findIndex((r) => r.classList.contains("you")) + 1;
    expect(root.querySelector(".lbstand")?.textContent)
      .toBe(`You are ${ordinal(rank)} of ${LEAGUE_SIZE}`);
  });

  it("names the league the colony's size puts it in, with its chapters", () => {
    const root = build(store(24_000));
    expect(root.querySelector(".lbname")?.textContent).toBe(LEAGUES[leagueOf(24_000)]?.name);
    expect(root.querySelector(".lbrange")?.textContent).toMatch(/chapters? \d/);
  });

  // The score is the week's GAIN, and the whole point of it: ranking by total troops would
  // rank by how long somebody has played.
  it("shows the week's gain, and prints a losing week as a loss", () => {
    const up = store(24_000);
    up.season(Date.now());
    up.update((p) => { p.colony = 31_000; });
    expect(build(up).querySelector(".lbgain")?.textContent).toContain("+7K troops this week");

    const down = store(24_000);
    down.season(Date.now());
    down.update((p) => { p.colony = 21_500; });
    const root = build(down);
    expect(root.querySelector(".lbgain")?.textContent).toContain("−2.5K");
    expect(root.querySelector(".lbgain")?.className).toContain("down");
  });

  it("marks the paid places and says what finishing there is worth", () => {
    const root = build(store(24_000));
    const paid = rows(root).filter((r) => r.classList.contains("paid"));
    expect(paid.length).toBe(PAID_PLACES);
    expect(rows(root).slice(0, PAID_PLACES).every((r) => r.classList.contains("paid"))).toBe(true);
    expect(root.querySelector(".lbnext")?.textContent).toMatch(/pays|places to a prize/);
  });

  /**
   * HOW FAR THE PRIZE IS, counted the right way round. It was places-left-in-the-paid-ten,
   * which is only positive for somebody already being paid — everybody else was told they
   * were "−27 places to a prize".
   */
  it("counts the climb to a prize forwards, never as a negative", () => {
    const root = build(store(24_000));
    const next = root.querySelector(".lbnext")?.textContent ?? "";
    expect(next).not.toContain("−");
    expect(next).not.toMatch(/-\d/);
    const list = rows(root);
    const rank = list.findIndex((r) => r.classList.contains("you")) + 1;
    if (rank > PAID_PLACES) expect(next).toContain(`${rank - PAID_PLACES} place`);
    else expect(next).toMatch(/^Finishing here pays /);
  });

  it("says how long the season has left", () => {
    expect(build(store(24_000)).querySelector(".lbclock")?.textContent).toMatch(/\d+[dhm]/);
  });

  it("marks only the top three places", () => {
    const root = build(store(24_000));
    const ranks = Array.from(root.querySelectorAll(".lbrank"));
    expect(ranks[0]?.className).toContain("gold");
    expect(ranks[1]?.className).toContain("silver");
    expect(ranks[2]?.className).toContain("bronze");
    for (const r of ranks.slice(3)) expect(r.className).toBe("lbrank");
  });

  it("gives every row a face", () => {
    for (const r of rows(build(store(24_000)))) {
      expect(r.querySelector(".lbface canvas"), r.textContent).toBeTruthy();
    }
  });
});

/**
 * A season that paid out and said nothing is a reward the player never sees arrive — and
 * one that appears on every open is a reward that pays twice.
 */
describe("the week that ended", () => {
  const settled = (colony: number, grown: number): ProfileStore => {
    const s = store(colony);
    const lastWeek = Math.floor(Date.now() / WEEK) - 1;
    s.update((p) => {
      p.season = { week: lastWeek, startColony: colony, league: leagueOf(colony) };
    });
    s.update((p) => { p.colony = grown; });
    return s;
  };

  it("announces last week's placing on the first open and not the second", () => {
    const s = settled(24_000, 1e9);
    const root = build(s);
    expect(root.querySelector(".lblast")).toBeTruthy();
    expect(root.querySelector(".lblastplace")?.textContent).toContain("1st of 50");
    expect(root.querySelector(".lblastprize")?.textContent).toMatch(/^Paid /);
    expect(build(s).querySelector(".lblast"), "announced twice").toBeNull();
  });

  // "you were not paid" is information; a banner that only ever appears on a win teaches a
  // player to expect one.
  it("still says something when the week paid nothing", () => {
    const root = build(settled(24_000, 24_000));
    expect(root.querySelector(".lblastprize")?.textContent).toContain(`Top ${PAID_PLACES}`);
  });
});

describe("biggest colonies", () => {
  it("lists every colony by size with the chapter it has reached", () => {
    const root = build(store(24_000));
    tab(root, "Biggest colonies");
    const list = rows(root);
    expect(list.length).toBeGreaterThan(50);
    for (const r of list) expect(r.querySelector(".lbch")?.textContent).toMatch(/^Chapter \d+$/);
    expect(document.querySelector(".lbrow.you")).toBeTruthy();
  });

  // "no reward or weekly thing it just listing."
  it("promises no prize and no reset", () => {
    const root = build(store(24_000));
    tab(root, "Biggest colonies");
    const text = document.querySelector(".lbbody")?.textContent ?? "";
    expect(text).not.toMatch(/prize|pays|left/i);
    expect(document.querySelector(".lbclock")).toBeNull();
    expect(document.querySelector(".lbrow.paid")).toBeNull();
  });

  /**
   * Nothing may claim a simulation is other people (§ WHAT THE TWO STORES REQUIRE). There
   * is no server, so both tabs say where these colonies come from.
   */
  it("says the other colonies are generated on the device", () => {
    const root = build(store(24_000));
    for (const label of ["This week", "Biggest colonies"]) {
      tab(document.body.firstElementChild as HTMLElement, label);
      expect(document.querySelector(".lbnote")?.textContent, label)
        .toMatch(/generated on your device/);
    }
    expect(root).toBeTruthy();
  });
});

describe("ordinals", () => {
  it("reads as a placing", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal))
      .toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"]);
  });
});
