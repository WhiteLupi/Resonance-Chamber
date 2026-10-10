import * as THREE from 'three';

const COMET_COUNT = 24;

// Comets orbit on fixed random planes, so a head's position is a closed-form
// function of its phase: the shader evaluates it, the CPU only advances one
// shared phase clock (speed changes with charge). Each comet is a screen-space
// ribbon from a dim tail to a bright head, antialiased in the fragment shader.
const vertexShader = /* glsl */ `
  uniform float uClock;
  uniform float uTrailK;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  attribute vec3 aU;
  attribute vec3 aV;
  // radius, phase0, base speed
  attribute vec3 aOrbit;
  // x: 0 tail / 1 head, y: side
  attribute vec2 aEnd;
  varying float vHead;
  varying float vDist;
  varying float vHalf;

  void main() {
    float ph = aOrbit.y + aOrbit.z * uClock;
    float r = aOrbit.x;
    vec3 head = (cos(ph) * aU + sin(ph) * aV) * r;
    vec3 tangent = -sin(ph) * aU + cos(ph) * aV;
    float trail = min(0.46, r * aOrbit.z * uTrailK);
    vec3 tail = head - tangent * trail;

    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 ch = mvp * vec4(head, 1.0);
    vec4 ct = mvp * vec4(tail, 1.0);
    vec2 sh = ch.xy / ch.w * uViewport * 0.5;
    vec2 st = ct.xy / ct.w * uViewport * 0.5;
    vec2 dir = normalize(sh - st + vec2(1e-5, 0.0));
    vec2 normal = vec2(-dir.y, dir.x);

    vec4 c = aEnd.x > 0.5 ? ch : ct;
    vHalf = 0.5 / uPixelRatio + 0.35;
    float extent = vHalf + 1.5;
    vDist = aEnd.y * extent;
    c.xy += normal * aEnd.y * extent / (uViewport * 0.5) * c.w;
    vHead = aEnd.x;
    gl_Position = c;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPixelRatio;
  varying float vHead;
  varying float vDist;
  varying float vHalf;
  void main() {
    float d = abs(vDist);
    float core = clamp((vHalf - d) * uPixelRatio + 0.5, 0.0, 1.0);
    float glow = 0.25 * exp(-max(d - vHalf, 0.0) * 1.6);
    float bright = mix(0.08, 1.0, vHead * vHead);
    gl_FragColor = vec4(uColor * bright * max(core, glow) * uOpacity, 1.0);
  }
`;

// `accent` is shared with the rest of the scene; its changes show up here live.
export function createComets(enabled: boolean, parent: THREE.Object3D, accent: THREE.Color) {
  const count = enabled ? COMET_COUNT : 0;
  const u = new Float32Array(count * 3);
  const v = new Float32Array(count * 3);
  const orbit = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const n = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    const ref = Math.abs(n.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const uu = new THREE.Vector3().crossVectors(n, ref).normalize();
    const vv = new THREE.Vector3().crossVectors(n, uu);
    u.set([uu.x, uu.y, uu.z], i * 3);
    v.set([vv.x, vv.y, vv.z], i * 3);
    orbit.set([2.5 + Math.random() * 0.7, Math.random() * Math.PI * 2, 0.7 + Math.random() * 0.5], i * 3);
  }

  let clock = 0;
  if (!enabled) {
    return {
      update: () => {},
      setViewport: () => {},
      setOpacity: () => {},
      dispose: () => {},
    };
  }

  const pos: number[] = [], aU: number[] = [], aV: number[] = [], aOrbit: number[] = [], aEnd: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    for (const [end, side] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
      pos.push(0, 0, 0);
      aU.push(u[i * 3], u[i * 3 + 1], u[i * 3 + 2]);
      aV.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      aOrbit.push(orbit[i * 3], orbit[i * 3 + 1], orbit[i * 3 + 2]);
      aEnd.push(end, side);
    }
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 3));
  geom.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 3));
  geom.setAttribute('aOrbit', new THREE.Float32BufferAttribute(aOrbit, 3));
  geom.setAttribute('aEnd', new THREE.Float32BufferAttribute(aEnd, 2));
  geom.setIndex(index);

  const uniforms = {
    uClock: { value: 0 },
    uTrailK: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uColor: { value: accent },
    uOpacity: { value: 0.95 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    // Screen-space ribbons wind either way depending on the line's direction.
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  parent.add(mesh);

  // Pre-lock the comets accelerate with charge; post-lock they drift at idle
  // and quicken with the energy of clicks.
  // Trail length follows speed (world units travelled in ~16 frames at 60fps),
  // shortened while the pointer moves so parallax doesn't smear them.
  const update = (o: { dt: number; charge: number; energy: number; locked: boolean; pointerMotion: number }) => {
    const speedMul = o.locked ? 0.35 + o.energy * 1.2 : 0.35 + o.charge * 3.2;
    clock += speedMul * Math.min(o.dt, 0.05);
    uniforms.uClock.value = clock;
    uniforms.uTrailK.value = speedMul * (16 / 60) * (1 - o.pointerMotion * 0.55);
  };

  const setViewport = (w: number, h: number, pixelRatio: number) => {
    uniforms.uViewport.value.set(w, h);
    uniforms.uPixelRatio.value = pixelRatio;
  };
  const setOpacity = (opacity: number) => { uniforms.uOpacity.value = opacity; };
  const dispose = () => { geom.dispose(); mat.dispose(); };

  return { update, setViewport, setOpacity, dispose };
}
