/**
 * THE DESIGN DOCUMENT AS ONE PRINTABLE FILE.
 *
 *     npx tsx tools/gdd-pdf.ts [out.pdf] [source.html]
 *
 * `docs/GDD.html` is a TABBED document — eleven panels, one shown at a time — which is the
 * right shape to read on a screen and the wrong shape entirely to print or to send to
 * somebody: a straight print gives whichever tab happened to be open and nothing else. So
 * this opens every panel, hides the tab bar, and hands back the whole thing in order.
 *
 * IT RENDERS THE REAL FILE, never a second copy of it. The document is the source and this
 * is a view of it, so there is no version of the GDD that can drift from the one in the
 * repository — which is the same reason the asset export drives the real app rather than
 * redrawing anything (`tools/shots.ts`).
 *
 * The PDF is NOT committed, for the reason the export is not: it is output, and it goes
 * stale the moment a paragraph changes. Re-run this instead.
 *
 * TOOL, NOT BUILD STEP: excluded from the typecheck and the lint like the other two
 * browser-driving tools, because it imports Playwright, which is deliberately not a
 * dependency of this project (CLAUDE.md §11).
 */
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * Print rules, injected rather than written into the document.
 *
 * `docs/GDD.html` has no print stylesheet and should not grow one for a tool: what is
 * wanted here is not "the screen, on paper" but a different document — every tab opened,
 * each starting on its own page, and nothing broken across a page that has to be read
 * whole.
 */
const PRINT = `
  .tab-panel { display: block !important; page-break-before: always; }
  .tab-panel:first-of-type { page-break-before: auto; }
  .tab-bar, .tab-select-wrap { display: none !important; }
  .page { padding-top: 24px; }
  h1, h2 { page-break-after: avoid; }
  table, .callout, .flag, li { page-break-inside: avoid; }
`;

async function main(): Promise<void> {
  const [out = "zombie-ants-gdd.pdf", src = "docs/GDD.html"] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(process.cwd(), src)).href, { waitUntil: "load" });
    await page.addStyleTag({ content: PRINT });
    // SCREEN media, deliberately: the colour in this document is doing work — the callouts
    // are colour-coded and the tables are read across — and a print stylesheet nobody
    // wrote would hand back a grey version of all of it.
    await page.emulateMedia({ media: "screen" });
    await page.pdf({
      path: resolve(process.cwd(), out),
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width:100%;font:9px Georgia,serif;color:#999;`
        + `padding:0 12mm;text-align:right">Zombie Ants &mdash; Game Design Document `
        + `&middot; <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    });
    console.log(out);
  } finally {
    await browser.close();
  }
}

void main();
