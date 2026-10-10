import type * as THREE from 'three';

// Contract every root-system variant implements, so the scene can swap them.
export type RootsModule = {
  /** charge 0..1 drives growth (1 = locked); motionT freezes at 0 under reduced motion */
  update: (charge: number, motionT: number, t: number) => void;
  applyVisibility: (charge: number, rootsVis: number, jVis: number, brightnessMul: number) => void;
  setViewport: (w: number, h: number, pixelRatio: number) => void;
  /** fired on lock and on every press of the core after it */
  pulse?: (t: number) => void;
  dispose: () => void;
};

export type RootsFactory = (parent: THREE.Object3D) => RootsModule;
