import * as THREE from 'three';
import { prefersReducedMotion } from '../../motion';
import { ACCENT, BASE_COLOR, CORE_R, ROOTS_SCALE } from '../gl/constants';
import type { RootsModule } from '../v2/roots';
import { buildFigure } from './veins-figure';

// Veins that grow out of the core while it charges. The figure is one static
// ribbon mesh; growth, sway, breathing and light waves are functions of
// (distance from the core, time) in the vertex shader, so the CPU only writes
// uniforms per frame.

export const VEINS = {
  /** branches with less vigour start growing this much later (fraction of the charge) */
  stagger: 0.3,
  /** ease-in exponent of the growth front */
  growEase: 1.4,
  /** soft growing tip length, mesh units */
  tipLen: 0.08,
  /** seconds for a light wave to run root → tips */
  waveS: 1.2,
  /** wave brightness on lock, and on later presses */
  lockWave: 1.0,
  pressWave: 0.6,
  /** sway amplitude, mesh units */
  sway: 0.03,
  /** halo width in CSS px around every filament */
  glowPx: 3.5,
  /** teal-white of the growing tips */
  tipMix: 0.45,
};

const vertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uClock;
  uniform float uCharge;
  uniform float uLockT;
  uniform float uWaveT;
  uniform float uWaveAmp;
  uniform float uMaxDist;
  uniform float uStill;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uGlowPx;
  uniform float uStagger;
  uniform float uGrowEase;
  uniform float uTipLen;
  uniform float uWaveS;
  uniform float uSway;
  uniform float uDepthRange;

  attribute vec3 aPrev;
  attribute vec3 aNext;
  // dist from core, side (-1/1), width (css px)
  attribute vec3 aA;
  // vigour 0..1
  attribute float aVigour;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vBright;
  varying float vTip;
  varying float vGlow;

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

    // Weaker branches wait a little, but every front reaches the tips exactly
    // as the charge completes.
    float delay = (1.0 - aVigour) * uStagger;
    float local = clamp((uCharge - delay) / (1.0 - delay), 0.0, 1.0);
    float front = pow(local, uGrowEase) * (1.0 + uTipLen / uMaxDist);
    float ahead = (front - n) * uMaxDist;
    float reveal = clamp(ahead / uTipLen, 0.0, 1.0);

    // Growing tips carry a soft teal-white light that settles once locked.
    float settled = smoothstep(0.0, 1.0, uClock - uLockT);
    vTip = exp(-max(ahead, 0.0) / 0.1) * (1.0 - settled) * step(0.001, uCharge);

    float waveAge = uClock - uWaveT;
    float wf = waveAge / uWaveS;
    float wb = (n - wf) / 0.1;
    float wave = uStill > 0.5
      ? 0.4 * exp(-waveAge * 2.0)
      : exp(-wb * wb) * (1.0 - smoothstep(0.9, 1.3, wf));
    wave *= uWaveAmp;

    float breath = uStill > 0.5 ? 1.0 : 0.88 + 0.12 * sin(uTime * 1.1 - d * 2.4);
    // Brightens as it charges, then rests at full strength.
    float level = mix(0.55 + 0.35 * uCharge, 0.9, settled);
    vBright = level * breath + vTip * 0.5 + wave;
    vGlow = 0.18 + 0.35 * clamp(wave + vTip, 0.0, 1.0);

    float amp = uSway * mix(0.5, 1.0, uCharge) * (1.0 - uStill);
    vec4 view = modelViewMatrix * vec4(sway(position, d, amp), 1.0);
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = projectionMatrix * view;
    vec4 cp = mvp * vec4(sway(aPrev, d, amp), 1.0);
    vec4 cn = mvp * vec4(sway(aNext, d, amp), 1.0);

    // Depth cue: veins behind the core recede (dimmer, finer), veins in front
    // come forward, so the figure reads as a volume while the camera orbits.
    float centerZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
    float nearness = clamp((view.z - centerZ) / uDepthRange * 0.5 + 0.5, 0.0, 1.0);
    vBright *= mix(0.45, 1.15, nearness);

    vec2 s0 = toScreen(c0);
    vec2 dPrev = s0 - toScreen(cp);
    vec2 dNext = toScreen(cn) - s0;
    vec2 dir = normalize((length(dPrev) > 1e-4 ? normalize(dPrev) : vec2(0.0))
                       + (length(dNext) > 1e-4 ? normalize(dNext) : vec2(0.0)) + vec2(1e-6, 0.0));
    vec2 normal = vec2(-dir.y, dir.x);

    // Growing tips narrow to a point; a passing wave swells the channel a little.
    float taper = mix(0.35, 1.0, smoothstep(0.0, 0.25, ahead));
    float width = aA.z * taper * (1.0 + 0.25 * clamp(wave, 0.0, 1.0)) * mix(0.65, 1.2, nearness);
    // Below one device pixel a line can't get thinner without aliasing; hold
    // it at one pixel and trade the missing width for opacity instead.
    float minW = 1.0 / uPixelRatio;
    vAlpha = clamp(width / minW, 0.0, 1.0) * reveal;
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
  uniform vec3 uTipColor;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uGlowPx;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vBright;
  varying float vTip;
  varying float vGlow;

  void main() {
    float d = abs(vDist);
    // Analytic coverage in device pixels: sharp at any pixel ratio.
    float core = clamp((vHalf - d) * uPixelRatio + 0.5, 0.0, 1.0);
    float outside = max(d - vHalf, 0.0) / uGlowPx;
    float glow = vGlow * exp(-outside * outside * 3.0);
    float a = max(core, glow) * vAlpha * uOpacity;
    if (a < 0.002) discard;
    vec3 col = mix(uColor, uTipColor, clamp(vTip, 0.0, 1.0));
    // A hot centre lifts the filament toward white, standing in for bloom.
    col = min(col * vBright + core * 0.4 * vBright, vec3(1.0));
    gl_FragColor = vec4(col * min(a, 1.0), 1.0);
  }
