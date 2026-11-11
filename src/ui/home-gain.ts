/**
 * Presents already-credited match winnings on Home. This never awards units.
 * One receipt belongs to one ProfileStore; leaving Home saves only the unseen remainder.
 */
import type { Profile, ProfileStore } from "../platform";
import { hudMark, updateColonyBanner } from "./chrome";
import "./home-gain.css";

type Gain = NonNullable<Profile["pendingHomeGain"]>;

function available(store: ProfileStore): number {
  const p = store.get();
  return p.pendingHomeGain
    ? Math.min(p.pendingHomeGain.amount, Math.max(0, p.colony - p.pendingHomeGain.from)) : 0;
}

function matches(store: ProfileStore, gain: Gain): boolean {
  const held = store.get().pendingHomeGain;
  return held?.from === gain.from && held.amount === gain.amount;
}

interface Flight {
  root: HTMLElement;
  store: ProfileStore;
  gain: Gain;
  amount: number;
  shown: number;
  frame: number;
  layer: HTMLElement | null;
  number: HTMLElement | null;
}

export class HomeGainAnimation {
  private flight: Flight | null = null;

  /** The banked balance minus only the match winnings still waiting to be shown. */
  displayedColony(store: ProfileStore): number {
    const f = this.flight;
    const remaining = f?.store === store && matches(store, f.gain)
      ? Math.min(available(store), f.amount - f.shown) : available(store);
    return store.get().colony - remaining;
  }

  cancel(): void {
    const f = this.flight;
    if (!f) return;
    cancelAnimationFrame(f.frame);
    f.layer?.remove();
    if (f.number) f.number.style.transform = "";
    f.store.acknowledgeHomeGain(f.gain, Math.min(available(f.store), f.amount - f.shown));
    this.flight = null;
  }

  start(root: HTMLElement, store: ProfileStore, visible: () => boolean): void {
    if (this.flight?.root === root && this.flight.store === store) return;
    this.cancel();
    const receipt = store.get().pendingHomeGain;
    if (!receipt || !visible()) return;
    const amount = available(store);
    if (amount < 1) { store.acknowledgeHomeGain(receipt); return; }
    const f: Flight = {
      root, store, gain: { ...receipt }, amount, shown: 0, frame: 0, layer: null, number: null,
    };
    this.flight = f;
    let stableSince = -1;
    let previousLeft = Infinity;
    let launched = -1;
    let lastImpact = -Infinity;
    const count = Math.min(12, amount);
    const particles: HTMLElement[] = [];
    const arrived = new Set<number>();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const tick = (now: number): void => {
      if (!root.isConnected || !visible() || !matches(store, f.gain)) { this.cancel(); return; }
      // Reopening must not consume a saved reward underneath the launch cover.
      if (launched < 0 && (document.getElementById("splash") || document.fonts?.status === "loading")) {
        stableSince = -1;
        previousLeft = Infinity;
        f.frame = requestAnimationFrame(tick);
        return;
      }
      const play = root.querySelector<HTMLElement>("#goPlay");
      const banner = root.querySelector<HTMLElement>("#colonyHero");
      const number = banner?.querySelector<HTMLElement>(".col-n");
      if (!play || !banner || !number) { this.cancel(); return; }
      const rect = root.getBoundingClientRect();
      const from = play.getBoundingClientRect();
      const to = number.getBoundingClientRect();
      if (rect.width <= 0 || from.width <= 0 || to.width <= 0) {
        f.frame = requestAnimationFrame(tick);
        return;
      }
      // A tab can call onArrive while its 340ms slide is still moving.
      if (launched < 0) {
        if (Math.abs(rect.left - previousLeft) > 0.5) stableSince = now;
        previousLeft = rect.left;
        if (stableSince < 0) stableSince = now;
        if (now - stableSince < 180) { f.frame = requestAnimationFrame(tick); return; }
        if (reduceMotion) {
          updateColonyBanner(banner, store.get().colony);
          store.acknowledgeHomeGain(f.gain);
          this.flight = null;
          return;
        }
        launched = now;
        f.layer = document.createElement("div");
        f.layer.className = "home-gain";
        f.layer.setAttribute("aria-hidden", "true");
        for (let i = 0; i < count; i++) {
          const particle = document.createElement("span");
          particle.className = "home-gain-unit";
          particle.appendChild(hudMark("swords", 32));
          f.layer.appendChild(particle);
          particles.push(particle);
        }
        root.appendChild(f.layer);
      }

      const x0 = from.left + from.width / 2 - rect.left;
      const y0 = from.top + from.height / 2 - rect.top;
      const x1 = to.left + to.width / 2 - rect.left;
      const y1 = to.top + to.height / 2 - rect.top;
      let shown = 0;
      for (let i = 0; i < count; i++) {
        const delay = i * 65;
        const duration = 720 + (i % 3) * 35;
        const elapsed = now - launched - delay;
        const t = Math.max(0, Math.min(1, elapsed / duration));
        const packet = Math.floor(amount * (i + 1) / count) - Math.floor(amount * i / count);
        // Counting begins at impact, smoothing each packet without writing the save per frame.
        const progress = Math.max(0, Math.min(1, (elapsed - duration) / 120));
        shown += packet * (1 - (1 - progress) ** 3);
        if (t >= 1 && !arrived.has(i)) { arrived.add(i); lastImpact = now; }
        const particle = particles[i];
        if (!particle) continue;
        particle.style.visibility = elapsed < 0 || t >= 1 ? "hidden" : "visible";
        const spread = (i - (count - 1) / 2) * 15;
        const u = 1 - t;
        const x = u ** 3 * x0 + 3 * u * u * t * (x0 + spread)
          + 3 * u * t * t * (x1 + spread * 0.4) + t ** 3 * x1;
        const y = u ** 3 * y0 + 3 * u * u * t * (y0 - 90)
          + 3 * u * t * t * (y1 + (y0 - y1) * 0.22) + t ** 3 * y1;
        const scale = Math.min(1, 0.55 + t * 5) * (1 - t * 0.22);
        particle.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${spread * (1 - t) * 0.3}deg) scale(${scale})`;
        particle.style.opacity = String(Math.min(1, Math.max(0, elapsed / 70)));
      }
      f.shown = Math.max(f.shown, Math.min(amount, Math.floor(shown)));
      const balance = this.displayedColony(store);
      updateColonyBanner(banner, balance, balance - f.shown + shown);
      if (f.number !== number && f.number) f.number.style.transform = "";
      f.number = number;
      const pulse = Math.max(0, 1 - (now - lastImpact) / 160);
      number.style.transform = `scale(${1 + pulse * 0.12})`;
      if (now - launched >= (count - 1) * 65 + 790 + 160) {
        updateColonyBanner(banner, store.get().colony);
        store.acknowledgeHomeGain(f.gain);
        f.layer?.remove();
        number.style.transform = "";
        this.flight = null;
        return;
      }
      f.frame = requestAnimationFrame(tick);
    };
    f.frame = requestAnimationFrame(tick);
  }
}
