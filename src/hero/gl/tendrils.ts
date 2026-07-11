import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { ACCENT, BASE_COLOR, CORE_R, ROOTS_SCALE } from './constants';

type Flex = {
  amp1: number; amp2: number;   // bend magnitude on each lateral axis
  dir1: THREE.Vector3; dir2: THREE.Vector3;  // lateral axes ⟂ to the tendril
  speed: number; phase: number; waveK: number;  // travelling-wave params
};
type Tendril = {
  lines: { line: Line2; endIdx: number; geom: LineGeometry }[];
  samples: number;
  type: 'main' | 'branch';
  parent?: Tendril;
  branchT?: number;
  growthStart?: number;
  growthDuration?: number;
  growth: number;
  group: THREE.Group;          // scene container — main: own, branch: parent's
  basePts: THREE.Vector3[];    // rest-pose points (built.points)
  flexed: THREE.Vector3[];     // scratch: per-frame flexed points (reused)
  flex: Flex;                  // travelling-wave bend
  attachIndex?: number;        // branch: index into parent.basePts of its base
};

type Helix = { amp: number; freq: number; phase: number };

// Each tendril bends with a travelling wave running base→tip: the offset grows
// with arc fraction (^1.5) so the base stays anchored at the core while the tip
// whips, and the per-tendril phase/axes make each one flex on its own. Lateral
// axes are taken ⟂ to the tendril's overall direction so the bend sweeps
// sideways rather than stretching the length.
const makeFlex = (seed: number, dir: THREE.Vector3): Flex => {
  const up = Math.abs(dir.y) > 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const dir1 = new THREE.Vector3().crossVectors(dir, up).normalize();
  const dir2 = new THREE.Vector3().crossVectors(dir, dir1).normalize();
  return {
    amp1: 0.11 + Math.abs(Math.sin(seed * 2.3)) * 0.06,
    amp2: 0.05 + Math.abs(Math.cos(seed * 3.7)) * 0.04,
    dir1, dir2,
    speed: 0.7 + Math.abs(Math.sin(seed * 1.7)) * 0.6,
    phase: seed * 1.97,
    waveK: 2.4 + Math.abs(Math.cos(seed * 2.1)) * 1.6,
  };
};

// Centripetal Catmull-Rom avoids the overshoot, cusps and self-intersecting
// loops that uniform parameterisation produces on unevenly spaced control
// points — the prime source of the "angular wire" look on the tendrils.
const SPINE_TYPE = 'centripetal' as const;

// Direction distribution biased toward the screen plane — the Z (toward-camera)
// component is squashed so tendrils lie roughly in-plane and visibly radiate
// from the core across the screen, instead of stubby foreshortened spokes
// pointing at the camera that read as disconnected floaters.
const Z_SQUASH = 0.42;
const dirFromSeed = (seed: number): THREE.Vector3 => {
  const a1 = seed * 2.71;
  const a2 = seed * 4.53;
  return new THREE.Vector3(
    Math.cos(a1) * Math.cos(a2 * 0.5),
    Math.sin(a2 * 0.5),
    Math.sin(a1) * Math.cos(a2 * 0.5) * Z_SQUASH,
  ).normalize();
};