`;

export function createVeins(parent: THREE.Object3D): RootsModule {
  // Bases tuck just under the core surface, hidden at the bottom of its breath.
  const figure = buildFigure((CORE_R / ROOTS_SCALE) * 0.9);

  const vertCount = figure.pointCount * 2;
  const pos = new Float32Array(vertCount * 3);
  const prev = new Float32Array(vertCount * 3);
  const next = new Float32Array(vertCount * 3);
  const attrA = new Float32Array(vertCount * 3);
  const vigour = new Float32Array(vertCount);
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
        vigour[v] = b.reach;
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
  geom.setAttribute('aVigour', new THREE.BufferAttribute(vigour, 1));
  geom.setIndex(index);

  const white = new THREE.Color(BASE_COLOR);
  const accent = new THREE.Color(ACCENT);
  // The muted accent is too dark to read as light on its own; lift it toward
  // white so growing tips glow teal instead of dimming.
  const tipColor = accent.clone().multiplyScalar(3).lerp(white, 1 - VEINS.tipMix);

  const uniforms = {
    uTime: { value: 0 },
    uClock: { value: 0 },
    uCharge: { value: 0 },
    uLockT: { value: 1e9 },
    uWaveT: { value: -1e4 },
    uWaveAmp: { value: 0 },
    uMaxDist: { value: figure.maxDist },
    uStill: { value: prefersReducedMotion() ? 1 : 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uGlowPx: { value: VEINS.glowPx },
    uStagger: { value: VEINS.stagger },
    uGrowEase: { value: VEINS.growEase },
    uTipLen: { value: VEINS.tipLen },
    uWaveS: { value: VEINS.waveS },
    uSway: { value: VEINS.sway },
    // view-space half-depth of the figure (mesh extent × ROOTS_SCALE × seal scale)
    uDepthRange: { value: 4.0 },
    uColor: { value: white.clone() },
    uTipColor: { value: tipColor },
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

  let locked = false;

  const update = (charge: number, motionT: number, t: number) => {
    mesh.rotation.y = Math.sin(motionT * 0.045) * 0.16;
    mesh.rotation.x = Math.sin(motionT * 0.06) * 0.05;
    uniforms.uTime.value = motionT;
    uniforms.uClock.value = t;
    uniforms.uCharge.value = charge;
  };

  // The first pulse is the lock: a full-strength wave that also settles the
  // growing tips. Later presses send a softer one.
  const pulse = (t: number) => {
    if (!locked) {
      locked = true;
      uniforms.uLockT.value = t;
    }
    uniforms.uWaveT.value = t;
    uniforms.uWaveAmp.value = uniforms.uWaveT.value === uniforms.uLockT.value ? VEINS.lockWave : VEINS.pressWave;
  };

  const applyVisibility = (charge: number, rootsVis: number, jVis: number, brightnessMul = 1) => {
    uniforms.uColor.value.copy(white).lerp(accent, charge * 0.4);
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
