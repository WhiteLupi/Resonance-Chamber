import type * as THREE from 'three';
import type { RootsModule } from '../v2/roots';
import { createTendrilFieldV2 } from '../v2/tendrils';

// Placeholder until the variant is built.
export function createMycelium(parent: THREE.Object3D): RootsModule {
  return createTendrilFieldV2(parent);
}
