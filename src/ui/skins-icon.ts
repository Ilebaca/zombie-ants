/** Scalable orange ant-mask mark based on the supplied skins icon. */
export function skinsIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 128 128");
  svg.setAttribute("aria-hidden","true");
  svg.setAttribute("focusable","false");
  svg.classList.add("spgskins-art");
  const path = (d: string, fill: string, stroke = "none", width = "0"): SVGPathElement => {
    const p = document.createElementNS(ns,"path");
    p.setAttribute("d",d); p.setAttribute("fill",fill); p.setAttribute("stroke",stroke);
    p.setAttribute("stroke-width",width); p.setAttribute("stroke-linejoin","round");
    return p;
  };
  for (const mirror of [false,true]) {
    const antenna = document.createElementNS(ns,"g");
    if (mirror) antenna.setAttribute("transform","translate(128 0) scale(-1 1)");
    antenna.append(
      path("M46 50Q43 35 34 23L22 27 17 42Q15 50 9 47Q4 44 7 35L14 23Q16 20 21 18L34 13Q38 12 41 18Q50 31 52 46Q53 51 46 50Z","#f88700","#28020c","3.5"),
      path("M16 23L34 16Q37 15 39 18L40 20 21 26Z","#ffd77b"),
      path("M34 23Q44 35 49 47L45 48Q40 35 32 26Z","#c2400b"),
      path("M8 36Q5 45 11 47Q16 49 18 41L21 28 18 27Z","#d45008"));
    svg.appendChild(antenna);
  }
  const face = path("M25 57Q41 33 53 38Q65 31 78 38Q96 35 104 57Q116 62 113 77L110 93 103 100Q99 110 90 112L86 101Q77 97 69 96L66 100H61L58 96Q50 97 41 101L37 112Q26 110 22 101L17 96 13 76Q11 65 25 57Z M21 67Q47 64 56 87Q38 100 26 83Z M107 67Q81 64 72 87Q90 100 102 83Z","#ff9700","#28020c","3.7");
  face.setAttribute("fill-rule","evenodd");
  svg.append(face,
    path("M15 73L22 91 29 98 37 106 37 110Q27 108 24 100L19 94Z","#bc3b10"),
    path("M113 73L106 91 99 98 91 106 91 110Q101 108 104 100L109 94Z","#bc3b10"),
    path("M54 43Q64 40 74 43L77 47Q65 49 53 48Q51 47 54 43Z","#ffdb78"),
    path("M26 58Q35 48 43 44L39 58Q49 65 55 77Q46 64 26 61Z","#ffb42c"),
    path("M102 58Q93 48 85 44L89 58Q79 65 73 77Q82 64 102 61Z","#ffb42c"));
  return svg;
}
