import * as THREE from 'three';
import { ACCENT, BASE_COLOR, ROOTS_SCALE } from '../gl/constants';
import type { RootsModule } from '../v2/roots';
import { buildFilamentGeometry, POINTS_PER_FILAMENT } from './filaments-layout';

// Thousands of hairline filaments braided into flowing bundles, one static
// mesh, one draw call. Growth, flow, width and the pulse all live in the
// shaders; the CPU only sets uniforms per frame.

const vertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uClock;
  uniform float uCharge;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uFlowAmp;
  uniform float uFlowSpeed;
  uniform float uSoft;
  uniform float uBaseDim;
  uniform float uPulseStart;
  uniform float uPulseSpeed;
  uniform float uPulseWidth;

  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute vec4 aMeta; // side, s, filament length, bundle phase
  attribute vec4 aLook; // width css px, alpha, teal, growth start

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vReveal;
  varying float vTeal;
  varying float vPulse;
  varying float vGrowing;

  const float DS = 1.0 / ${(POINTS_PER_FILAMENT - 1).toFixed(1)};

  vec3 flow(vec3 p, float t, float ph) {
    return vec3(
      sin(p.y * 1.7 + t * 0.35 + ph) + 0.5 * sin(p.z * 2.9 - t * 0.52 + p.x * 1.3),
      sin(p.z * 1.5 + t * 0.29 + ph * 1.3) + 0.5 * sin(p.x * 2.6 + t * 0.47),
      sin(p.x * 1.9 - t * 0.31) + 0.5 * sin(p.y * 2.3 + t * 0.41 + ph)
    );
  }

  // Sampled by position, so neighbouring filaments sway together and a bundle
  // moves as one strand; the fine term lets single hairs drift apart.
  vec3 displaced(vec3 p, float s, float len, float ph) {
    float w = pow(clamp(s * len / 2.2, 0.0, 1.3), 1.5);
    float t = uTime * uFlowSpeed;
    vec3 d = flow(p * 0.9, t, ph) * uFlowAmp
           + flow(p * 3.7 + ph, t * 1.7, ph * 2.0) * uFlowAmp * 0.18;
    d.z *= 0.6;
    return p + d * w;
  }

  vec2 toScreen(vec4 clip) { return clip.xy / clip.w * uViewport * 0.5; }

  void main() {
    float side = aMeta.x;
    float s = aMeta.y;
    float len = aMeta.z;
    float ph = aMeta.w;

    float gs = aLook.w;
    float g = pow(clamp((uCharge - gs) / max(1.0 - gs, 0.001), 0.0, 1.0), 1.6);
    vReveal = g * (1.0 + uSoft) - s;
    vGrowing = 1.0 - g;

    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(displaced(position, s, len, ph), 1.0);
    vec4 cp = mvp * vec4(displaced(aPrev, max(s - DS, 0.0), len, ph), 1.0);
    vec4 cn = mvp * vec4(displaced(aNext, min(s + DS, 1.0), len, ph), 1.0);

    vec2 s0 = toScreen(c0);
    vec2 dPrev = s0 - toScreen(cp);
    vec2 dNext = toScreen(cn) - s0;
    vec2 dir = normalize((length(dPrev) > 1e-4 ? normalize(dPrev) : vec2(0.0))
                       + (length(dNext) > 1e-4 ? normalize(dNext) : vec2(0.0)) + vec2(1e-6, 0.0));
    vec2 normal = vec2(-dir.y, dir.x);

    float arc = s * len;
    float width = aLook.x * mix(1.0, 0.55, s) * mix(0.5, 1.0, clamp(vReveal / uSoft, 0.0, 1.0));
    // Every filament converges on the core; thin them there so the overlap
    // reads as a hot root rather than a white blot.
    float along = mix(1.0, 0.3, s) * mix(uBaseDim, 1.0, smoothstep(0.0, 0.4, arc));
    // Hold one device pixel and trade the missing width for opacity.
    float minW = 1.0 / uPixelRatio;
    vAlpha = aLook.y * along * clamp(width / minW, 0.0, 1.0);
    width = max(width, minW);
    vHalf = width * 0.5;
    float extent = vHalf + minW;
    vDist = side * extent;
    vTeal = aLook.z;

    float front = (uClock - uPulseStart) * uPulseSpeed;
    float x = (arc - front) / uPulseWidth;
    vPulse = exp(-x * x) * (1.0 - smoothstep(1.6, 3.4, front));

    c0.xy += normal * side * extent / (uViewport * 0.5) * c0.w;
    gl_Position = c0;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uTeal;
  uniform vec3 uPulseColor;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uSoft;

  varying float vDist;
  varying float vHalf;
  varying float vAlpha;
  varying float vReveal;
  varying float vTeal;
  varying float vPulse;
  varying float vGrowing;

  void main() {
    if (vReveal <= 0.0) discard;
    float cov = clamp((vHalf - abs(vDist)) * uPixelRatio + 0.5, 0.0, 1.0);
    float tip = smoothstep(0.0, uSoft, vReveal);
    // Growing tips carry a brighter front, gone once the filament is grown.
    float fx = (vReveal - uSoft * 0.6) / (uSoft * 0.6);
    float frontGlow = exp(-fx * fx) * vGrowing;
    float a = min(cov * tip * vAlpha * uOpacity * (1.0 + frontGlow * 1.5 + vPulse * 2.5), 1.0);
    if (a < 0.002) discard;
    vec3 col = mix(uColor, uTeal, vTeal);
    col = mix(col, uPulseColor, min(vPulse, 1.0) * 0.8);
    gl_FragColor = vec4(col * a, a);
  }
`;

export function createFilaments(parent: THREE.Object3D): RootsModule {
  const g = buildFilamentGeometry();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
  geom.setAttribute('aPrev', new THREE.BufferAttribute(g.prev, 3));
  geom.setAttribute('aNext', new THREE.BufferAttribute(g.next, 3));
  geom.setAttribute('aMeta', new THREE.BufferAttribute(g.meta, 4));
  geom.setAttribute('aLook', new THREE.BufferAttribute(g.look, 4));
  geom.setIndex(new THREE.BufferAttribute(g.index, 1));

  const baseColor = new THREE.Color(BASE_COLOR);
  const accentColor = new THREE.Color(ACCENT);
  // The raw accent is near-black in linear space; lift it so teal hairs glow.
  const teal = accentColor.clone().multiplyScalar(3.0);

  const uniforms = {
    uTime: { value: 0 },
    uClock: { value: 0 },
    uCharge: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uFlowAmp: { value: 0.09 },
    uFlowSpeed: { value: 1.0 },
    uSoft: { value: 0.14 },
    uBaseDim: { value: 0.35 },
    uPulseStart: { value: -1e4 },
    uPulseSpeed: { value: 2.4 },
    uPulseWidth: { value: 0.22 },
    uColor: { value: baseColor.clone() },
    uTeal: { value: teal },
    uPulseColor: { value: new THREE.Color(0.62, 0.95, 0.88) },
    uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // Screen blend: converging filaments brighten toward white but approach it
    // asymptotically, which caps the pile-up at the core.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    // Screen-space ribbons wind either way depending on the line's direction.
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.scale.setScalar(ROOTS_SCALE);
  parent.add(mesh);

  const update = (charge: number, motionT: number, t: number) => {
    mesh.rotation.y = Math.sin(motionT * 0.045) * 0.16;
    mesh.rotation.x = Math.sin(motionT * 0.06) * 0.05;
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
    uniforms.uPulseStart.value = t;
  };

  const dispose = () => {
    parent.remove(mesh);
    geom.dispose();
    mat.dispose();
  };

  return { update, applyVisibility, setViewport, pulse, dispose };
}
