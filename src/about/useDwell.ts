import { useEffect, useState } from 'react';
import { dwellStore, progressStore } from './dwellStore';

const T_V4 = 40;  // BG breathing (slow polyrhythm reward — only for stayers)

export type DwellPhase = {
  v1: boolean; // cursor blink (always on once at About)
  v2: boolean; // letter substitution
  v4: boolean; // BG breathing
};

const INITIAL: DwellPhase = { v1: false, v2: false, v4: false };

// One-shot RAF that owns dwellStore. Reads progressStore (written by App scroll
// handler). Returns DwellPhase as React state — rerenders only on threshold
// crossings, not every frame. Continuous values (dwellStore.sec, progressStore.value)
// stay in module refs so voices that need sub-second precision (BG breathing,
// letter sub scheduler) can read them from their own RAFs without rerendering.
export function useDwell(): DwellPhase {
  const [phase, setPhase] = useState<DwellPhase>(INITIAL);

  useEffect(() => {
    let prevT = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = (now - prevT) / 1000;
      prevT = now;

      const p = progressStore.value;
      if (p > 0.95) {
        dwellStore.sec += dt;
      } else if (p < 0.7) {
        dwellStore.sec = 0;
      }

      const s = dwellStore.sec;
      const next: DwellPhase = {
        v1: p > 0.9,
        v2: p > 0.6,
        v4: s >= T_V4,
      };
      setPhase(prev =>
        prev.v1 === next.v1 && prev.v2 === next.v2 && prev.v4 === next.v4
          ? prev
          : next,
      );

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return phase;
}
