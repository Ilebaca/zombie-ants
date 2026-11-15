/** Shared rarity badges and matching empty-slot silhouettes, based on the supplied artwork. */
import type { TraitKind, TraitTier } from "../platform";
import "./trait-emblem.css";

const NS = "http://www.w3.org/2000/svg";
/** One outline for every filled badge and empty socket. */
export const TRAIT_OUTLINE = "M17 49C20 24 39 6 64 6S108 24 111 49H116L124 56 116 63H111C108 88 89 106 64 106S20 88 17 63H12L4 56 12 49Z";
const PALETTES: Record<TraitTier, readonly [string,string,string,string]> = {
  common: ["#eaf4fc","#8e9eaf","#465363","#262d36"],
  uncommon: ["#d0ff38","#38dc00","#078600","#063a0a"],
  rare: ["#45edff","#068cff","#1236d9","#061d65"],
  exceptional: ["#f3c4ff","#b527ff","#690bc4","#36033e"],
  mythic: ["#ffc4a7","#ff2541","#b60021","#4a0319"],
};
let sequence = 0;

function svg(): SVGSVGElement {
  const art = document.createElementNS(NS,"svg");
  art.setAttribute("viewBox","0 0 128 112");
  art.setAttribute("aria-hidden","true");
  art.setAttribute("focusable","false");
  art.classList.add("trait-emblem");
  return art;
}

/** The vacant socket has the same rim as the badge, without a rarity or stat mark. */
export function traitSocket(): SVGSVGElement {
  const art = svg();
  art.classList.add("trait-socket");
  const path = document.createElementNS(NS,"path");
  path.setAttribute("d",TRAIT_OUTLINE);
  path.setAttribute("class","trait-emblem__outline");
  art.appendChild(path);
  return art;
}

function shape(name: keyof SVGElementTagNameMap, attrs: Record<string,string>): SVGElement {
  const node = document.createElementNS(NS,name);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  return node;
}

export function traitEmblem(kind: TraitKind, tier: TraitTier): SVGSVGElement {
  const art = svg();
  art.dataset.kind = kind;
  art.dataset.tier = tier;
  const [light,face,shade,core] = PALETTES[tier];
  const id = "trait-art-" + ++sequence;
  const shield = [
    shape("path", {"d":"M64 33Q75 41 84 42Q85 65 64 82Q43 65 44 42Q53 41 64 33Z","fill":"#cceeff","stroke":"#30001f","stroke-width":"3","stroke-linejoin":"round"}),
    shape("path", {"d":"M64 35Q75 42 82 43Q82 64 64 79Z","fill":"#92caff"}),
  ];
  const clock = [
    shape("circle", {"cx":"64","cy":"56","r":"23","fill":"#dafbe8","stroke":"#30001f","stroke-width":"3"}),
    shape("path", {"d":"M64 35A21 21 0 0 1 64 77Z","fill":"#b6efd1"}),
    shape("path", {"d":"M64 39V57H80","fill":"none","stroke":"#30001f","stroke-width":"3.5","stroke-linecap":"round","stroke-linejoin":"round"}),
  ];
  const sword = [
    shape("path", {"d":"M64 28L77 42 73 65H55L51 42Z","fill":"#fff0cc","stroke":"#30001f","stroke-width":"3","stroke-linejoin":"round"}),
    shape("path", {"d":"M64 30L75 42 72 64H64Z","fill":"#ffaaa2"}),
    shape("path", {"d":"M64 55L75 42 72 64H64Z","fill":"#ff7f7c"}),
    shape("path", {"d":"M57 68H71L70 83H58Z","fill":"#a50b32","stroke":"#30001f","stroke-width":"3"}),
    shape("path", {"d":"M58 74H70V79H58Z","fill":"#650927"}),
    shape("path", {"d":"M47 62L56 64 64 61 72 64 81 62 84 69 78 74 64 71 50 74 44 69Z","fill":"#ffc300","stroke":"#30001f","stroke-width":"3","stroke-linejoin":"round"}),
    shape("path", {"d":"M47 63L56 66 64 63 72 66 81 63 80 67 71 69 64 66 56 69 46 67Z","fill":"#ffe568"}),
    shape("rect", {"x":"57","y":"82","width":"14","height":"6","rx":"3","fill":"#ffc300","stroke":"#30001f","stroke-width":"2.5"}),
  ];
  const gradient = shape("linearGradient", {id: id + "-rim", x1: "0", y1: "0", x2: ".7", y2: "1"});
  gradient.append(shape("stop", {"stop-color": light}),
    shape("stop", {offset: ".38", "stop-color": face}),
    shape("stop", {offset: "1", "stop-color": shade}));
  const defs = shape("defs", {});
  defs.appendChild(gradient);
  art.append(defs,
    shape("path", {class: "trait-emblem__outline", d: TRAIT_OUTLINE, fill: `url(#${id}-rim)`,
      stroke: "#30001f", "stroke-width": "3", "stroke-linejoin": "round"}),
    shape("ellipse", {cx: "64", cy: "56", rx: "34", ry: "36", fill: core, stroke: shade, "stroke-width": "2"}),
    shape("path", {d: "M35 26Q39 20 45 19", fill: "none", stroke: "#fffdf2", "stroke-width": "7", "stroke-linecap": "round"}),
    shape("path", {d: "M31 34L33 31", fill: "none", stroke: "#fffdf2", "stroke-width": "4", "stroke-linecap": "round"}),
    ...(kind === "attack" ? sword : kind === "defence" ? shield : clock));
  return art;
}
