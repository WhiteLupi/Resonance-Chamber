import * as THREE from 'three';
import { ACCENT } from '../gl/constants';

// Camera-facing quads whose falloff is computed per pixel, not sampled from a
// 256px canvas texture — a ring scaled to fill the viewport stays sharp, and a
// soft glow has no texture banding.
const billboardVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
    center.xy += position.xy * scale;
    gl_Position = projectionMatrix * center;
  }
`;

const quad = new THREE.PlaneGeometry(1, 1);

const additive = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: billboardVertex,
    fragmentShader,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

// Soft accent halo around the core plus the luminous spill the old bloom pass
// gave it — one quad of fill instead of a fullscreen blur chain.
const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHalo;
  uniform float uBloom;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r >= 1.0) discard;
    // Halo: same stops as the old radial gradient (0.55 → 0.30 → 0.08 → 0).
    // The quad is twice the halo's size so the bloom spill has room.
    float rh = r * 2.0;
    float halo = rh < 0.3 ? mix(0.55, 0.30, rh / 0.3)
               : rh < 0.7 ? mix(0.30, 0.08, (rh - 0.3) / 0.4)
               : rh < 1.0 ? mix(0.08, 0.0, (rh - 0.7) / 0.3)
               : 0.0;
    float bloom = exp(-r * r * 9.0) + 0.35 * exp(-r * 4.0);
    bloom *= 1.0 - smoothstep(0.75, 1.0, r);
    // The spill whitens toward the centre, where the old bloom saturated.
    vec3 spill = mix(uColor * 2.0, vec3(1.0), exp(-r * r * 40.0));
    vec3 col = uColor * halo * uHalo + spill * bloom * uBloom;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createCoreGlow(parent: THREE.Object3D) {
  const uniforms = {
    uColor: { value: new THREE.Color(ACCENT) },
    uHalo: { value: 0.28 },
    uBloom: { value: 0.2 },
  };
  const mat = additive(glowFragment, uniforms);
  const halo = new THREE.Mesh(quad, mat);
  halo.frustumCulled = false;
  parent.add(halo);
  const update = (haloScale: number, haloOpacity: number, bloomStrength: number) => {
    // The halo quad doubles as the bloom carrier; the old halo sprite was
    // 1.0–1.5 units and the bloom spill reached ~2× that.
    halo.scale.setScalar(haloScale * 2.0);
    uniforms.uHalo.value = haloOpacity;
    uniforms.uBloom.value = bloomStrength;
  };
  return { update, dispose: () => mat.dispose() };
}

// Sonar rings: discrete outward pulses fired on press and on lock.
const RING_COUNT = 10;
const RING_DURATION = 6.0;
const RING_MIN_SCALE = 0.5;
const RING_MAX_SCALE = 9.0;

const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    // The old canvas gradient ran from radius 80 to 128 of 128: map to t.
    float t = (r * 128.0 - 80.0) / 48.0;
    float a = t < 0.70 ? 0.0
            : t < 0.86 ? mix(0.0, 0.30, (t - 0.70) / 0.16)
            : t < 0.94 ? mix(0.30, 0.80, (t - 0.86) / 0.08)
            : t < 0.98 ? mix(0.80, 0.35, (t - 0.94) / 0.04)
            : t < 1.0 ? mix(0.35, 0.0, (t - 0.98) / 0.02)
            : 0.0;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
  }
`;

type Ring = { mesh: THREE.Mesh; uniforms: { uOpacity: { value: number } }; active: boolean; startT: number };

export function createSonarRingsV2(enabled: boolean, parent: THREE.Object3D) {
  const rings: Ring[] = [];
  const mats: THREE.ShaderMaterial[] = [];
  if (enabled) {
    for (let i = 0; i < RING_COUNT; i++) {
      const uniforms = { uColor: { value: new THREE.Color(ACCENT) }, uOpacity: { value: 0 } };
      const mat = additive(ringFragment, uniforms);
      mats.push(mat);
      const mesh = new THREE.Mesh(quad, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      parent.add(mesh);
      rings.push({ mesh, uniforms, active: false, startT: 0 });
    }
  }

  // Recycle the least visible ring when the pool is full, so a reset is never seen.
  const trigger = (now: number) => {
    if (!enabled) return;
    const target = rings.find((r) => !r.active)
      ?? rings.reduce((a, b) => (a.uniforms.uOpacity.value < b.uniforms.uOpacity.value ? a : b));
    target.active = true;
    target.startT = now;
  };

  const update = (t: number, breath: number, opacityMul: number) => {
    for (const r of rings) {
      const local = r.active ? (t - r.startT) / RING_DURATION : 1;
      if (local >= 1) {
        r.active = false;
        r.mesh.visible = false;
        r.uniforms.uOpacity.value = 0;
        continue;
      }
      r.mesh.visible = true;
      r.mesh.scale.setScalar((RING_MIN_SCALE + local * (RING_MAX_SCALE - RING_MIN_SCALE)) * breath);
      // Fast rise, long dissolve into the walls.
      const rise = Math.min(1, local / 0.08);
      const fall = Math.pow(1 - Math.max(0, (local - 0.08) / 0.92), 0.7);
      r.uniforms.uOpacity.value = rise * fall * 0.55 * opacityMul;
    }
  };

  const dispose = () => {
    for (const m of mats) m.dispose();
  };

  return { trigger, update, dispose };
}
