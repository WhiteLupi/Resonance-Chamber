import { useEffect } from 'react';

// Voice v4 — BG breathing.
// Sine-driven gradient lerp #bcc0c5 ↔ #b8bcc1 with a 20s cycle. Active only
// once dwellSec ≥ 40s. On deactivation the RAF stops and the CSS var is
// removed, returning the section to the static settled color via the CSS
// fallback in about.css.
//
// Updates a CSS custom prop instead of triggering React rerenders — sub-second
// precision without paying for the reconciliation each frame.
const CYCLE_SEC = 20;
const C0 = { r: 0xbc, g: 0xc0, b: 0xc5 };
const C1 = { r: 0xb8, g: 0xbc, b: 0xc1 };

export function BgBreath({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      // 0..1 sine, smooth crossing through both endpoints.
      const u = 0.5 + 0.5 * Math.sin((t / CYCLE_SEC) * Math.PI * 2);
      const r = Math.round(C0.r + (C1.r - C0.r) * u);
      const g = Math.round(C0.g + (C1.g - C0.g) * u);
      const b = Math.round(C0.b + (C1.b - C0.b) * u);
      root.style.setProperty('--about-bg-pulse', `rgb(${r}, ${g}, ${b})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      root.style.removeProperty('--about-bg-pulse');
    };
  }, [active]);

  return null;
}