// Origin uses CORE_R / ROOTS_SCALE so roots stay anchored on the core surface
// in world space (rootsGroup scales by ROOTS_SCALE; the origin scales with it,
// but the core sits in tetraGroup at unscaled CORE_R).
// CORE_TUCK pulls the base just inside that surface so it stays occluded by the
// sphere at every phase of the breathing pulse. The core scales to 0.96 at the
// bottom of its breath (glScene: 1 ± 0.04); anchored exactly on the surface, the
// bases poked out from under the shrunk sphere as raw stubs. 0.9 sits under the
// minimum with margin; the base tucks into the core, only the emerged length shows.
const CORE_TUCK = 0.9;
// A tendril spine is grown as a heading walk rather than a radial spoke: each
// segment turns the growth direction by a per-tendril, per-step angle in both
// perpendicular axes, so the path wanders in continuously changing directions
// along its whole length — not "straight, then a hook at the tip". A mild
// outward bias keeps net growth away from the core; a faint downward bias lets
// some settle without every tip curling the same way.
const buildSpine = (dir: THREE.Vector3, lengthMul: number, swayBias: number): THREE.Vector3[] => {
  const origin = dir.clone().multiplyScalar((CORE_R / ROOTS_SCALE) * CORE_TUCK);
  const STEPS = 6;
  const segLen = lengthMul / STEPS;
  const OUTWARD = 0.40;   // pull each new heading back toward radial — net growth out
  const TURN1 = 0.62;     // max turn per step, axis 1
  const TURN2 = 0.50;     // max turn per step, axis 2
  const GRAVITY = 0.07;   // faint downward drift per step

  const heading = dir.clone();
  let pos = origin.clone();
  const pts: THREE.Vector3[] = [origin];
  for (let i = 1; i <= STEPS; i++) {
    const upRef = Math.abs(heading.y) > 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const p1 = new THREE.Vector3().crossVectors(heading, upRef).normalize();
    const p2 = new THREE.Vector3().crossVectors(heading, p1).normalize();
    // Turns flip sign across steps (the i term) and vary per tendril (swayBias)
    // → genuine meander, each root taking its own changing course.
    const a1 = Math.sin(swayBias * 3.1 + i * 1.7) * TURN1;
    const a2 = Math.cos(swayBias * 5.3 + i * 2.3) * TURN2;
    heading
      .addScaledVector(p1, a1)
      .addScaledVector(p2, a2)
      .addScaledVector(dir, OUTWARD)
      .add(new THREE.Vector3(0, -GRAVITY, 0))
      .normalize();
    pos = pos.clone().addScaledVector(heading, segLen);
    pts.push(pos.clone());
  }
  return pts;
};

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
// ease-IN for root growth, but GENTLE: starts at zero the instant you press
// (no jump) and grows visibly from the very first frames, accelerating toward
// the lock. Exponent is the knob — higher = slower/deader start. 1.0 = linear.
const GROWTH_EASE = 1.5;
const easeInGrow = (x: number) => Math.pow(x, GROWTH_EASE);

