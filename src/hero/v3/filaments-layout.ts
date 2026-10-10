import * as THREE from 'three';
import { CORE_R, ROOTS_SCALE } from '../gl/constants';

// Build-time geometry for the filament field. Everything is in the mesh's local
// space (the mesh is scaled by ROOTS_SCALE), so a length of 2.2 here reaches the
// same place the original roots did.

export const POINTS_PER_FILAMENT = 28;

export const LAYOUT = {
  seed: 7,
  bundles: 14,
  filaments: 2600,
  // Fraction of filaments that ignore their bundle and drift loose.
  strayRatio: 0.08,
  // Toward-camera spread is squashed so bundles fan across the screen.
  zSquash: 0.4,
  minLength: 1.1,
  maxLength: 2.75,
  // How hard the flow field bends a bundle's spine away from straight.
  curl: 0.85,
  // Patch of core surface each bundle's filaments rise from.
  baseSpread: 0.075,
  // Radius of a bundle's packed strand mid-way.
  strandRadius: 0.035,
  // Hair-end splay at the tips.
  fray: 0.28,
  // Radians of braid twist from base to tip.
  twist: 3.2,
} as const;

const CORE_LOCAL = (CORE_R / ROOTS_SCALE) * 0.9;
const SPINE_STEPS = 160;

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Smooth vector potential from layered sines; its curl is divergence-free, so
// streamlines swirl and braid instead of collapsing into sinks.
const potential = (x: number, y: number, z: number, o: number, out: THREE.Vector3) =>
  out.set(
    Math.sin(y * 1.3 + o) + 0.5 * Math.sin(z * 2.7 + x * 1.1 + o * 1.7),
    Math.sin(z * 1.1 + o * 2.3) + 0.5 * Math.sin(x * 2.3 - y * 0.9 + o),
    Math.sin(x * 1.5 - o * 0.7) + 0.5 * Math.sin(y * 2.1 + z * 1.3 + o * 2.9),
  );

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const curlAt = (p: THREE.Vector3, o: number, out: THREE.Vector3) => {
  const e = 0.01;
  potential(p.x, p.y + e, p.z, o, _a); potential(p.x, p.y - e, p.z, o, _b);
  const dFz_dy = (_a.z - _b.z) / (2 * e);
  const dFx_dy = (_a.x - _b.x) / (2 * e);
  potential(p.x, p.y, p.z + e, o, _a); potential(p.x, p.y, p.z - e, o, _b);
  const dFy_dz = (_a.y - _b.y) / (2 * e);
  const dFx_dz = (_a.x - _b.x) / (2 * e);
  potential(p.x + e, p.y, p.z, o, _a); potential(p.x - e, p.y, p.z, o, _b);
  const dFz_dx = (_a.z - _b.z) / (2 * e);
  const dFy_dx = (_a.y - _b.y) / (2 * e);
  return out.set(dFz_dy - dFy_dz, dFx_dz - dFz_dx, dFy_dx - dFx_dy);
};

type Spine = {
  points: THREE.Vector3[];
  // Rotation-minimizing frame, so the braid never flips on vertical tangents.
  n1: THREE.Vector3[];
  n2: THREE.Vector3[];
  length: number;
};

// Streamline of the curl field, biased outward so it keeps leaving the core.
const integrateSpine = (dir: THREE.Vector3, length: number, offset: number): Spine => {
  const ds = length / SPINE_STEPS;
  const p = dir.clone().multiplyScalar(CORE_LOCAL);
  const h = dir.clone();
  const c = new THREE.Vector3();
  const points = [p.clone()];
  for (let i = 1; i <= SPINE_STEPS; i++) {
    const f = i / SPINE_STEPS;
    curlAt(p, offset, c);
    c.z *= LAYOUT.zSquash;
    // Straight out of the core, freer further away.
    h.addScaledVector(c, LAYOUT.curl * ds * (0.3 + f))
      .addScaledVector(dir, ds * 1.4);
    // Keep depth drift in check so bundles stay spread across the screen.
    h.z += (dir.z - h.z) * 0.12;
    h.normalize();
    p.addScaledVector(h, ds);
    points.push(p.clone());
  }
  const n1: THREE.Vector3[] = [];
  const n2: THREE.Vector3[] = [];
  const tan = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    tan.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    let a: THREE.Vector3;
    if (i === 0) {
      const up = Math.abs(tan.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      a = new THREE.Vector3().crossVectors(tan, up).normalize();
    } else {
      a = n1[i - 1].clone().addScaledVector(tan, -n1[i - 1].dot(tan)).normalize();
    }
    n1.push(a);
    n2.push(new THREE.Vector3().crossVectors(tan, a).normalize());
  }
  return { points, n1, n2, length };
};

const sampleSpine = (sp: Spine, s: number, out: THREE.Vector3, o1: THREE.Vector3, o2: THREE.Vector3) => {
  const x = Math.min(Math.max(s, 0), 1) * SPINE_STEPS;
  const i = Math.min(Math.floor(x), SPINE_STEPS - 1);
  const f = x - i;
  out.lerpVectors(sp.points[i], sp.points[i + 1], f);
  o1.lerpVectors(sp.n1[i], sp.n1[i + 1], f).normalize();
  o2.lerpVectors(sp.n2[i], sp.n2[i + 1], f).normalize();
};

