import type { GrowParams, Lobe } from './mycelium-tree';

// Silhouette of the root system. Local units: on a 16:9 viewport the frame is
// roughly ±2.26 wide and ±1.27 tall, so the horizontal lobes reach the edges and
// the vertical ones overflow, like the original roots.
export const LOBES: Lobe[] = [
  { angle: 8,   tilt: 0.15,  reach: 2.45, spread: 0.42, start: 0.00 },
  { angle: 38,  tilt: -0.30, reach: 1.55, spread: 0.40, start: 0.08 },
  { angle: 74,  tilt: 0.20,  reach: 1.75, spread: 0.36, start: 0.04 },
  { angle: 118, tilt: -0.10, reach: 1.30, spread: 0.44, start: 0.12 },
  { angle: 158, tilt: 0.25,  reach: 2.50, spread: 0.40, start: 0.02 },
  { angle: 192, tilt: -0.25, reach: 2.05, spread: 0.38, start: 0.06 },
  { angle: 228, tilt: 0.10,  reach: 1.45, spread: 0.42, start: 0.14 },
  { angle: 262, tilt: -0.15, reach: 1.85, spread: 0.36, start: 0.03 },
  { angle: 300, tilt: 0.30,  reach: 1.40, spread: 0.44, start: 0.10 },
  { angle: 336, tilt: -0.20, reach: 2.20, spread: 0.40, start: 0.05 },
];

export const growParams = (baseR: number): GrowParams => ({
  seed: 7,
  baseR,
  lobes: LOBES,
  density: 320,
  step: 0.03,
  influence: 0.3,
  kill: 0.07,
  inertia: 1.6,
  maxTurn: 0.14,
  outward: 0.8,
  forkMin: 0.44,
  forkMax: 0.78,
  forkGap: 4,
  vascularE: 1.6,
  tipPx: 0.6,
  maxPx: 7,
  tipFade: 0.35,
  subdiv: 2,
});
