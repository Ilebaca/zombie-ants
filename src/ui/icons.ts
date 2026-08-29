/**
 * ONE ICON FAMILY.
 *
 * Everything outside the board used to be drawn with emoji — a cart, a plant pot, a dartboard
 * and a house in the same row of tabs, each from a different illustrator, at a different
 * weight, rendered differently on every platform. Nothing else makes an interface look
 * unconsidered so quickly, and no amount of work on the surfaces around them helps while
 * they are there.
 *
 * These are solid shapes on a 24 grid, drawn in `currentColor`, so a tab, a chip and a
 * button all get the same mark in whatever colour the thing around them is using. Solid
 * rather than stroked: at 20px on a phone a hairline outline turns to grey mush, and this is
 * a game rather than a settings app.
 *
 * The emoji that remain are ILLUSTRATION, not chrome — the ant portraits, a product's
 * artwork — where a big coloured picture is the point.
 */
const PATHS: Record<string, string | string[]> = {
  /* ------------------------------------------------------------- navigation */
  home: "M12 2.4 1.6 11.2l1.7 2L5 11.7V20a2 2 0 0 0 2 2h3v-6h4v6h3a2 2 0 0 0 2-2v-8.3l1.7 1.5 1.7-2z",
  shop: "M2 3a1 1 0 0 0 0 2h1.6l2.5 9.6A3 3 0 0 0 9 16.8h8.3a3 3 0 0 0 2.9-2.2L22 8.2A1 1 0 0 0 21 7H6.6l-.7-2.8A1.6 1.6 0 0 0 4.3 3zM9 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4m8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  /* A mound with the entrance cut out of it — the hole is a second subpath, which
     `fill-rule="evenodd"` turns into a real hole rather than a second lump. */
  anthill: [
    "M12 4.6c4.8 0 9 5.5 11.1 13.8a1 1 0 0 1-1 1.2H1.9a1 1 0 0 1-1-1.2C3 10.1 7.2 4.6 12 4.6",
    "M12 8.9c-2.1 0-3.8 1.2-3.8 2.7s1.7 2.7 3.8 2.7 3.8-1.2 3.8-2.7S14.1 8.9 12 8.9",
  ],
  /* The collection is a collection of ANTS. Three body segments and a pair of antennae
     read as one at 23px in a way a plant pot never did. */
  antarium: [
    "M8 17.7a4 4.4 0 1 0 8 0 4 4.4 0 1 0-8 0",
    "M9.3 11.3a2.7 2.9 0 1 0 5.4 0 2.7 2.9 0 1 0-5.4 0",
    "M8.8 6.2a3.2 2.9 0 1 0 6.4 0 3.2 2.9 0 1 0-6.4 0",
    "M10.2 4.6 6.8 1.2l1.2-1.2 3.4 3.4z",
    "M13.8 4.6 17.2 1.2l1.2 1.2-3.4 3.4z",
    "M6.2 10.2 2.8 8.4l.7-1.3 3.4 1.8zm11.6 0 3.4-1.8.7 1.3-3.4 1.8z",
  ],
  challenges: "M12 1.6a10.4 10.4 0 1 0 0 20.8 10.4 10.4 0 0 0 0-20.8m0 3.2a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4m0 3.2a4 4 0 1 0 0 8 4 4 0 0 0 0-8",

  /* --------------------------------------------------------------- currency */
  trophy: "M6 3h12a1 1 0 0 1 1 1v1h2.4a1 1 0 0 1 1 1.1c-.3 2.8-2 5-4.6 5.6A6.5 6.5 0 0 1 13 15.4V18h2.5a1 1 0 0 1 1 1v1.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V19a1 1 0 0 1 1-1H11v-2.6a6.5 6.5 0 0 1-4.8-3.7C3.6 11.1 1.9 8.9 1.6 6.1A1 1 0 0 1 2.6 5H5V4a1 1 0 0 1 1-1M5 7.2H3.9C4.3 8.5 5 9.5 6 10.1a10 10 0 0 1-1-2.9m14 0c-.1 1-.4 2-.9 2.9 1-.6 1.7-1.6 2-2.9z",
  mycel: [
    "M12 2.4c5.2 0 9.4 3.4 9.4 6.9 0 .9-.8 1.6-1.8 1.6H4.4c-1 0-1.8-.7-1.8-1.6 0-3.5 4.2-6.9 9.4-6.9",
    "M9.6 12.3h4.8v6.3a2.4 2.4 0 0 1-4.8 0z",
  ],
  pheromone: "M12 1.8c.5 0 .9.3 1 .7l2.9 8.7a7.2 7.2 0 1 1-7.8 0l2.9-8.7c.1-.4.5-.7 1-.7m0 8.4a5 5 0 1 0 0 10 5 5 0 0 0 0-10",

  /* ------------------------------------------------------------------- chips */
  /* One sword stood on its point: a blade, a guard, a grip. Two crossed ones turn to
     scribble below about 28px, which is every place this is used. */
  attack: [
    "M12 1.2 15.2 8v8.6H8.8V8z",
    "M5.6 16.9h12.8a1 1 0 0 1 0 2.4H5.6a1 1 0 0 1 0-2.4",
    "M10.6 19.8h2.8v2.4a1.4 1.4 0 0 1-2.8 0z",
  ],
  defence: "M12 1.8 3.6 4.9a1 1 0 0 0-.7 1v6.3c0 4.4 3.5 8.2 9.1 10 5.6-1.8 9.1-5.6 9.1-10V5.9a1 1 0 0 0-.7-1z",
  clock: "M12 1.9a10.1 10.1 0 1 0 0 20.2 10.1 10.1 0 0 0 0-20.2m1 4.4v5.3l3.9 2.4-1 1.7-4.9-3V6.3z",
  lock: "M12 1.9a4.9 4.9 0 0 0-4.9 4.9V9H6.4A2.4 2.4 0 0 0 4 11.4v8.2A2.4 2.4 0 0 0 6.4 22h11.2a2.4 2.4 0 0 0 2.4-2.4v-8.2A2.4 2.4 0 0 0 17.6 9h-.7V6.8A4.9 4.9 0 0 0 12 1.9m0 2.4a2.5 2.5 0 0 1 2.5 2.5V9h-5V6.8A2.5 2.5 0 0 1 12 4.3",
  star: "m12 1.9 3.1 6.3 7 1-5 4.9 1.2 6.9-6.3-3.3-6.3 3.3L6.9 14l-5-4.9 7-1z",
  gift: "M11 8V6.4a3.2 3.2 0 1 0-3.2 3.2H11zm2 0h3.2A3.2 3.2 0 1 0 13 6.4zm-3.4-.4a1.2 1.2 0 1 1 1.2-1.2v1.2zm4.8 0V6.4a1.2 1.2 0 1 1 1.2 1.2zM2.6 10.6A1 1 0 0 1 3.6 10H11v4H2.6zM13 10h7.4a1 1 0 0 1 1 .6V14H13zM3.4 16H11v6H5.4a2 2 0 0 1-2-2zm9.6 0h7.6v4a2 2 0 0 1-2 2H13z",
  crown: "M2.6 7.4a1.4 1.4 0 0 1 2.2-1.2l3.5 2.4 2.5-4.9a1.4 1.4 0 0 1 2.4 0l2.5 4.9 3.5-2.4a1.4 1.4 0 0 1 2.2 1.4l-2.2 8.7a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8zM5.4 19.4h13.2a1 1 0 0 1 1 1v.6a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1v-.6a1 1 0 0 1 1-1",
  brood: ["M12 1.8c4.1 0 7.2 5.2 7.2 9.9a7.2 7.2 0 1 1-14.4 0C4.8 7 7.9 1.8 12 1.8",
          "M9.4 8.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2"],
  leaf: "M20.6 3.4C11.9 2.6 4 6.8 4 14.4c0 1.6.4 3 1.1 4.3l3.3-3.3a1 1 0 1 1 1.4 1.4l-3.3 3.3a8.4 8.4 0 0 0 4.3 1.1c7.6 0 11.8-7.9 11-16.6a1.2 1.2 0 0 0-1.2-1.2",
  flask: "M9.4 2h5.2a1 1 0 0 1 0 2H14v4.6l5.7 9.9A2 2 0 0 1 18 21.5H6a2 2 0 0 1-1.7-3L10 8.6V4h-.6a1 1 0 0 1 0-2m2.6 2v5.2L8.4 15.4h7.2L12 9.2z",

  /* ------------------------------------------------------------------ action */
  menu: "M3.4 5.6h17.2a1.4 1.4 0 0 1 0 2.8H3.4a1.4 1.4 0 0 1 0-2.8m0 5h17.2a1.4 1.4 0 0 1 0 2.8H3.4a1.4 1.4 0 0 1 0-2.8m0 5h17.2a1.4 1.4 0 0 1 0 2.8H3.4a1.4 1.4 0 0 1 0-2.8",
  back: "M14.6 3.6a1.4 1.4 0 0 1 0 2L8.2 12l6.4 6.4a1.4 1.4 0 0 1-2 2l-7.4-7.4a1.4 1.4 0 0 1 0-2l7.4-7.4a1.4 1.4 0 0 1 2 0",
  next: "M9.4 3.6a1.4 1.4 0 0 0 0 2l6.4 6.4-6.4 6.4a1.4 1.4 0 0 0 2 2l7.4-7.4a1.4 1.4 0 0 0 0-2L11.4 3.6a1.4 1.4 0 0 0-2 0",
  plus: "M12 3.6a1.4 1.4 0 0 1 1.4 1.4v5.6H19a1.4 1.4 0 0 1 0 2.8h-5.6V19a1.4 1.4 0 0 1-2.8 0v-5.6H5a1.4 1.4 0 0 1 0-2.8h5.6V5A1.4 1.4 0 0 1 12 3.6",
  check: "M20.3 5.7a1.4 1.4 0 0 1 0 2L10.2 17.8a1.4 1.4 0 0 1-2 0l-4.5-4.5a1.4 1.4 0 1 1 2-2l3.5 3.5 9.1-9.1a1.4 1.4 0 0 1 2 0",
  calendar: "M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.4A2.6 2.6 0 0 1 22 6.6v12.8A2.6 2.6 0 0 1 19.4 22H4.6A2.6 2.6 0 0 1 2 19.4V6.6A2.6 2.6 0 0 1 4.6 4H6V3a1 1 0 0 1 1-1M4 10v9.4c0 .3.3.6.6.6h14.8c.3 0 .6-.3.6-.6V10zm3 2.6h2.4V15H7zm4.8 0h2.4V15h-2.4zm4.8 0H19V15h-2.4z",
  book: "M4 3.4A2.4 2.4 0 0 1 6.4 1h4.4a2.4 2.4 0 0 1 1.2.3A2.4 2.4 0 0 1 13.2 1h4.4A2.4 2.4 0 0 1 20 3.4V18a1 1 0 0 1-1 1h-5.5a1.5 1.5 0 0 0-1.5 1.5 1 1 0 0 1-2 0A1.5 1.5 0 0 0 8.5 19H3a1 1 0 0 1-1-1V3.4A2.4 2.4 0 0 1 4 3.4m7 2A1.4 1.4 0 0 0 9.6 4H6.4A.4.4 0 0 0 6 4.4V17h2.5c.9 0 1.8.3 2.5.8zm2 12.4c.7-.5 1.6-.8 2.5-.8H18V4.4a.4.4 0 0 0-.4-.4h-3.2A1.4 1.4 0 0 0 13 5.4z",
  gear: "M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2m9.4 3.6c0 .6 0 1.2-.1 1.7l2 1.6a.5.5 0 0 1 .1.6l-1.9 3.2a.5.5 0 0 1-.6.2l-2.3-.9a7.6 7.6 0 0 1-2.9 1.7l-.4 2.4a.5.5 0 0 1-.5.4h-3.8a.5.5 0 0 1-.5-.4l-.4-2.4a7.6 7.6 0 0 1-2.9-1.7l-2.3.9a.5.5 0 0 1-.6-.2L.5 15.9a.5.5 0 0 1 .1-.6l2-1.6a9 9 0 0 1 0-3.4l-2-1.6a.5.5 0 0 1-.1-.6l1.9-3.2a.5.5 0 0 1 .6-.2l2.3.9a7.6 7.6 0 0 1 2.9-1.7l.4-2.4a.5.5 0 0 1 .5-.4h3.8a.5.5 0 0 1 .5.4l.4 2.4c1.1.4 2 1 2.9 1.7l2.3-.9a.5.5 0 0 1 .6.2l1.9 3.2a.5.5 0 0 1-.1.6l-2 1.6c.1.5.1 1.1.1 1.7",
  news: ["M3 4.6A1.6 1.6 0 0 1 4.6 3h11.8A1.6 1.6 0 0 1 18 4.6v13.8a2.6 2.6 0 0 0 2.6 2.6H5.6A2.6 2.6 0 0 1 3 18.4z",
         "M5.6 6.6h6.8v4.4H5.6zm0 6.4h9.8v1.8H5.6zm0 3.4h9.8v1.8H5.6z",
         "M20 8.6h-.6v9.8a1.2 1.2 0 0 0 2.4 0V10.2A1.6 1.6 0 0 0 20 8.6"],
  friends: ["M8.6 3.2a4 4 0 1 0 0 8 4 4 0 0 0 0-8", "M16.6 5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4",
            "M8.6 13a7 7 0 0 0-7 6.2 1.4 1.4 0 0 0 1.4 1.6h11.2a1.4 1.4 0 0 0 1.4-1.6 7 7 0 0 0-7-6.2",
            "M16.6 13c-.6 0-1.2.1-1.8.2a9 9 0 0 1 2.7 5.4c0 .4-.1.8-.2 1.2h4.3a1.2 1.2 0 0 0 1.2-1.4A6.2 6.2 0 0 0 16.6 13"],
  support: ["M12 1.8a10.2 10.2 0 1 0 0 20.4 10.2 10.2 0 0 0 0-20.4m0 3a7.2 7.2 0 0 1 3.8 1.1l-2.4 2.4a4 4 0 0 0-2.8 0L8.2 5.9A7.2 7.2 0 0 1 12 4.8M5.9 8.2l2.4 2.4a4 4 0 0 0 0 2.8l-2.4 2.4a7.2 7.2 0 0 1 0-7.6m2.3 9.9 2.4-2.4a4 4 0 0 0 2.8 0l2.4 2.4a7.2 7.2 0 0 1-7.6 0m9.9-2.3-2.4-2.4a4 4 0 0 0 0-2.8l2.4-2.4a7.2 7.2 0 0 1 0 7.6"],
  flag: "M5 2a1.4 1.4 0 0 1 1.4 1.4v.4l11.9 2.4a1 1 0 0 1 .5 1.7l-3.3 3.3 3.3 3.3a1 1 0 0 1-.5 1.7L6.4 18.6v3A1.4 1.4 0 0 1 3.6 21.6V3.4A1.4 1.4 0 0 1 5 2",
};

/** One icon, sized in px, inheriting the colour of whatever it sits in. */
export function icon(name: keyof typeof PATHS | string, size = 20): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  // Any subpath drawn inside another one is a HOLE, whichever way it is wound — which is
  // how the anthill gets its entrance without a second colour.
  svg.setAttribute("fill-rule", "evenodd");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ic");
  const shape = PATHS[name] ?? PATHS.star as string;
  for (const d of Array.isArray(shape) ? shape : [shape]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** Is there a mark for this name? Lets a caller fall back to its own artwork. */
