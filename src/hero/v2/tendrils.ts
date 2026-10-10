import * as THREE from 'three';
import { ACCENT, BASE_COLOR, CORE_R, ROOTS_SCALE } from '../gl/constants';
import type { RootsModule } from './roots';

// The whole root system is ONE mesh: every layer of every tendril is a ribbon
// in a single static buffer. Growth, the travelling-wave flex and the
// screen-space width all happen in the vertex shader, so the CPU uploads
// nothing per frame and the GPU gets one draw call instead of ~100.

type Flex = {
  amp1: number; amp2: number;
  dir1: THREE.Vector3; dir2: THREE.Vector3;
  speed: number; phase: number; waveK: number;
};
type Layer = { width: number; opacity: number; ratio: number };
type Helix = { amp: number; freq: number; phase: number };
type TendrilDef = {
  points: THREE.Vector3[];
  layers: Layer[];
  flex: Flex;
  // main: staggered growth start; branch: arc position on the parent
  growthKey: number;
  parent: number;
  attachIndex: number;
};

const makeFlex = (seed: number, dir: THREE.Vector3): Flex => {
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
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

// Bases tuck just under the core surface so they stay hidden at the bottom of
// the core's breath (scale 0.96).
const CORE_TUCK = 0.9;
const buildSpine = (dir: THREE.Vector3, lengthMul: number, swayBias: number): THREE.Vector3[] => {
  const origin = dir.clone().multiplyScalar((CORE_R / ROOTS_SCALE) * CORE_TUCK);
  const STEPS = 6;
  const segLen = lengthMul / STEPS;
  const heading = dir.clone();
  let pos = origin.clone();
  const pts: THREE.Vector3[] = [origin];
  for (let i = 1; i <= STEPS; i++) {
    const upRef = Math.abs(heading.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const p1 = new THREE.Vector3().crossVectors(heading, upRef).normalize();
    const p2 = new THREE.Vector3().crossVectors(heading, p1).normalize();
    heading
      .addScaledVector(p1, Math.sin(swayBias * 3.1 + i * 1.7) * 0.62)
      .addScaledVector(p2, Math.cos(swayBias * 5.3 + i * 2.3) * 0.50)
      .addScaledVector(dir, 0.40)
      .add(new THREE.Vector3(0, -0.07, 0))
      .normalize();
    pos = pos.clone().addScaledVector(heading, segLen);
    pts.push(pos.clone());
  }
  return pts;
};

// Chaikin corner-cutting on the control polygon: a sharp turn between two
// spine steps becomes a rounded bend before the curve is fitted. Endpoints stay
// put, so roots remain anchored on the core and branches on their parent.
const smoothControl = (pts: THREE.Vector3[], iterations: number): THREE.Vector3[] => {
  let out = pts;
  for (let k = 0; k < iterations; k++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      next.push(
        out[i].clone().lerp(out[i + 1], 0.25),
        out[i].clone().lerp(out[i + 1], 0.75),
      );
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
};

// Helix coil around a centripetal Catmull-Rom spine, carried on a
// rotation-minimizing frame so the coil plane never flips on vertical tangents.
const sampleTendril = (spinePoints: THREE.Vector3[], helix: Helix | null, samples: number) => {
  const spine = new THREE.CatmullRomCurve3(smoothControl(spinePoints, 2), false, 'centripetal');
  const points: THREE.Vector3[] = [];
  let prevPerp: THREE.Vector3 | null = null;
  const fallbackPerp = (tan: THREE.Vector3) => {
    const up = Math.abs(tan.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3().crossVectors(tan, up);
  };
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = spine.getPointAt(t).clone();
    if (helix && helix.amp > 0) {
      const tan = spine.getTangentAt(t).normalize();
      let perpA: THREE.Vector3 = prevPerp
        ? prevPerp.clone().addScaledVector(tan, -prevPerp.dot(tan))
        : fallbackPerp(tan);
      if (perpA.lengthSq() < 1e-6) perpA = fallbackPerp(tan);
      perpA.normalize();
      prevPerp = perpA;
      const perpB = new THREE.Vector3().crossVectors(tan, perpA).normalize();
      const envelope = t < 0.08 ? t / 0.08 : Math.pow(1 - (t - 0.08) / 0.92, 1.4);
      const amp = helix.amp * envelope;
      const phase = helix.phase + t * helix.freq * Math.PI * 2;
      p.addScaledVector(perpA, Math.cos(phase) * amp);
      p.addScaledVector(perpB, Math.sin(phase) * amp);
    }
    points.push(p);
  }
  return points;
};

// Widths are CSS px. Multiple layers per tendril, each shorter and thicker than
// the next, give the base-heavy taper; the shader smooths each layer's end.
const mainLayers = (jitter: number): Layer[] => [
  { width: 5.0, opacity: 0.72, ratio: 0.45 + jitter * 0.05 },
  { width: 3.4, opacity: 0.82, ratio: 0.72 + jitter * 0.04 },
  { width: 2.0, opacity: 0.90, ratio: 0.90 + jitter * 0.03 },
  { width: 1.1, opacity: 0.85, ratio: 1.00 },
];
const branchLayers: Layer[] = [
  { width: 2.6, opacity: 0.75, ratio: 0.60 },
  { width: 1.1, opacity: 0.85, ratio: 1.00 },
];

const buildLayout = (): TendrilDef[] => {
  const defs: TendrilDef[] = [];

  const addBranch = (parentIdx: number, t: number, sideSign: number, lengthMul: number, helix: Helix | null) => {
    const parentPoints = defs[parentIdx].points;
    const n = parentPoints.length;
    const idx = Math.max(1, Math.min(n - 2, Math.round(t * (n - 1))));
    const origin = parentPoints[idx].clone();
    const tangent = parentPoints[idx + 1].clone().sub(parentPoints[idx - 1]).normalize();
    const upRef = Math.abs(tangent.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
    const branchLen = 0.40 * lengthMul;
    const branchDir = tangent.clone().multiplyScalar(branchLen * 0.95)
      .add(perp.clone().multiplyScalar(sideSign * branchLen * 0.42))
      .add(new THREE.Vector3(0, -branchLen * 0.15, 0));
    const end = origin.clone().add(branchDir);
    const mid = origin.clone().addScaledVector(branchDir, 0.5)
      .add(perp.clone().multiplyScalar(sideSign * branchLen * 0.10));
    defs.push({
      points: sampleTendril([origin, mid, end], helix, 48),
      layers: branchLayers,
      flex: makeFlex(t * 11.3 + sideSign * 2.0 + lengthMul, branchDir.clone().normalize()),
      growthKey: t,
      parent: parentIdx,
      attachIndex: idx,
    });
  };

  const addMain = (spine: THREE.Vector3[], helix: Helix, jitter: number, flex: Flex, growthStart: number) => {
    defs.push({
      points: sampleTendril(spine, helix, 112),
      layers: mainLayers(jitter),
      flex,
      growthKey: growthStart,
      parent: -1,
      attachIndex: 0,
    });
    return defs.length - 1;
  };

  const addRoot = (o: {
    dirSeed: number; length: number; swayBias: number; branches: number;
    helix: Helix; growthStart: number;
  }) => {
    const dir = dirFromSeed(o.dirSeed);
    const spine = buildSpine(dir, o.length, o.swayBias);
    const main = addMain(spine, o.helix, Math.sin(o.swayBias * 5.1), makeFlex(o.swayBias, dir), o.growthStart);
    for (let b = 0; b < o.branches; b++) {
      const bt = 0.32 + b * 0.22 + Math.sin(o.swayBias * (17.3 + b * 2)) * 0.06;
      addBranch(main, bt, b % 2 === 0 ? 1 : -1, o.length * 0.9,
        { amp: o.helix.amp * 0.5, freq: o.helix.freq * 1.3, phase: o.helix.phase + 1.5 });
    }
  };

  const addRootPair = (o: {
    dirSeed: number; length: number; swayBias: number; helixAmp: number; helixFreq: number;
    branches: [number, number]; growthStart: number;
  }) => {
    const dir = dirFromSeed(o.dirSeed);
    const spine = buildSpine(dir, o.length, o.swayBias);
    const a = addMain(spine, { amp: o.helixAmp, freq: o.helixFreq, phase: 0 },
      Math.sin(o.swayBias * 5.1), makeFlex(o.swayBias, dir), o.growthStart);
    const b = addMain(spine, { amp: o.helixAmp, freq: o.helixFreq, phase: Math.PI },
      Math.cos(o.swayBias * 5.1), makeFlex(o.swayBias + 7.0, dir), o.growthStart + 0.02);
    const bHelix = (phase: number) => ({ amp: o.helixAmp * 0.4, freq: o.helixFreq * 1.2, phase });
    for (let i = 0; i < o.branches[0]; i++) addBranch(a, 0.35 + i * 0.20, 1, o.length * 0.85, bHelix(0.8));
    for (let i = 0; i < o.branches[1]; i++) addBranch(b, 0.40 + i * 0.18, -1, o.length * 0.85, bHelix(Math.PI + 0.8));
  };

  addRootPair({ dirSeed: 1.1, length: 2.60, swayBias: 1.1, helixAmp: 0.10, helixFreq: 2.6, branches: [2, 1], growthStart: 0.00 });
  addRootPair({ dirSeed: 2.4, length: 1.05, swayBias: 2.4, helixAmp: 0.09, helixFreq: 3.0, branches: [1, 1], growthStart: 0.05 });
  addRootPair({ dirSeed: 5.7, length: 1.45, swayBias: 5.7, helixAmp: 0.08, helixFreq: 2.4, branches: [1, 1], growthStart: 0.10 });
  addRootPair({ dirSeed: 8.3, length: 2.25, swayBias: 8.3, helixAmp: 0.10, helixFreq: 2.2, branches: [2, 1], growthStart: 0.07 });

  addRoot({ dirSeed: 3.1,  length: 0.55, swayBias: 3.1,  branches: 0, helix: { amp: 0.06, freq: 2.0, phase: 1.2 }, growthStart: 0.14 });
  addRoot({ dirSeed: 4.0,  length: 2.40, swayBias: 4.0,  branches: 2, helix: { amp: 0.07, freq: 2.5, phase: 0.6 }, growthStart: 0.08 });
  addRoot({ dirSeed: 6.2,  length: 1.30, swayBias: 6.2,  branches: 2, helix: { amp: 0.08, freq: 2.7, phase: 4.2 }, growthStart: 0.04 });
  addRoot({ dirSeed: 7.0,  length: 0.70, swayBias: 7.0,  branches: 0, helix: { amp: 0.05, freq: 3.0, phase: 2.4 }, growthStart: 0.16 });
  addRoot({ dirSeed: 9.1,  length: 2.65, swayBias: 9.1,  branches: 2, helix: { amp: 0.09, freq: 2.4, phase: 5.0 }, growthStart: 0.02 });
  addRoot({ dirSeed: 10.4, length: 0.95, swayBias: 10.4, branches: 1, helix: { amp: 0.06, freq: 2.2, phase: 3.6 }, growthStart: 0.18 });
  addRoot({ dirSeed: 11.6, length: 1.85, swayBias: 11.6, branches: 2, helix: { amp: 0.08, freq: 2.8, phase: 1.5 }, growthStart: 0.06 });

  return defs;
};

// Per-tendril parameters live in a float texture, one row per tendril, so a
// branch can read its parent's flex and growth in the shader.
// texel 0: dir1.xyz, amp1 · 1: dir2.xyz, amp2 · 2: speed, phase, waveK, N-1
// texel 3: growthKey, parent, attachF, unused
const PARAM_TEXELS = 4;

const vertexShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uParams;
  uniform float uTime;
  uniform float uCharge;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uGlowPx;

  attribute vec3 aPrev;
  attribute vec3 aNext;
  // index along the tendril, side (-1/1), tendril id
  attribute vec3 aMeta;
  // width (css px), base opacity, last point index of this layer
  attribute vec3 aLayer;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vCut;

  vec4 P(int c, int r) { return texelFetch(uParams, ivec2(c, r), 0); }

  // Travelling wave base→tip: the base stays anchored, the tip whips.
  vec3 flexAt(int id, float f) {
    vec4 a = P(0, id);
    vec4 b = P(1, id);
    vec4 c = P(2, id);
    float w = pow(f, 1.5);
    float ang = uTime * c.x + c.y - f * c.z;
    return a.xyz * (a.w * w * sin(ang)) + b.xyz * (b.w * w * cos(ang));
  }

  float growthOf(int id) {
    vec4 m = P(3, id);
    if (m.y < 0.0) {
      float local = clamp((uCharge - m.x) / max(1.0 - m.x, 0.001), 0.0, 1.0);
      return pow(local, 1.5);
    }
    vec4 pm = P(3, int(m.y));
    float pg = pow(clamp((uCharge - pm.x) / max(1.0 - pm.x, 0.001), 0.0, 1.0), 1.5);
    float local = clamp((pg - m.x) / max(1.0 - m.x, 0.01), 0.0, 1.0);
    float inv = 1.0 - local;
    return 1.0 - inv * inv * inv;
  }

  vec3 displaced(vec3 p, float idx, int id) {
    vec4 m = P(3, id);
    vec3 o = flexAt(id, idx / P(2, id).w);
    // A branch rides its parent's flex at the attach point, so the join holds.
    if (m.y >= 0.0) o += flexAt(int(m.y), m.z);
    return p + o;
  }

  vec2 toScreen(vec4 clip) { return clip.xy / clip.w * uViewport * 0.5; }

  void main() {
    float idx = aMeta.x;
    float side = aMeta.y;
    int id = int(aMeta.z + 0.5);

    float samples = P(2, id).w + 1.0;
    // Continuous reveal limit (in point indices) for this layer.
    float limit = min(growthOf(id) * samples, aLayer.z + 1.0) - 1.0;
    vCut = limit - idx;

    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(displaced(position, idx, id), 1.0);
    vec4 cp = mvp * vec4(displaced(aPrev, max(idx - 1.0, 0.0), id), 1.0);
    vec4 cn = mvp * vec4(displaced(aNext, idx + 1.0, id), 1.0);

    vec2 s0 = toScreen(c0);
    vec2 dPrev = s0 - toScreen(cp);
    vec2 dNext = toScreen(cn) - s0;
    vec2 dir = normalize((length(dPrev) > 1e-4 ? normalize(dPrev) : vec2(0.0))
                       + (length(dNext) > 1e-4 ? normalize(dNext) : vec2(0.0)) + vec2(1e-6, 0.0));
    vec2 normal = vec2(-dir.y, dir.x);

    // Taper the last few points of the visible run: growing tips and layer
    // ends narrow instead of stopping square.
    float taper = mix(0.3, 1.0, smoothstep(0.0, 7.0, vCut));
    float width = aLayer.x * taper;
    // Below one device pixel a line can't get thinner without aliasing; hold
    // it at one pixel and trade the missing width for opacity instead.
    float minW = 1.0 / uPixelRatio;
    vAlpha = aLayer.y * clamp(width / minW, 0.0, 1.0);
    width = max(width, minW);
    vHalf = width * 0.5;
    float extent = vHalf + minW + uGlowPx;
    vDist = side * extent;

    c0.xy += normal * side * extent / (uViewport * 0.5) * c0.w;
    gl_Position = c0;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uGlowPx;
  uniform float uGlow;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vCut;

  void main() {
    if (vCut < -1.0) discard;
    float d = abs(vDist);
    // Analytic coverage in device pixels: sharp at any pixel ratio, no MSAA.
    float core = clamp((vHalf - d) * uPixelRatio + 0.5, 0.0, 1.0);
    float outside = max(d - vHalf, 0.0) / uGlowPx;
    float glow = uGlow * exp(-outside * outside * 3.0);
    float tip = clamp(vCut + 1.0, 0.0, 1.0);
    float a = max(core, glow) * vAlpha * uOpacity * tip;
    if (a < 0.002) discard;
    // A hot centre lifts the filament toward white, as the old bloom did.
    gl_FragColor = vec4(min(uColor + core * 0.45, vec3(1.0)) * min(a, 1.0), 1.0);
  }
`;

export function createTendrilFieldV2(parent: THREE.Object3D): RootsModule {
  const defs = buildLayout();

  const params = new Float32Array(defs.length * PARAM_TEXELS * 4);
  defs.forEach((d, row) => {
    const o = row * PARAM_TEXELS * 4;
    const f = d.flex;
    params.set([f.dir1.x, f.dir1.y, f.dir1.z, f.amp1], o);
    params.set([f.dir2.x, f.dir2.y, f.dir2.z, f.amp2], o + 4);
    params.set([f.speed, f.phase, f.waveK, d.points.length - 1], o + 8);
    const attachF = d.parent >= 0 ? d.attachIndex / (defs[d.parent].points.length - 1) : 0;
    params.set([d.growthKey, d.parent, attachF, 0], o + 12);
  });
  const paramTex = new THREE.DataTexture(params, PARAM_TEXELS, defs.length, THREE.RGBAFormat, THREE.FloatType);
  paramTex.needsUpdate = true;

  const pos: number[] = [];
  const prev: number[] = [];
  const next: number[] = [];
  const meta: number[] = [];
  const layer: number[] = [];
  const index: number[] = [];
  defs.forEach((d, id) => {
    const pts = d.points;
    for (const l of d.layers) {
      const endIdx = Math.max(2, Math.floor(pts.length * l.ratio));
      const base = pos.length / 3;
      for (let i = 0; i < endIdx; i++) {
        const p = pts[i];
        const pp = pts[Math.max(i - 1, 0)];
        const pn = pts[Math.min(i + 1, pts.length - 1)];
        for (const side of [-1, 1]) {
          pos.push(p.x, p.y, p.z);
          prev.push(pp.x, pp.y, pp.z);
          next.push(pn.x, pn.y, pn.z);
          meta.push(i, side, id);
          layer.push(l.width, l.opacity, endIdx - 1);
        }
        if (i < endIdx - 1) {
          const a = base + i * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
  });

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3));
  geom.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  geom.setAttribute('aMeta', new THREE.Float32BufferAttribute(meta, 3));
  geom.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 3));
  geom.setIndex(index);

  const uniforms = {
    uParams: { value: paramTex },
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uGlowPx: { value: 4.0 },
    uGlow: { value: 0.3 },
    uColor: { value: new THREE.Color(BASE_COLOR) },
    uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // Layers of one tendril overlap; MAX keeps the brightest instead of letting
    // a thinner layer's dim glow veil a thicker layer's core.
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    // Screen-space ribbons wind either way depending on the line's direction.
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.scale.setScalar(ROOTS_SCALE);
  parent.add(mesh);

  const baseColor = new THREE.Color(BASE_COLOR);
  const accentColor = new THREE.Color(ACCENT);

  const update = (charge: number, motionT: number) => {
    // Bounded sway instead of a spin: a full turn swings the in-plane tendrils
    // edge-on, where they pile into a tangle.
    mesh.rotation.y = Math.sin(motionT * 0.045) * 0.16;
    mesh.rotation.x = Math.sin(motionT * 0.06) * 0.05;
    mesh.position.y = Math.sin(motionT * 0.4) * 0.015;
    uniforms.uTime.value = motionT;
    uniforms.uCharge.value = charge;
  };

  const applyVisibility = (charge: number, rootsVis: number, jVis: number, brightnessMul = 1) => {
    uniforms.uColor.value.copy(baseColor).lerp(accentColor, charge > 0.01 ? charge * 0.4 : 0);
    uniforms.uOpacity.value = rootsVis * (0.05 + 0.95 * jVis) * brightnessMul;
  };

  const setViewport = (w: number, h: number, pixelRatio: number) => {
    uniforms.uViewport.value.set(w, h);
    uniforms.uPixelRatio.value = pixelRatio;
  };

  const dispose = () => {
    geom.dispose();
    mat.dispose();
    paramTex.dispose();
  };

  return { update, applyVisibility, setViewport, dispose };
}
