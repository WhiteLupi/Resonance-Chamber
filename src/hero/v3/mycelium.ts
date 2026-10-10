import * as THREE from 'three';
import { ACCENT, BASE_COLOR, CORE_R, ROOTS_SCALE } from '../gl/constants';
import type { RootsModule } from '../v2/roots';
import { growMycelium } from './mycelium-tree';
import { growParams } from './mycelium-layout';

// Mycelium roots: a space-colonization tree baked into one static ribbon mesh.
// Every vertex carries its arclength from the core (s), so growth, sway and the
// light impulses are all functions of s evaluated on the GPU: one draw call,
// uniforms only per frame.

const PULSE_SLOTS = 4;

// Tuning knobs (local units: 1 ≈ 425 CSS px at 1080p).
const TUNE = {
  /** arclength over which a growing tip narrows to a point */
  growTaper: 0.28,
  /** brightness of a resting filament; headroom for impulses to read on top */
  baseLevel: 0.72,
  /** whitening of a filament's centre line (the old bloom's hot core) */
  coreLift: 0.12,
  /** sway amplitude at the far tips */
  sway: 0.07,
  /** arclength at which sway reaches full amplitude */
  swayReach: 2.4,
  /** idle brightness ripple, 0 = off */
  shimmer: 0.14,
  /** impulse front speed, local units / s */
  pulseSpeed: 1.9,
  /** half-width of the bright head of an impulse */
  pulseHead: 0.07,
  /** decay length of the trail behind the head */
  pulseTrail: 0.35,
  /** extra ribbon width under an impulse, CSS px */
  pulseSwell: 1.6,
  /** halo radius at rest / added under an impulse, CSS px */
  glowPx: 3.0,
  pulseGlowPx: 6.0,
  /** halo strength at rest */
  glow: 0.22,
};

const vertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uClock;
  uniform float uCharge;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uPulses[${PULSE_SLOTS}];

  attribute vec3 aPrev;
  attribute vec3 aNext;
  // side (-1/1), arclength from core, width in CSS px
  attribute vec3 aMeta;
  // trunk growth start (charge), trunk length
  attribute vec2 aGrow;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vCut;
  varying float vPulse;
  varying float vShimmer;
  varying float vGlowPx;

  // A displacement field over rest position and arclength. Both are continuous
  // across a fork, so a shoot moves exactly with its parent where they meet;
  // weight 0 at s = 0 anchors the bases in the core.
  vec3 sway(vec3 p, float s) {
    float w = pow(clamp(s / ${TUNE.swayReach.toFixed(3)}, 0.0, 1.0), 1.5) * ${TUNE.sway.toFixed(3)};
    vec2 u = normalize(p.xy + vec2(1e-5, 0.0));
    float ph = dot(p, vec3(1.3, 0.9, 1.7));
    float a = sin(uTime * 0.9 - s * 2.6 + ph);
    float b = sin(uTime * 0.63 - s * 3.7 + ph * 1.7 + 1.3);
    return (vec3(-u.y, u.x, 0.0) * a + vec3(u * 0.3, 0.8) * b * 0.5) * w;
  }

  float impulse(float s, float len) {
    float tipFade = 1.0 - smoothstep(0.55, 1.0, s / len);
    float best = 0.0;
    for (int k = 0; k < ${PULSE_SLOTS}; k++) {
      float age = uClock - uPulses[k];
      if (age < 0.0 || age > 4.0) continue;
      float d = s - age * ${TUNE.pulseSpeed.toFixed(3)};
      float head = d / ${TUNE.pulseHead.toFixed(3)};
      float band = d > 0.0 ? exp(-head * head) : exp(d / ${TUNE.pulseTrail.toFixed(3)});
      best = max(best, band * (1.0 - smoothstep(2.5, 4.0, age)));
    }
    return best * tipFade;
  }

  vec2 toScreen(vec4 clip) { return clip.xy / clip.w * uViewport * 0.5; }

  void main() {
    float side = aMeta.x;
    float s = aMeta.y;

    float local = clamp((uCharge - aGrow.x) / max(1.0 - aGrow.x, 0.001), 0.0, 1.0);
    float front = pow(local, 1.5) * (aGrow.y + ${TUNE.growTaper.toFixed(3)});
    vCut = front - s;

    float sPrev = s - distance(position, aPrev);
    float sNext = s + distance(position, aNext);
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(position + sway(position, s), 1.0);
    vec4 cp = mvp * vec4(aPrev + sway(aPrev, sPrev), 1.0);
    vec4 cn = mvp * vec4(aNext + sway(aNext, sNext), 1.0);

    vec2 s0 = toScreen(c0);
    vec2 dPrev = s0 - toScreen(cp);
    vec2 dNext = toScreen(cn) - s0;
    vec2 dir = normalize((length(dPrev) > 1e-4 ? normalize(dPrev) : vec2(0.0))
                       + (length(dNext) > 1e-4 ? normalize(dNext) : vec2(0.0)) + vec2(1e-6, 0.0));
    vec2 normal = vec2(-dir.y, dir.x);

    vPulse = impulse(s, aGrow.y);
    vShimmer = 1.0 - ${TUNE.shimmer.toFixed(3)} * (0.5 + 0.5 * sin(s * 7.0 - uTime * 1.1 + dot(position, vec3(2.1, 1.7, 0.9))));

    float taper = mix(0.15, 1.0, smoothstep(0.0, ${TUNE.growTaper.toFixed(3)}, vCut));
    float width = aMeta.z * taper + vPulse * ${TUNE.pulseSwell.toFixed(3)};
    // Below one device pixel a line can't get thinner without aliasing; hold
    // it at one pixel and trade the missing width for opacity instead.
    float minW = 1.0 / uPixelRatio;
    vAlpha = clamp(width / minW, 0.0, 1.0);
    width = max(width, minW);
    vHalf = width * 0.5;
    vGlowPx = ${TUNE.glowPx.toFixed(3)} + vPulse * ${TUNE.pulseGlowPx.toFixed(3)};
    float extent = vHalf + minW + vGlowPx;
    vDist = side * extent;

    c0.xy += normal * side * extent / (uViewport * 0.5) * c0.w;
    gl_Position = c0;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uPulseColor;
  uniform float uOpacity;
  uniform float uPixelRatio;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vCut;
  varying float vPulse;
  varying float vShimmer;
  varying float vGlowPx;

  void main() {
    if (vCut < 0.0) discard;
    float d = abs(vDist);
    // Analytic coverage in device pixels: sharp at any pixel ratio.
    float core = clamp((vHalf - d) * uPixelRatio + 0.5, 0.0, 1.0);
    float outside = max(d - vHalf, 0.0) / vGlowPx;
    float halo = exp(-outside * outside * 3.0);
    // ~1px soft edge on the growing front (local units).
    float tip = clamp(vCut * 400.0, 0.0, 1.0);
    vec3 filament = min(uColor * ${TUNE.baseLevel.toFixed(3)} + core * ${TUNE.coreLift.toFixed(3)}, vec3(1.0))
      * max(core, ${TUNE.glow.toFixed(3)} * halo) * vAlpha * vShimmer;
    vec3 impulse = (uPulseColor + core * 0.6) * vPulse * max(core, halo * 0.85);
    vec3 col = min((filament + impulse) * uOpacity * tip, vec3(1.0));
    if (max(col.r, max(col.g, col.b)) < 0.002) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createMycelium(parent: THREE.Object3D): RootsModule {
  const params = growParams((CORE_R / ROOTS_SCALE) * 0.9);
  const tree = growMycelium(params);

  const pos: number[] = [];
  const prev: number[] = [];
  const next: number[] = [];
  const meta: number[] = [];
  const grow: number[] = [];
  const index: number[] = [];
  for (const c of tree.chains) {
    const n = c.s.length;
    const start = params.lobes[c.trunk].start;
    const trunkLen = tree.trunkLen[c.trunk];
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = i * 3;
      const pa = Math.max(i - 1, 0) * 3;
      const na = Math.min(i + 1, n - 1) * 3;
      for (const side of [-1, 1]) {
        pos.push(c.pos[a], c.pos[a + 1], c.pos[a + 2]);
        prev.push(c.pos[pa], c.pos[pa + 1], c.pos[pa + 2]);
        next.push(c.pos[na], c.pos[na + 1], c.pos[na + 2]);
        meta.push(side, c.s[i], c.width[i]);
        grow.push(start, trunkLen);
      }
      if (i < n - 1) {
        const v = base + i * 2;
        index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3));
  geom.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  geom.setAttribute('aMeta', new THREE.Float32BufferAttribute(meta, 3));
  geom.setAttribute('aGrow', new THREE.Float32BufferAttribute(grow, 2));
  geom.setIndex(index);

  const accentColor = new THREE.Color(ACCENT);
  const uniforms = {
    uTime: { value: 0 },
    uClock: { value: 0 },
    uCharge: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uPulses: { value: new Array<number>(PULSE_SLOTS).fill(-1e3) },
    uColor: { value: new THREE.Color(BASE_COLOR) },
    uPulseColor: { value: accentColor.clone().multiplyScalar(2.5).lerp(new THREE.Color(1, 1, 1), 0.35) },
    uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // MAX: a shoot overlapping its parent at the fork keeps the brighter of
    // the two instead of doubling up into a bright knot.
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
  let pulseSlot = 0;

  const update = (charge: number, motionT: number, t: number) => {
    mesh.rotation.y = Math.sin(motionT * 0.045) * 0.16;
    mesh.rotation.x = Math.sin(motionT * 0.06) * 0.05;
    mesh.position.y = Math.sin(motionT * 0.4) * 0.015;
    uniforms.uTime.value = motionT;
    uniforms.uClock.value = t;
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

  const pulse = (t: number) => {
    uniforms.uPulses.value[pulseSlot] = t;
    pulseSlot = (pulseSlot + 1) % PULSE_SLOTS;
  };

  const dispose = () => {
    parent.remove(mesh);
    geom.dispose();
    mat.dispose();
  };

  return { update, applyVisibility, setViewport, pulse, dispose };
}
