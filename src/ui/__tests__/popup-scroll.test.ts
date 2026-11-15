import { afterEach, expect, it } from "vitest";
import { mountTraitPicker } from "../trait-popovers";
import { mountAnthillPopup } from "../anthill-popover";

afterEach(() => document.body.replaceChildren());

function fixture() {
  const host = document.createElement("div"); host.id = "app";
  const page = document.createElement("div"); page.className = "screen";
  page.style.overflowY = "auto";
  const row = document.createElement("div"), anchor = document.createElement("button");
  anchor.dataset.slot = "0"; row.appendChild(anchor); page.appendChild(row);
  host.appendChild(page); document.body.appendChild(host);
  host.getBoundingClientRect = () => new DOMRect(0,0,390,600);
  page.getBoundingClientRect = host.getBoundingClientRect;
  Object.defineProperties(page,{clientHeight:{value:600},scrollHeight:{value:1400}});
  page.scrollTop = 200;
  row.getBoundingClientRect = () => new DOMRect(16,740-page.scrollTop,358,40);
  anchor.getBoundingClientRect = () => new DOMRect(16,740-page.scrollTop,64,40);
  const panel = document.createElement("section");
  panel.getBoundingClientRect = () => new DOMRect(16,parseFloat(panel.style.top)||0,358,320);
  return {host,page,row,anchor,panel};
}

it("opens a trait picker below its slot without changing the page scroll position", async () => {
  const {page,row,anchor,panel} = fixture();
  const close = mountTraitPicker(page,row,0,panel,() => {});
  await Promise.resolve();
  expect(page.scrollTop).toBe(200);
  expect(parseFloat(panel.style.top)).toBe(anchor.getBoundingClientRect().bottom + 14);
  expect(panel.classList.contains("above")).toBe(false);
  panel.dispatchEvent(new WheelEvent("wheel",{deltaY:100,cancelable:true,bubbles:true}));
  expect(page.scrollTop).toBe(300);
  page.dispatchEvent(new Event("scroll"));
  expect(parseFloat(panel.style.top)).toBe(anchor.getBoundingClientRect().bottom + 14);
  close();
});

it("opens anthill details without scrolling and keeps them open when the anchor scrolls offscreen", async () => {
  const {page,anchor,panel} = fixture();
  let dismissed = false;
  const close = mountAnthillPopup(page,anchor,panel,() => { dismissed = true; });
  await Promise.resolve();
  expect(page.scrollTop).toBe(200);
  expect(panel.style.maxHeight).toBe("none");
  page.scrollTop = 900;
  page.dispatchEvent(new Event("scroll"));
  expect(dismissed).toBe(false);
  expect(parseFloat(panel.style.top)).toBe(anchor.getBoundingClientRect().bottom + 12);
  close();
});

it("does not reposition the page when resizing an anchored skins picker", () => {
  const {page,row,anchor,panel} = fixture();
  const close = mountTraitPicker(page,row,0,panel,() => {},anchor);
  window.dispatchEvent(new Event("resize"));
  expect(page.scrollTop).toBe(200);
  expect(panel.classList.contains("above")).toBe(false);
  close();
});