// The tendril field: the root system radiating from the seal core. Owns its
// materials, geometry and per-frame growth/flex animation; the caller drives
// it with charge/motionT and the visibility tracks.
export function createTendrilField(parent: THREE.Object3D, lineRes: THREE.Vector2) {
  const rootsGroup = new THREE.Group();
  const rootMats: LineMaterial[] = [];
  const tendrils: Tendril[] = [];

  const rootBaseOpacity = new WeakMap<LineMaterial, number>();
  const mkMat = (linewidth: number, opacity: number) => {
    const m = new LineMaterial({
      color: BASE_COLOR,
      linewidth,
      transparent: true,
      opacity,
      worldUnits: false,
    });
    m.resolution.copy(lineRes);
    rootBaseOpacity.set(m, opacity);
    rootMats.push(m);
    return m;
  };
  const matThick = mkMat(5.0, 0.72);
  const matMid = mkMat(3.4, 0.82);
  const matThin = mkMat(2.0, 0.90);
  const matWisp = mkMat(0.9, 0.85);
  const matBranchThick = mkMat(2.6, 0.75);
  const matBranchThin = mkMat(1.1, 0.85);

  const layersForTendril = (jitter: number) => [
    { mat: matThick, ratio: 0.45 + jitter * 0.05 },
    { mat: matMid,   ratio: 0.72 + jitter * 0.04 },
    { mat: matThin,  ratio: 0.90 + jitter * 0.03 },
    { mat: matWisp,  ratio: 1.00 },
  ];
  const branchLayers = [
    { mat: matBranchThick, ratio: 0.60 },
    { mat: matBranchThin,  ratio: 1.00 },
  ];

  // Build a Line2 with hidden state (instanceCount = 0) — growth animation reveals segments.
  const makeLine = (points: THREE.Vector3[], endIdx: number, mat: LineMaterial, container: THREE.Object3D) => {
    const flat: number[] = [];
    for (let i = 0; i < endIdx; i++) {
      flat.push(points[i].x, points[i].y, points[i].z);
    }
    const g = new LineGeometry();
    g.setPositions(flat);
    const line = new Line2(g, mat);
    line.computeLineDistances();
    line.frustumCulled = false;   // positions change each frame via flex
    g.instanceCount = 0;
    container.add(line);
    return { line, endIdx, geom: g };
  };

  const buildTendril = (
    spinePoints: THREE.Vector3[],
    helix: Helix | null,
    layers: { mat: LineMaterial; ratio: number }[],
    samples: number,
    container: THREE.Object3D,
  ) => {
    const spine = new THREE.CatmullRomCurve3(spinePoints, false, SPINE_TYPE);
    const points: THREE.Vector3[] = [];
    // Rotation-minimizing frame: carry the previous perpendicular across samples
    // and re-project it onto the plane ⟂ tangent, instead of picking an "up"
    // reference per-sample. The threshold pick flips the helix plane by ~90°
    // when the tangent crosses near-vertical — the source of the remaining
    // angular kinks on the upward tendrils. Parallel transport stays continuous.
    let prevPerp: THREE.Vector3 | null = null;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = spine.getPointAt(t).clone();
      if (helix && helix.amp > 0) {
        const tan = spine.getTangentAt(t).normalize();
        let perpA: THREE.Vector3;
        if (prevPerp) {
          // Project previous frame onto the new tangent's normal plane.
          perpA = prevPerp.clone().addScaledVector(tan, -prevPerp.dot(tan));
          if (perpA.lengthSq() < 1e-6) {
            const up = Math.abs(tan.y) > 0.9
              ? new THREE.Vector3(1, 0, 0)
              : new THREE.Vector3(0, 1, 0);
            perpA = new THREE.Vector3().crossVectors(tan, up);
          }
          perpA.normalize();
        } else {
          const up = Math.abs(tan.y) > 0.9
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0);
          perpA = new THREE.Vector3().crossVectors(tan, up).normalize();
        }
        prevPerp = perpA;
        const perpB = new THREE.Vector3().crossVectors(tan, perpA).normalize();
        const envelope = t < 0.08
          ? t / 0.08
          : Math.pow(1 - (t - 0.08) / 0.92, 1.4);
        const amp = helix.amp * envelope;
        const phase = helix.phase + t * helix.freq * Math.PI * 2;
        p.add(perpA.clone().multiplyScalar(Math.cos(phase) * amp));
        p.add(perpB.clone().multiplyScalar(Math.sin(phase) * amp));
      }
      points.push(p);
    }
    const lines: { line: Line2; endIdx: number; geom: LineGeometry }[] = [];
    for (const layer of layers) {
      const endIdx = Math.max(2, Math.floor(points.length * layer.ratio));
      lines.push(makeLine(points, endIdx, layer.mat, container));
    }
    return { lines, points, spine, samplesCount: points.length };
  };

  const addBranch = (
    parentTendril: Tendril,
    parentPoints: THREE.Vector3[],
    t: number,
    sideSign: number,
    lengthMul: number,
    helix: Helix | null,
  ) => {
    // Attach to the parent's ACTUAL rendered point (spine + helix displacement),
    // not the bare spine — otherwise the branch base sits on the centerline while
    // the parent's bright strand is offset by the helix coil, leaving a gap that
    // reads as "connected from one angle, floating from another".
    const n = parentPoints.length;
    const idx = Math.max(1, Math.min(n - 2, Math.round(t * (n - 1))));
    const origin = parentPoints[idx].clone();
    const tangent = parentPoints[idx + 1].clone().sub(parentPoints[idx - 1]).normalize();
    const upRef = Math.abs(tangent.y) > 0.85
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
    const branchLen = 0.40 * lengthMul;
    // Leave the parent at an acute angle (~25°), biased FORWARD along the parent's
    // growth — like a real fork — rather than the near-perpendicular splay before.
    // Forward (tangent) dominates the side offset; only a faint downward settle.
    const branchDir = tangent.clone().multiplyScalar(branchLen * 0.95)
      .add(perp.clone().multiplyScalar(sideSign * branchLen * 0.42))
      .add(new THREE.Vector3(0, -branchLen * 0.15, 0));
    const end = origin.clone().add(branchDir);
    // Mid sits along the same acute direction so the base doesn't kink sideways;
    // a small perp curl keeps the limb organic rather than dead-straight.
    const mid = origin.clone().addScaledVector(branchDir, 0.5)
      .add(perp.clone().multiplyScalar(sideSign * branchLen * 0.10));
    const built = buildTendril([origin, mid, end], helix, branchLayers, 48, parentTendril.group);
    tendrils.push({
      lines: built.lines,
      samples: built.samplesCount,
      type: 'branch',
      parent: parentTendril,
      branchT: t,
      growth: 0,
      group: parentTendril.group,
      basePts: built.points,
      flexed: built.points.map((p) => p.clone()),
      flex: makeFlex(t * 11.3 + sideSign * 2.0 + lengthMul, branchDir.clone().normalize()),
      attachIndex: idx,
    });
  };

  const addRoot = (opts: {
    dirSeed: number; length: number; swayBias: number;
    branches: number; helix: Helix | null;
    growthStart: number; growthDuration: number;
  }) => {
    const dir = dirFromSeed(opts.dirSeed);
    const spine = buildSpine(dir, opts.length, opts.swayBias);
    const jitter = Math.sin(opts.swayBias * 5.1);
    const group = new THREE.Group();
    rootsGroup.add(group);
    const built = buildTendril(spine, opts.helix, layersForTendril(jitter), 112, group);
    const mainTendril: Tendril = {
      lines: built.lines,
      samples: built.samplesCount,
      type: 'main',
      growthStart: opts.growthStart,
      growthDuration: opts.growthDuration,
      growth: 0,
      group,
      basePts: built.points,
      flexed: built.points.map((p) => p.clone()),
      flex: makeFlex(opts.swayBias, dir),
    };
    tendrils.push(mainTendril);
    for (let b = 0; b < opts.branches; b++) {
      const bt = 0.32 + b * 0.22 + Math.sin(opts.swayBias * (17.3 + b * 2)) * 0.06;
      const sideSign = (b % 2 === 0) ? 1 : -1;
      const bHelix: Helix | null = opts.helix
        ? { amp: opts.helix.amp * 0.5, freq: opts.helix.freq * 1.3, phase: opts.helix.phase + 1.5 }
        : null;
      addBranch(mainTendril, built.points, bt, sideSign, opts.length * 0.9, bHelix);
    }
  };

  const addRootPair = (opts: {
    dirSeed: number; length: number; swayBias: number;
    helixAmp: number; helixFreq: number;
    branches: [number, number];
    growthStart: number; growthDuration: number;
  }) => {
    const dir = dirFromSeed(opts.dirSeed);
    const spine = buildSpine(dir, opts.length, opts.swayBias);
    const jitterA = Math.sin(opts.swayBias * 5.1);
    const jitterB = Math.cos(opts.swayBias * 5.1);
    const groupA = new THREE.Group();
    const groupB = new THREE.Group();
    rootsGroup.add(groupA, groupB);
    const builtA = buildTendril(spine, { amp: opts.helixAmp, freq: opts.helixFreq, phase: 0 }, layersForTendril(jitterA), 112, groupA);
    const builtB = buildTendril(spine, { amp: opts.helixAmp, freq: opts.helixFreq, phase: Math.PI }, layersForTendril(jitterB), 112, groupB);
    const tA: Tendril = { lines: builtA.lines, samples: builtA.samplesCount, type: 'main', growthStart: opts.growthStart, growthDuration: opts.growthDuration, growth: 0, group: groupA, basePts: builtA.points, flexed: builtA.points.map((p) => p.clone()), flex: makeFlex(opts.swayBias, dir) };
    const tB: Tendril = { lines: builtB.lines, samples: builtB.samplesCount, type: 'main', growthStart: opts.growthStart + 0.02, growthDuration: opts.growthDuration, growth: 0, group: groupB, basePts: builtB.points, flexed: builtB.points.map((p) => p.clone()), flex: makeFlex(opts.swayBias + 7.0, dir) };
    tendrils.push(tA, tB);
    for (let b = 0; b < opts.branches[0]; b++) {
      const bt = 0.35 + b * 0.20;
      addBranch(tA, builtA.points, bt,  1, opts.length * 0.85, { amp: opts.helixAmp * 0.4, freq: opts.helixFreq * 1.2, phase: 0.8 });
    }
    for (let b = 0; b < opts.branches[1]; b++) {
      const bt = 0.40 + b * 0.18;
      addBranch(tB, builtB.points, bt, -1, opts.length * 0.85, { amp: opts.helixAmp * 0.4, freq: opts.helixFreq * 1.2, phase: Math.PI + 0.8 });
    }
  };

  // Composition (15 main tendrils + branches), staggered growthStart 0–0.20 for
  // organic emergence — each spine charts an independent path through the field.
  // Length varies widely — short tendrils cluster near the core, the long ones
  // reach out toward the screen edges, giving the field depth instead of an
  // evenly-sized burst.
  addRootPair({ dirSeed: 1.1, length: 2.60, swayBias: 1.1, helixAmp: 0.10, helixFreq: 2.6, branches: [2, 1], growthStart: 0.00, growthDuration: 0.85 });
  addRootPair({ dirSeed: 2.4, length: 1.05, swayBias: 2.4, helixAmp: 0.09, helixFreq: 3.0, branches: [1, 1], growthStart: 0.05, growthDuration: 0.82 });
  addRootPair({ dirSeed: 5.7, length: 1.45, swayBias: 5.7, helixAmp: 0.08, helixFreq: 2.4, branches: [1, 1], growthStart: 0.10, growthDuration: 0.80 });
  addRootPair({ dirSeed: 8.3, length: 2.25, swayBias: 8.3, helixAmp: 0.10, helixFreq: 2.2, branches: [2, 1], growthStart: 0.07, growthDuration: 0.83 });

  addRoot({ dirSeed: 3.1,  length: 0.55, swayBias: 3.1,  branches: 0, helix: { amp: 0.06, freq: 2.0, phase: 1.2 }, growthStart: 0.14, growthDuration: 0.70 });
  addRoot({ dirSeed: 4.0,  length: 2.40, swayBias: 4.0,  branches: 2, helix: { amp: 0.07, freq: 2.5, phase: 0.6 }, growthStart: 0.08, growthDuration: 0.80 });
  addRoot({ dirSeed: 6.2,  length: 1.30, swayBias: 6.2,  branches: 2, helix: { amp: 0.08, freq: 2.7, phase: 4.2 }, growthStart: 0.04, growthDuration: 0.82 });
  addRoot({ dirSeed: 7.0,  length: 0.70, swayBias: 7.0,  branches: 0, helix: { amp: 0.05, freq: 3.0, phase: 2.4 }, growthStart: 0.16, growthDuration: 0.72 });
  addRoot({ dirSeed: 9.1,  length: 2.65, swayBias: 9.1,  branches: 2, helix: { amp: 0.09, freq: 2.4, phase: 5.0 }, growthStart: 0.02, growthDuration: 0.84 });
  addRoot({ dirSeed: 10.4, length: 0.95, swayBias: 10.4, branches: 1, helix: { amp: 0.06, freq: 2.2, phase: 3.6 }, growthStart: 0.18, growthDuration: 0.72 });
  addRoot({ dirSeed: 11.6, length: 1.85, swayBias: 11.6, branches: 2, helix: { amp: 0.08, freq: 2.8, phase: 1.5 }, growthStart: 0.06, growthDuration: 0.82 });

  rootsGroup.scale.setScalar(ROOTS_SCALE);
  parent.add(rootsGroup);

  // Growth + flex, driven per frame by the caller. Tendrils are ordered
  // parent-before-branch, so a branch can read its parent's already-flexed
  // attach point this same frame and ride it.
  const update = (charge: number, motionT: number, shouldUpdate: boolean) => {
    // Roots breathe with a slow BOUNDED turn (±~9°) instead of a continuous spin —
    // a full rotation would swing the in-plane tendrils edge-on, where they pile
    // into a tangled mess. Oscillating keeps the figure in its good-looking range.
    // motionT freezes at 0 under reduced motion — the figure holds its pose.
    rootsGroup.rotation.y = Math.sin(motionT * 0.045) * 0.16;
    rootsGroup.rotation.x = Math.sin(motionT * 0.06) * 0.05;
    rootsGroup.position.y = Math.sin(motionT * 0.4) * 0.015;

    for (const tend of tendrils) {
      if (tend.type === 'main') {
        // Start at the staggered growthStart, reach full exactly at charge=1 so
        // every tendril finishes together with the closing ring. ease-IN shape.
        const span = 1 - (tend.growthStart ?? 0);
        const local = span > 0.001
          ? Math.max(0, Math.min(1, (charge - (tend.growthStart ?? 0)) / span))
          : 0;
        tend.growth = easeInGrow(local);
      } else {
        const parentG = tend.parent!.growth;
        const span = 1 - (tend.branchT ?? 0);
        const local = span > 0.01
          ? Math.max(0, Math.min(1, (parentG - (tend.branchT ?? 0)) / span))
          : 0;
        tend.growth = easeOutCubic(local);
      }

      // Travelling-wave bend. Offset grows with arc fraction (^1.5) so the base
      // stays put and the tip whips. A branch's base inherits its parent's flex
      // displacement at the attach point, keeping the join seamless under motion.
      const { basePts, flexed, flex } = tend;
      if (shouldUpdate) {
        const N = basePts.length;
        let bx = 0, by = 0, bz = 0;
        if (tend.type === 'branch' && tend.parent && tend.attachIndex != null) {
          const ai = tend.attachIndex;
          const pf = tend.parent.flexed[ai], pb = tend.parent.basePts[ai];
          bx = pf.x - pb.x; by = pf.y - pb.y; bz = pf.z - pb.z;
        }
        const d1 = flex.dir1, d2 = flex.dir2;
        for (let i = 0; i < N; i++) {
          const f = N > 1 ? i / (N - 1) : 0;
          const w = Math.pow(f, 1.5);
          const ang = motionT * flex.speed + flex.phase - f * flex.waveK;
          const o1 = flex.amp1 * w * Math.sin(ang);
          const o2 = flex.amp2 * w * Math.cos(ang);
          const bp = basePts[i];
          flexed[i].set(
            bp.x + d1.x * o1 + d2.x * o2 + bx,
            bp.y + d1.y * o1 + d2.y * o2 + by,
            bp.z + d1.z * o1 + d2.z * o2 + bz,
          );
        }
      }

      const targetIdx = Math.floor(tend.growth * tend.samples);
      for (const { line, endIdx } of tend.lines) {
        const geom = line.geometry as LineGeometry;
        const segs = Math.max(0, Math.min(targetIdx, endIdx) - 1);
        // Write flexed points straight into the interleaved segment buffer
        // (no realloc): segment s holds point s as start, point s+1 as end.
        const buf = (geom.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data;
        const arr = buf.array as Float32Array;
        if (shouldUpdate) {
          for (let s = 0; s < segs; s++) {
            const a = flexed[s], b = flexed[s + 1];
            const o = s * 6;
            arr[o] = a.x; arr[o + 1] = a.y; arr[o + 2] = a.z;
            arr[o + 3] = b.x; arr[o + 4] = b.y; arr[o + 5] = b.z;
          }
          if (segs > 0) buf.needsUpdate = true;
        }
        geom.instanceCount = segs;
      }
    }
  };

  const rootBaseColor = new THREE.Color(BASE_COLOR);
  const rootAccentColor = new THREE.Color(ACCENT);
  const rootTintColor = new THREE.Color(BASE_COLOR);
  let lastRootTint = BASE_COLOR;

  // brightnessMul lifts the filaments toward opaque white where there is no
  // bloom to glow them (mobile) so they read as white, not grey thread.
  const applyVisibility = (charge: number, rootsVis: number, jVis: number, brightnessMul = 1) => {
    const tintTarget = charge > 0.01
      ? rootTintColor.copy(rootBaseColor).lerp(rootAccentColor, charge * 0.4).getHex()
      : BASE_COLOR;
    for (const m of rootMats) {
      if (tintTarget !== lastRootTint) m.color.setHex(tintTarget);
      m.opacity = Math.min(1, (rootBaseOpacity.get(m) ?? 0.8) * rootsVis * (0.05 + 0.95 * jVis) * brightnessMul);
    }
    lastRootTint = tintTarget;
  };

  const setResolution = (w: number, h: number) => {
    for (const m of rootMats) m.resolution.set(w, h);
  };

  const dispose = () => {
    for (const m of rootMats) m.dispose();
    for (const tend of tendrils) {
      for (const { geom } of tend.lines) geom.dispose();
    }
  };

  return { update, applyVisibility, setResolution, dispose };
}
