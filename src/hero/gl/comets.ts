import * as THREE from 'three';
import { ACCENT } from './constants';

// Anchors for proximity tug — placed on the comet orbital shell so passes
// actually trigger.
const ANCHOR_VERTS = [
  new THREE.Vector3( 2.6, 0,  0 ),
  new THREE.Vector3(-2.6, 0,  0 ),
  new THREE.Vector3( 0,   0,  2.6),
  new THREE.Vector3( 0,   0, -2.6),
];
const PROX = 0.55;

// Comets — 24 particles on random 3D orbital planes, rendered as short
// additive line segments (dim tail → bright head).
export function createComets(enabled: boolean, parent: THREE.Object3D) {
  const COMET_COUNT = enabled ? 24 : 0;
  const cuX = new Float32Array(COMET_COUNT), cuY = new Float32Array(COMET_COUNT), cuZ = new Float32Array(COMET_COUNT);
  const cvX = new Float32Array(COMET_COUNT), cvY = new Float32Array(COMET_COUNT), cvZ = new Float32Array(COMET_COUNT);
  const cRadius = new Float32Array(COMET_COUNT);
  const cPhase = new Float32Array(COMET_COUNT);
  const cBaseSpeed = new Float32Array(COMET_COUNT);
  const cPrevX = new Float32Array(COMET_COUNT), cPrevY = new Float32Array(COMET_COUNT), cPrevZ = new Float32Array(COMET_COUNT);

  for (let i = 0; i < COMET_COUNT; i++) {
    let nx = Math.random() * 2 - 1;
    let ny = Math.random() * 2 - 1;
    let nz = Math.random() * 2 - 1;
    const nl = 1 / Math.sqrt(nx*nx + ny*ny + nz*nz);
    nx *= nl; ny *= nl; nz *= nl;
    let tx = 1, ty = 0;
    const tz = 0;
    if (Math.abs(nx) > 0.9) { tx = 0; ty = 1; }
    let ux = ny * tz - nz * ty;
    let uy = nz * tx - nx * tz;
    let uz = nx * ty - ny * tx;
    const ul = 1 / Math.sqrt(ux*ux + uy*uy + uz*uz);
    ux *= ul; uy *= ul; uz *= ul;
    cuX[i] = ux; cuY[i] = uy; cuZ[i] = uz;
    cvX[i] = ny * uz - nz * uy;
    cvY[i] = nz * ux - nx * uz;
    cvZ[i] = nx * uy - ny * ux;

    cRadius[i] = 2.5 + Math.random() * 0.7;
    cPhase[i] = Math.random() * Math.PI * 2;
    cBaseSpeed[i] = 0.7 + Math.random() * 0.5;

    const cs = Math.cos(cPhase[i]) * cRadius[i];
    const sn = Math.sin(cPhase[i]) * cRadius[i];
    cPrevX[i] = cs * cuX[i] + sn * cvX[i];
    cPrevY[i] = cs * cuY[i] + sn * cvY[i];
    cPrevZ[i] = cs * cuZ[i] + sn * cvZ[i];
  }

  let cGeo: THREE.BufferGeometry | null = null;
  let cMat: THREE.LineBasicMaterial | null = null;
  if (enabled) {
    const cPositions = new Float32Array(COMET_COUNT * 6);
    const cColors = new Float32Array(COMET_COUNT * 6);
    const accentCol = new THREE.Color(ACCENT);
    for (let i = 0; i < COMET_COUNT; i++) {
      // tail dim → head bright (vertex colors)
      cColors[i*6 + 0] = accentCol.r * 0.08;
      cColors[i*6 + 1] = accentCol.g * 0.08;
      cColors[i*6 + 2] = accentCol.b * 0.08;
      cColors[i*6 + 3] = accentCol.r;
      cColors[i*6 + 4] = accentCol.g;
      cColors[i*6 + 5] = accentCol.b;
    }

    cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.BufferAttribute(cPositions, 3));
    cGeo.setAttribute('color',    new THREE.BufferAttribute(cColors, 3));
    cMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cometLines = new THREE.LineSegments(cGeo, cMat);
    parent.add(cometLines);
  }

  const pull = { x: 0, y: 0, z: 0 };

  // Advance orbits and accumulate the proximity tug on the seal. Pre-lock:
  // speed scales with charge (slow → fast streaks). Post-lock: speed decouples
  // and stays at idle drift even though charge is 1. On skipped frames the
  // pull reads zero, so the tug in the caller decays naturally.
  const update = (opts: {
    dt: number;
    charge: number;
    locked: boolean;
    frameCount: number;
    updateStep: number;
    trailScale: number;
    pointerMotion: number;
  }) => {
    pull.x = 0; pull.y = 0; pull.z = 0;
    if (
      !cGeo
      || opts.trailScale <= 0
      || opts.updateStep <= 0
      || opts.frameCount % opts.updateStep !== 0
    ) return pull;

    const cometSpeedMul = opts.locked ? 0.35 : 0.35 + opts.charge * 3.2;
    const cometDt = Math.min(opts.dt, 0.022);
    const trailMotionDamp = 1 - opts.pointerMotion * 0.55;
    const cPosAttr = cGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < COMET_COUNT; i++) {
      cPhase[i] += cBaseSpeed[i] * cometSpeedMul * cometDt * opts.updateStep;
      const cs = Math.cos(cPhase[i]) * cRadius[i];
      const sn = Math.sin(cPhase[i]) * cRadius[i];
      const tx_ = cs * cuX[i] + sn * cvX[i];
      const ty_ = cs * cuY[i] + sn * cvY[i];
      const tz_ = cs * cuZ[i] + sn * cvZ[i];

      const lr = Math.min(1, cometDt * 14 * opts.updateStep);
      const px = cPrevX[i] + (tx_ - cPrevX[i]) * lr;
      const py = cPrevY[i] + (ty_ - cPrevY[i]) * lr;
      const pz = cPrevZ[i] + (tz_ - cPrevZ[i]) * lr;

      const dx = px - cPrevX[i];
      const dy = py - cPrevY[i];
      const dz = pz - cPrevZ[i];
      const sp = Math.sqrt(dx*dx + dy*dy + dz*dz);

      const trail = Math.min(0.46 * opts.trailScale, sp * 16 * opts.trailScale) * trailMotionDamp;
      const inv = sp > 0.00001 ? 1 / sp : 0;
      cPosAttr[i*6 + 0] = px - dx * inv * trail;
      cPosAttr[i*6 + 1] = py - dy * inv * trail;
      cPosAttr[i*6 + 2] = pz - dz * inv * trail;
      cPosAttr[i*6 + 3] = px;
      cPosAttr[i*6 + 4] = py;
      cPosAttr[i*6 + 5] = pz;

      let minD = 1e9;
      let nvx = 0, nvy = 0, nvz = 0;
      for (let k = 0; k < ANCHOR_VERTS.length; k++) {
        const vv = ANCHOR_VERTS[k];
        const ddx = px - vv.x, ddy = py - vv.y, ddz = pz - vv.z;
        const d = ddx*ddx + ddy*ddy + ddz*ddz;
        if (d < minD) { minD = d; nvx = vv.x; nvy = vv.y; nvz = vv.z; }
      }
      const dist = Math.sqrt(minD);
      const aff = Math.max(0, 1 - dist / PROX);
      if (aff > 0) {
        pull.x += (px - nvx) * aff;
        pull.y += (py - nvy) * aff;
        pull.z += (pz - nvz) * aff;
      }

      cPrevX[i] = px; cPrevY[i] = py; cPrevZ[i] = pz;
    }
    cGeo.attributes.position.needsUpdate = true;
    return pull;
  };

  const setOpacity = (opacity: number) => {
    if (cMat) cMat.opacity = opacity;
  };

  const dispose = () => {
    cMat?.dispose();
    cGeo?.dispose();
  };

  return { update, setOpacity, dispose };
}

export type Comets = ReturnType<typeof createComets>;
