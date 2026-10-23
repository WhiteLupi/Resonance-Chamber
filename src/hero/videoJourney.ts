import type { JourneyTarget } from '../journey';

// The seal sits at 36% of the recorded frame; the journey's y is where it
// should sit on screen, so the clip moves by the difference.
const SEAL_Y = 36;

export const videoJourney: JourneyTarget = {
  setJourney({ y, s, o }) {
    const el = document.querySelector<HTMLElement>('.hero-video');
    if (!el) return;
    el.style.setProperty('--vy', `${(y - SEAL_Y).toFixed(2)}lvh`);
    el.style.setProperty('--vs', s.toFixed(3));
    el.style.setProperty('--vo', o.toFixed(3));
    // The veins run past the clip's top edge; moved down, that edge would
    // slice them, so it fades in over a band that grows with the drop.
    el.style.setProperty('--fade', `${Math.max(0, (y - SEAL_Y) * 0.8).toFixed(1)}%`);
  },
  pulse() {},
};