type Bundle = {
  spine: Spine;
  growthStart: number;
  phase: number;
  // Sub-strand directions in the spine frame: a bundle splits as it travels.
  subs: { angle: number; sep: number }[];
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

const buildBundles = (rand: () => number): Bundle[] => {
  const out: Bundle[] = [];
  for (let b = 0; b < LAYOUT.bundles; b++) {
    // Evenly around the screen with a little depth tilt: squashing a sphere
    // direction would still leave some pointing straight at the camera.
    const a = ((b + 0.5) / LAYOUT.bundles) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), (rand() * 2 - 1) * LAYOUT.zSquash).normalize();
    // Alternate long and short bundles so the silhouette is uneven.
    const long = b % 3 !== 1;
    const t = rand();
    const length = long
      ? THREE.MathUtils.lerp(LAYOUT.maxLength * 0.78, LAYOUT.maxLength, t)
      : THREE.MathUtils.lerp(LAYOUT.minLength, LAYOUT.maxLength * 0.65, t);
    const subCount = 1 + Math.floor(rand() * 3);
    const subs = Array.from({ length: subCount }, (_, k) => ({
      angle: (k / subCount) * Math.PI * 2 + rand() * 1.2,
      sep: subCount === 1 ? 0 : 0.08 + rand() * 0.16,
    }));
    out.push({
      spine: integrateSpine(dir, length, rand() * 100),
      growthStart: rand() * 0.28,
      phase: rand() * Math.PI * 2,
      subs,
    });
  }
  return out;
};

export type FilamentGeometry = {
  position: Float32Array;
  prev: Float32Array;
  next: Float32Array;
  // side, s (0..1 along filament), filament length, bundle phase
  meta: Float32Array;
  // width css px, alpha, teal, growth start
  look: Float32Array;
  index: Uint32Array;
  vertexCount: number;
};

export const buildFilamentGeometry = (): FilamentGeometry => {
  const rand = mulberry32(LAYOUT.seed);
  const bundles = buildBundles(rand);
  const N = LAYOUT.filaments;
  const P = POINTS_PER_FILAMENT;
  const vCount = N * P * 2;
  const position = new Float32Array(vCount * 3);
  const prev = new Float32Array(vCount * 3);
  const next = new Float32Array(vCount * 3);
  const meta = new Float32Array(vCount * 4);
  const look = new Float32Array(vCount * 4);
  const index = new Uint32Array(N * (P - 1) * 6);

  const pts = Array.from({ length: P }, () => new THREE.Vector3());
  const c = new THREE.Vector3();
  const o1 = new THREE.Vector3();
  const o2 = new THREE.Vector3();
  const curl = new THREE.Vector3();
  let v = 0;
  let ii = 0;

  for (let f = 0; f < N; f++) {
    const bundle = bundles[f % bundles.length];
    const stray = rand() < LAYOUT.strayRatio;
    const sub = bundle.subs[Math.floor(rand() * bundle.subs.length)];
    // sqrt keeps the area density even; the bright core comes from alpha.
    const u = Math.sqrt(rand());
    const theta0 = rand() * Math.PI * 2;
    const frayU = rand();
    const lenFrac = stray ? 0.25 + rand() * 0.4 : 0.4 + 0.6 * Math.sqrt(rand());
    const noiseSeed = rand() * 50;
    const strayAmp = stray ? 0.25 + rand() * 0.35 : 0;

    let arc = 0;
    for (let k = 0; k < P; k++) {
      const s = (k / (P - 1)) * lenFrac;
      sampleSpine(bundle.spine, s, c, o1, o2);
      const radius =
        THREE.MathUtils.lerp(LAYOUT.baseSpread * u, LAYOUT.strandRadius * u, smooth(0, 0.22, s)) +
        LAYOUT.fray * frayU * smooth(0.5, 1, s) * u +
        strayAmp * smooth(0.05, 0.6, s);
      const th = theta0 + s * LAYOUT.twist;
      const split = sub.sep * smooth(0.15, 0.85, s);
      const p = pts[k].copy(c)
        .addScaledVector(o1, Math.cos(th) * radius + Math.cos(sub.angle) * split)
        .addScaledVector(o2, Math.sin(th) * radius + Math.sin(sub.angle) * split);
      // Fine per-filament wander, zero at the base so roots stay anchored.
      curlAt(curl.copy(p).multiplyScalar(3.1), noiseSeed, curl);
      p.addScaledVector(curl, 0.012 * smooth(0.05, 0.7, s) * bundle.spine.length);
      if (k > 0) arc += p.distanceTo(pts[k - 1]);
    }

    // Bundle-core filaments are thicker and brighter; strays are faint.
    const coreness = Math.exp(-u * u * 3);
    const width = stray ? 0.6 : 0.6 + 0.6 * coreness;
    const alpha = stray ? 0.16 : 0.14 + 0.38 * coreness;
    const teal = rand() < 0.22 ? 0.45 + rand() * 0.5 : 0;
    const growthStart = Math.min(bundle.growthStart + rand() * 0.06 + (stray ? 0.1 : 0), 0.6);

    const base = v;
    for (let k = 0; k < P; k++) {
      const p = pts[k];
      const pp = pts[Math.max(k - 1, 0)];
      const pn = pts[Math.min(k + 1, P - 1)];
      const s = k / (P - 1);
      for (const side of [-1, 1]) {
        position.set([p.x, p.y, p.z], v * 3);
        prev.set([pp.x, pp.y, pp.z], v * 3);
        next.set([pn.x, pn.y, pn.z], v * 3);
        meta.set([side, s, arc, bundle.phase], v * 4);
        look.set([width, alpha, teal, growthStart], v * 4);
        v++;
      }
      if (k < P - 1) {
        const a = base + k * 2;
        index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ii);
        ii += 6;
      }
    }
  }

  return { position, prev, next, meta, look, index, vertexCount: vCount };
};
