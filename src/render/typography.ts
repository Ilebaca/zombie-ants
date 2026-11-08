/** The resolved display font shared by all canvas labels. */
let displayFamily = "Poetsen, Nunito, sans-serif";

/** Read once when the theme loads; never resolve styles inside the drawing loop. */
export function loadTypography(style: CSSStyleDeclaration): void {
  displayFamily = style.getPropertyValue("--font-display").trim() || "Poetsen, Nunito, sans-serif";
}

/** Canvas requires a concrete font family. The display face ships only weight 400. */
export const canvasFont = (size: number): string => `400 ${size}px ${displayFamily}`;
