import * as THREE from 'three';
import { ACCENT, BASE_COLOR, CORE_R, ROOTS_SCALE } from '../gl/constants';
import type { RootsModule } from '../v2/roots';
import { buildFigure } from './discharge-figure';

// A Lichtenberg discharge that cools into veins. The whole figure is one static
// ribbon mesh; reveal, flicker, the lock flash, cooling, pulses and sway are all
// functions of (distance from the core, time) in the vertex shader, so the CPU
// only writes uniforms per frame.

export const DISCHARGE = {
  /** seconds for the lock flash to run root → tips */
  flashS: 0.4,
  /** seconds for a point to cool from white-hot to its vein colour after the flash passes */
  coolS: 2.0,
  /** seconds for a later pulse to run root → tips */
  pulseS: 0.9,
  /** pre-lock reach (fraction of the figure) of a full-strength leader at charge 1 */
  preReach: 0.85,
  /** soft growing tip length, mesh units */
  tipLen: 0.08,
  /** sway amplitude, mesh units */
  sway: 0.03,
  /** halo width in CSS px around every filament */
  glowPx: 3.5,
  /** teal-white of the pre-lock leaders */
  leadMix: 0.45,
};

const vertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uClock;
  uniform float uCharge;
  uniform float uLocked;
  uniform float uLockT;
  uniform float uPulseT;
  uniform float uMaxDist;
  uniform float uStill;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uGlowPx;
  uniform float uFlashS;
  uniform float uCoolS;
  uniform float uPulseS;
  uniform float uPreReach;
  uniform float uTipLen;
  uniform float uSway;

  attribute vec3 aPrev;
  attribute vec3 aNext;
  // dist from core, side (-1/1), width (css px)
  attribute vec3 aA;
  // branch seed, pre-lock reach, order
  attribute vec3 aB;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vBright;
  varying float vHot;
  varying float vTeal;
  varying float vGlow;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  // A wave that rolls outward along the tree. It depends only on position and
  // tree distance, which a fork shares with its parent, so joints never open.
  vec3 sway(vec3 p, float d, float amp) {
    float w = smoothstep(0.0, 1.4, d) * amp;
    float t = uTime;
    vec3 o = vec3(
      sin(d * 2.6 - t * 0.9 + p.y * 1.5) + 0.4 * sin(d * 5.1 - t * 1.7 + p.z * 2.0),
      cos(d * 2.2 - t * 0.75 + p.x * 1.7) + 0.4 * cos(d * 4.7 - t * 1.4 + 1.3),
      0.5 * sin(d * 3.0 - t * 0.8 + p.x * 2.3)
    );
    return p + o * w;
  }

  vec2 toScreen(vec4 clip) { return clip.xy / clip.w * uViewport * 0.5; }

  void main() {
    float d = aA.x;
    float side = aA.y;
    float n = d / uMaxDist;
    float seed = aB.x;

    float sinceLock = uClock - uLockT;
    float flashFront = uLocked * (uStill > 0.5 ? 2.0 : sinceLock / uFlashS);
    float preFront = pow(uCharge, 1.2) * uPreReach * (0.3 + 0.7 * aB.y);
    float front = max(preFront, flashFront * 1.2);
    float ahead = (front - n) * uMaxDist;
    float tip = clamp(ahead / uTipLen, 0.0, 1.0);

    // Before the lock the discharge crackles: whole branches blink out on a
    // fast random clock, and a ripple of brightness runs along each one.
    float frame = floor(uTime * 11.0);
    float blink = hash(seed * 97.3 + frame);
    float drop = step(blink, 0.12 + 0.05 * aB.z) * 0.85;
    float crackle = 0.7 + 0.3 * sin(d * 38.0 - uTime * 26.0 + seed * 40.0);
    float preB = (0.3 + 0.4 * uCharge) * crackle * (1.0 - drop) * (0.75 + 0.25 * hash(seed + frame));
    float leader = exp(-max(ahead, 0.0) / 0.12) * (1.0 - drop);
    // Each point leaves the crackle when the flash reaches it, goes white-hot,
    // then cools.
    float age = sinceLock - n * uFlashS;
    float preAmt = 1.0 - uLocked * smoothstep(0.0, 0.15, age);
    float heat = uLocked * (1.0 - uStill) * step(0.0, age) * pow(1.0 - clamp(age / uCoolS, 0.0, 1.0), 2.0);
    float fb = (n - flashFront) / 0.05;
    float flashBand = uLocked * (1.0 - uStill) * exp(-fb * fb);

    float pf = (uClock - uPulseT) / uPulseS;
    float pb = (n - pf) / 0.08;
    float pulse = uStill > 0.5
      ? 0.4 * exp(-(uClock - uPulseT) * 2.0)
      : 0.7 * exp(-pb * pb) * (1.0 - smoothstep(0.9, 1.3, pf));

    float breath = uStill > 0.5 ? 1.0 : 0.86 + 0.14 * sin(uTime * 1.1 - d * 2.4);
    float cooled = 0.9 * breath;

    vBright = mix(cooled, preB + leader * 0.6, preAmt) + heat * 0.5 + flashBand * 1.2 + pulse;
    vHot = clamp(leader * preAmt + heat + flashBand + pulse * 0.6, 0.0, 1.0);
    vTeal = preAmt;
    vGlow = 0.18 + 0.4 * clamp(heat + flashBand + pulse, 0.0, 1.0) + 0.25 * leader * preAmt;

    float amp = uSway * mix(1.0, 0.4, preAmt) * (1.0 - uStill);
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(sway(position, d, amp), 1.0);
    vec4 cp = mvp * vec4(sway(aPrev, d, amp), 1.0);
    vec4 cn = mvp * vec4(sway(aNext, d, amp), 1.0);

    vec2 s0 = toScreen(c0);
    vec2 dPrev = s0 - toScreen(cp);
    vec2 dNext = toScreen(cn) - s0;
    vec2 dir = normalize((length(dPrev) > 1e-4 ? normalize(dPrev) : vec2(0.0))
                       + (length(dNext) > 1e-4 ? normalize(dNext) : vec2(0.0)) + vec2(1e-6, 0.0));
    vec2 normal = vec2(-dir.y, dir.x);

    // Growing tips narrow to a point; hot channels swell a little.
    float taper = mix(0.35, 1.0, smoothstep(0.0, 0.25, ahead));
    float width = aA.z * taper * (1.0 + 0.35 * clamp(heat + flashBand, 0.0, 1.0));
    // Below one device pixel a line can't get thinner without aliasing; hold
    // it at one pixel and trade the missing width for opacity instead.
    float minW = 1.0 / uPixelRatio;
    vAlpha = clamp(width / minW, 0.0, 1.0) * tip;
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
  uniform vec3 uColdColor;
  uniform vec3 uLeadColor;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uGlowPx;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vBright;
  varying float vHot;
  varying float vTeal;
  varying float vGlow;

  void main() {
    float d = abs(vDist);
    // Analytic coverage in device pixels: sharp at any pixel ratio.
    float core = clamp((vHalf - d) * uPixelRatio + 0.5, 0.0, 1.0);
    float outside = max(d - vHalf, 0.0) / uGlowPx;
    float glow = vGlow * exp(-outside * outside * 3.0);
    float a = max(core, glow) * vAlpha * uOpacity;
    if (a < 0.002) discard;
    vec3 hot = mix(vec3(1.0), uLeadColor, vTeal);
    vec3 col = mix(uColdColor, hot, vHot);
    // A hot centre lifts the filament toward white, standing in for bloom.
    col = min(col * vBright + core * 0.4 * vBright, vec3(1.0));
    gl_FragColor = vec4(col * min(a, 1.0), 1.0);
  }
`;

export function createDischarge(parent: THREE.Object3D): RootsModule {
  // Bases tuck just under the core surface, hidden at the bottom of its breath.
  const figure = buildFigure((CORE_R / ROOTS_SCALE) * 0.9);

  const vertCount = figure.pointCount * 2;
  const pos = new Float32Array(vertCount * 3);
  const prev = new Float32Array(vertCount * 3);
  const next = new Float32Array(vertCount * 3);
  const attrA = new Float32Array(vertCount * 3);
  const attrB = new Float32Array(vertCount * 3);
  const index: number[] = [];
  let v = 0;
  for (const b of figure.branches) {
    const count = b.dist.length;
    const base = v;
    for (let i = 0; i < count; i++) {
      const ip = Math.max(i - 1, 0) * 3;
      const ic = i * 3;
      const inx = Math.min(i + 1, count - 1) * 3;
      for (const side of [-1, 1]) {
        const o = v * 3;
        for (let k = 0; k < 3; k++) {
          pos[o + k] = b.pts[ic + k];
          prev[o + k] = b.pts[ip + k];
          next[o + k] = b.pts[inx + k];
        }
        attrA.set([b.dist[i], side, b.width[i]], o);
        attrB.set([b.seed, b.reach, b.order], o);
        v++;
      }
      if (i < count - 1) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3));
  geom.setAttribute('aNext', new THREE.BufferAttribute(next, 3));
  geom.setAttribute('aA', new THREE.BufferAttribute(attrA, 3));
  geom.setAttribute('aB', new THREE.BufferAttribute(attrB, 3));
  geom.setIndex(index);

  const white = new THREE.Color(BASE_COLOR);
  const accent = new THREE.Color(ACCENT);
  // The muted accent is too dark to read as heat on its own; lift it toward
  // white so leaders glow teal instead of dimming.
  const lead = accent.clone().multiplyScalar(3).lerp(white, 1 - DISCHARGE.leadMix);

  const uniforms = {
    uTime: { value: 0 },
    uClock: { value: 0 },
    uCharge: { value: 0 },
    uLocked: { value: 0 },
    uLockT: { value: 0 },
    uPulseT: { value: -1e4 },
    uMaxDist: { value: figure.maxDist },
    uStill: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uGlowPx: { value: DISCHARGE.glowPx },
    uFlashS: { value: DISCHARGE.flashS },
    uCoolS: { value: DISCHARGE.coolS },
    uPulseS: { value: DISCHARGE.pulseS },
    uPreReach: { value: DISCHARGE.preReach },
    uTipLen: { value: DISCHARGE.tipLen },
    uSway: { value: DISCHARGE.sway },
    uColdColor: { value: white.clone() },
    uLeadColor: { value: lead },
    uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // Crossing channels keep the brighter one instead of stacking into blobs.
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    // Screen-space ribbons wind either way depending on the line's direction.
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.scale.setScalar(ROOTS_SCALE);
  parent.add(mesh);

  let lastMotionT = NaN;
  let lastT = NaN;
  const update = (charge: number, motionT: number, t: number) => {
    // Reduced motion freezes motionT while the clock runs: drop the travelling
    // flash, flicker and sway and let the figure simply appear.
    const still = motionT === lastMotionT && t !== lastT;
    lastMotionT = motionT;
    lastT = t;
    uniforms.uStill.value = still ? 1 : 0;
    mesh.rotation.y = Math.sin(motionT * 0.045) * 0.16;
    mesh.rotation.x = Math.sin(motionT * 0.06) * 0.05;
    uniforms.uTime.value = motionT;
    uniforms.uClock.value = t;
    uniforms.uCharge.value = charge;
  };

  const pulse = (t: number) => {
    if (uniforms.uLocked.value === 0) {
      uniforms.uLocked.value = 1;
      uniforms.uLockT.value = t;
    } else {
      uniforms.uPulseT.value = t;
    }
  };

  const applyVisibility = (charge: number, rootsVis: number, jVis: number, brightnessMul = 1) => {
    uniforms.uColdColor.value.copy(white).lerp(accent, charge * 0.4);
    uniforms.uOpacity.value = rootsVis * (0.05 + 0.95 * jVis) * brightnessMul;
  };

  const setViewport = (w: number, h: number, pixelRatio: number) => {
    uniforms.uViewport.value.set(w, h);
    uniforms.uPixelRatio.value = pixelRatio;
  };

  const dispose = () => {
    parent.remove(mesh);
    geom.dispose();
    mat.dispose();
  };

  return { update, applyVisibility, setViewport, pulse, dispose };
}
