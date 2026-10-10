import type { HeroScene } from '../glScene';
import { startHero } from './scene';
import type { RootsFactory } from './roots';
import { createTendrilFieldV2 } from './tendrils';
import { createDischarge } from '../v3/discharge';

// Comparison routes: /v2 is the GPU port of the original roots (/v2-thick with
// heavier strands), /c is the discharge redesign. All share the same scene, core and comets.
const VARIANTS: Record<string, RootsFactory> = {
  v2: createTendrilFieldV2,
  'v2-thick': (parent) => createTendrilFieldV2(parent, 1.3),
  c: createDischarge,
};

export const engineFor = (variant: string) =>
  (host: HTMLElement): HeroScene => startHero(host, VARIANTS[variant] ?? createTendrilFieldV2);
