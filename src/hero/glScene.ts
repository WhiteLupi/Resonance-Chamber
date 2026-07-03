import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { prefersReducedMotion } from '../motion';

// Oxidized teal — single accent shared with CSS --accent (#3d6e63). The seal
// is the "ancient engine" — the energy reads as patinated/copper-oxidized,
// not fluorescent. Emissive intensity + bloom push it to luminous range at
// render time despite the muted source color.
const ACCENT = 0x3d6e63;
const CORE_R = 0.18;
// Roots reach just past the viewport edges vertically — tendrils emerge from
// off-canvas, the engine feels bigger than the frame can contain. Text sits
// over the upper/lower edges with strong text-shadow for legibility.
const ROOTS_SCALE = 1.6;
// charge reaches this and we lock — the seal stays charged forever and comets
// decouple back to idle drift speed. Charge now ramps LINEARLY in time so it
// hits 1 cleanly; lock just shy of 1 to avoid a one-frame growth pop at the snap.
const LOCK_THRESHOLD = 0.999;
// Hold timing: seconds to fully charge while held, and a faster drain on release.
const HOLD_FILL_S = 2.0;
const RELEASE_FALL_S = 0.9;
const STARTUP_QUALITY_S = 1.2;
const QUALITY_RAMP_S = 0.8;

type HeroQualityTier = 'full' | 'balanced' | 'safe';

const HERO_TIER_SETTINGS: Record<HeroQualityTier, {
  startupCapMax: number;
  settledCapMax: number;
  parallaxScale: number;
  bloomScale: number;
  pulseScale: number;
  cometTrailScale: number;
  cometOpacity: number;
  cometUpdateStep: number;
  idleRings: boolean;
  sonarOpacity: number;
  rootUpdateStep: number;
}> = {
  full: {
    startupCapMax: 1.0,
    settledCapMax: 1.2,
    parallaxScale: 1,
    bloomScale: 1,
    pulseScale: 1,
    cometTrailScale: 1,
    cometOpacity: 0.95,
    cometUpdateStep: 1,
    idleRings: true,
    sonarOpacity: 1,
    rootUpdateStep: 1,
  },
  balanced: {
    startupCapMax: 1.0,
    settledCapMax: 0.9,
    parallaxScale: 0.42,
    bloomScale: 0.7,
    pulseScale: 0.82,
    cometTrailScale: 0.48,
    cometOpacity: 0.62,
    cometUpdateStep: 2,
    idleRings: false,
    sonarOpacity: 0.76,
    rootUpdateStep: 2,
  },
  safe: {
    startupCapMax: 0.76,
    settledCapMax: 0.82,
    parallaxScale: 0,
    bloomScale: 0.38,
    pulseScale: 0.62,
    cometTrailScale: 0,
    cometOpacity: 0,
    cometUpdateStep: 0,
    idleRings: false,
    sonarOpacity: 0.48,
    rootUpdateStep: 2,
  },
};

const HERO_TIER_ORDER: HeroQualityTier[] = ['full', 'balanced', 'safe'];

const HERO_PERF_DEFAULTS = {
  enableBloom: true,
  enableComets: true,
  enableSonarRings: true,
  enableChargePulse: true,
  enableParallax: true,
  startupPixelRatioCap: 1.0,
  settledPixelRatioCap: 1.2,
  profile: false,
};

type HeroPerfBoolKey =
  | 'enableBloom' | 'enableComets' | 'enableSonarRings'
  | 'enableChargePulse' | 'enableParallax' | 'profile';

const readHeroPerf = () => {
  const config = { ...HERO_PERF_DEFAULTS };
  const params = new URLSearchParams(window.location.search);
  const readBool = (key: HeroPerfBoolKey) => {
    const value = params.get(`hero-${key}`);
    if (value === '0' || value === 'false') config[key] = false;
    if (value === '1' || value === 'true') config[key] = true;
  };
  readBool('enableBloom');
  readBool('enableComets');
  readBool('enableSonarRings');
  readBool('enableChargePulse');
  readBool('enableParallax');
  readBool('profile');
  if (params.get('hero-safe') === '1') {
    config.enableComets = false;
    config.enableSonarRings = false;
    config.enableChargePulse = false;
    config.startupPixelRatioCap = 0.9;
    config.settledPixelRatioCap = 1.0;
  }
  return config;
};

export type Journey = {
  /** seal position on screen, in viewport percent (50/50 = center) */
  x: number;
  y: number;
  /** scale (1 = hero size), implemented as camera dolly */
  s: number;
  /** brightness 0..1, multiplied into scene visibility tracks */
  o: number;
  /** camera orbit rotation around Y axis, in degrees */
  r: number;
};

export type HeroScene = {
  setProgress: (p: number) => void;
  setJourney: (j: Journey) => void;
  onLock: (cb: () => void) => () => void;
  onCharge: (cb: (charge: number) => void) => () => void;
  /** Fires when the pointer enters/leaves the seal core's screen disc — drives
      the cursor "hold"/"wave" affordance so it only shows over the ball. */
  onHover: (cb: (over: boolean) => void) => () => void;
  /** Keyboard door into the ritual: an explicit control (the HOLD prompt
      button) replaces the pointer's spatial targeting, so no hit-test here —
      same charge/wave path as pressing the ball. */
  holdStart: () => void;
  holdEnd: () => void;
  dispose: () => void;
};

export function startHero(host: HTMLElement): HeroScene {
  const HERO_PERF = readHeroPerf();
  // Reduced motion: the chamber holds still. No comets, no breathing core, no
  // idle heartbeat, and motionT freezes the roots' autonomous sway/flex in the
  // frame loop. Interaction-driven life stays — charging, growth, the journey.
  const REDUCED_MOTION = prefersReducedMotion();
  if (REDUCED_MOTION) {
    HERO_PERF.enableComets = false;
    HERO_PERF.enableChargePulse = false;
  }
  const perfDebug = window as typeof window & { __heroPerf?: Record<string, unknown> };
  const lockSubs = new Set<() => void>();
  const chargeSubs = new Set<(charge: number) => void>();
  const hoverSubs = new Set<(over: boolean) => void>();
  let locked = false;
  const fireLock = () => {
    if (locked) return;
    locked = true;
    for (const cb of lockSubs) cb();
  };

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;' +
    'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  host.appendChild(canvas);

  // Intro fade — promote host opacity from 0→1 on the next frame so the CSS
  // transition (set on .gl-stage) animates the reveal. setProgress takes over
  // afterwards to hand off into the about section. Cancelled in dispose so a
  // StrictMode-discarded instance can't mutate the host after teardown.
  const introRaf = requestAnimationFrame(() => {
    host.style.opacity = '1';
  });

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  let runtimeTier: HeroQualityTier = HERO_PERF.enableComets && window.devicePixelRatio >= 2 ? 'balanced' : 'full';
  if (!HERO_PERF.enableComets && !HERO_PERF.enableSonarRings && !HERO_PERF.enableChargePulse) {
    runtimeTier = 'safe';
  }
  const getTierSettings = () => HERO_TIER_SETTINGS[runtimeTier];
  const getPixelRatioCap = (phase: 'startup' | 'steady' | 'locked') => {
    const tier = getTierSettings();
    const baseCap = phase === 'startup' ? HERO_PERF.startupPixelRatioCap : HERO_PERF.settledPixelRatioCap;
    const tierCap = phase === 'startup' ? tier.startupCapMax : tier.settledCapMax;
    return Math.min(baseCap, tierCap);
  };
  const setRenderPixelRatio = (phase: 'startup' | 'steady' | 'locked') => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, getPixelRatioCap(phase)));
  };
  setRenderPixelRatio('startup');

  const measure = () => ({
    w: host.clientWidth || window.innerWidth,
    h: host.clientHeight || window.innerHeight,
  });
  let { w: viewW, h: viewH } = measure();
  renderer.setSize(viewW, viewH);
  // Pure black — matches --bg-vault. The seal is the only light source in
  // a void; no warm tint to read as "brudno," no vignette to read as
  // "muddy ellipse." Maximum contrast for the engine.
  renderer.setClearColor(0x000000);

  const scene = new THREE.Scene();
  // Wider FOV + further camera so the comet shell (orbit radius 2.5–3.2) fits
  // with margin. Roots reach ≈ 2.21 × ROOTS_SCALE so they overflow vertically
  // and reach close to horizontal edges on 16:9.
  const camera = new THREE.PerspectiveCamera(42, viewW / viewH, 0.1, 100);
  camera.position.set(0, 0, 9.0);

  // Ambient-dominant so the core sphere reads as a SYMMETRIC glowing orb: its
  // bright centroid stays at the geometric centre (= the charge ring's centre)
  // regardless of the parallax camera orbit. Strong directional key/rim used to
  // throw the lit hemisphere — and the bloom riding it — off toward the light,
  // so the ball looked shoved sideways inside the ring. These lights only touch
  // the core (roots/comets are Line2/points, unlit), so flattening is safe.
  // Both lights sit on the Z axis (dead in front / dead behind) so there is
  // ZERO left/right or up/down bias: the core's lit disc is radially symmetric
  // and its bright centroid stays exactly on the geometric centre = the charge
  // ring's centre. The old off-axis key (2,3,4) threw a CONSTANT highlight to
  // the upper-right (amplified by bloom), so the ball read as shoved that way
  // no matter where the mouse was. Ambient dominates; these only touch the core.
  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.18);
  keyLight.position.set(0, 0, 6);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(ACCENT, 0.15);
  rimLight.position.set(0, 0, -6);
  scene.add(rimLight);

  const composer = HERO_PERF.enableBloom ? new EffectComposer(renderer) : null;
  composer?.setSize(viewW, viewH);
  composer?.addPass(new RenderPass(scene, camera));
  // Very tight bloom — small radius so glow stays at the core, doesn't
  // leak to canvas edges. (When bloom spread reached the framebuffer edges
  // it lifted canvas pixels above clearColor, producing a visible seam vs.
  // the solid about-section bg below.) Emissive is bumped separately to
  // compensate — the seal glows via its own pixels, not bloom-spread.
  const bloom = HERO_PERF.enableBloom
    ? new UnrealBloomPass(new THREE.Vector2(viewW, viewH), 0.32, 0.18, 0.18)
    : null;
  if (bloom) composer?.addPass(bloom);

  const outerGroup = new THREE.Group();
  const tetraGroup = new THREE.Group();
  const particlesGroup = new THREE.Group();
  outerGroup.add(tetraGroup);
  outerGroup.add(particlesGroup);
  scene.add(outerGroup);

  tetraGroup.scale.setScalar(1.7);

  // Core sphere — emissive intensity bumped to compensate for the darker
  // oxidized accent; HDR pushes the rendered pixels into luminous range so
  // bloom still catches it hard.
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xd4cfc6,
    emissive: new THREE.Color(ACCENT),
    emissiveIntensity: 2.4,
    roughness: 0.45,
    metalness: 0.0,
  });
  const coreGeom = new THREE.SphereGeometry(CORE_R, 32, 22);
  const coreMesh = new THREE.Mesh(coreGeom, coreMat);
  tetraGroup.add(coreMesh);

  // Halo sprite — soft radial accent
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 256;
  const hctx = haloCanvas.getContext('2d')!;
  const ac = new THREE.Color(ACCENT);
  const acR = (ac.r * 255) | 0, acG = (ac.g * 255) | 0, acB = (ac.b * 255) | 0;
  const grad = hctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0,    `rgba(${acR},${acG},${acB},0.55)`);
  grad.addColorStop(0.30, `rgba(${acR},${acG},${acB},0.30)`);
  grad.addColorStop(0.70, `rgba(${acR},${acG},${acB},0.08)`);
  grad.addColorStop(1,    `rgba(0,0,0,0)`);
  hctx.fillStyle = grad;
  hctx.fillRect(0, 0, 256, 256);
  const haloTex = new THREE.CanvasTexture(haloCanvas);
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const glowSprite = new THREE.Sprite(haloMat);
  glowSprite.scale.setScalar(1.1);
  tetraGroup.add(glowSprite);

  // Sonar rings — periodic outward pulses from the seal, signalling the
  // engine is broadcasting. Wide screens have lots of horizontal space and
  // these radial rings carry energy across it, giving the composition a
  // rhythmic heartbeat instead of a static centerpiece.
  let ringTex: THREE.CanvasTexture | null = null;
  if (HERO_PERF.enableSonarRings) {
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = ringCanvas.height = 256;
    const rctx = ringCanvas.getContext('2d')!;
    // Build an additive ring texture: transparent center, thin bright ring at
    // the edge, soft outer falloff.
    const rGrad = rctx.createRadialGradient(128, 128, 80, 128, 128, 128);
    rGrad.addColorStop(0,    `rgba(0,0,0,0)`);
    rGrad.addColorStop(0.70, `rgba(0,0,0,0)`);
    rGrad.addColorStop(0.86, `rgba(${acR},${acG},${acB},0.30)`);
    rGrad.addColorStop(0.94, `rgba(${acR},${acG},${acB},0.80)`);
    rGrad.addColorStop(0.98, `rgba(${acR},${acG},${acB},0.35)`);
    rGrad.addColorStop(1,    `rgba(0,0,0,0)`);
    rctx.fillStyle = rGrad;
    rctx.fillRect(0, 0, 256, 256);
    ringTex = new THREE.CanvasTexture(ringCanvas);
  }

  // Pool sized generously so rapid clicks don't force a visible recycle. If
  // the user does manage to fill the pool, we recycle the LEAST VISIBLE ring
  // (lowest current opacity) instead of the oldest by time — the user
  // notices ring-resets least when the swapped ring was already fading out.
  const RING_COUNT = 10;
  // Longer travel + bigger max scale so pulses reach viewport edges and
  // beyond — they dissolve into the walls of the room.
  const RING_DURATION = 9.0;
  const RING_MIN_SCALE = 0.5;
  const RING_MAX_SCALE = 13.0;
  type Ring = {
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    active: boolean;
    startT: number;
  };
  const rings: Ring[] = [];
  if (HERO_PERF.enableSonarRings) {
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({
        map: ringTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(RING_MIN_SCALE);
      tetraGroup.add(sprite);
      rings.push({ sprite, mat, active: false, startT: 0 });
    }
  }

  // Fire one ring outward. Recycle by LOWEST current opacity instead of by
  // age — the ring that disappears is the least visible one, so resets are
  // not perceptible. Called on mousedown and once on engine lock; not on a
  // timer.
  const triggerRing = (now: number) => {
    if (!HERO_PERF.enableSonarRings) return;
    let target = rings.find(r => !r.active);
    if (!target) {
      target = rings.reduce((a, b) => a.mat.opacity < b.mat.opacity ? a : b);
    }
    target.active = true;
    target.startT = now;
  };

  // Roots
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

  const rootsGroup = new THREE.Group();
  const BASE_COLOR = 0xdcd5cb;
  const rootMats: LineMaterial[] = [];
  const lineRes = new THREE.Vector2(
    viewW * renderer.getPixelRatio(),
    viewH * renderer.getPixelRatio(),
  );
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

  type Helix = { amp: number; freq: number; phase: number };

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

  // Centripetal Catmull-Rom avoids the overshoot, cusps and self-intersecting
  // loops that uniform parameterisation produces on unevenly spaced control
  // points — the prime source of the "angular wire" look on the tendrils.
  const SPINE_TYPE = 'centripetal' as const;

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
  // A tendril spine is grown as a heading walk rather than a radial spoke: each
  // segment turns the growth direction by a per-tendril, per-step angle in both
  // perpendicular axes, so the path wanders in continuously changing directions
  // along its whole length — not "straight, then a hook at the tip". A mild
  // outward bias keeps net growth away from the core; a faint downward bias lets
  // some settle without every tip curling the same way.
  const buildSpine = (dir: THREE.Vector3, lengthMul: number, swayBias: number): THREE.Vector3[] => {
    const origin = dir.clone().multiplyScalar(CORE_R / ROOTS_SCALE);
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
  tetraGroup.add(rootsGroup);

  // Comets — 24 particles on random 3D orbital planes
  const COMET_COUNT = HERO_PERF.enableComets ? 24 : 0;
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
  if (HERO_PERF.enableComets) {
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
    particlesGroup.add(cometLines);
  }

  // Anchors for proximity tug — placed on the comet orbital shell so passes
  // actually trigger.
  const anchorVerts = [
    new THREE.Vector3( 2.6, 0,  0 ),
    new THREE.Vector3(-2.6, 0,  0 ),
    new THREE.Vector3( 0,   0,  2.6),
    new THREE.Vector3( 0,   0, -2.6),
  ];
  const PROX = 0.55;

  // Interaction
  let charge = 0;
  let lastNotifiedCharge = -1;
  let clickHeld = false;
  let mouseX = 0, mouseY = 0;
  let parallaxX = 0, parallaxY = 0;
  // Last raw pointer position (client px) + whether it sits over the seal core's
  // screen disc. The core is the ONLY interactive target — charging (pre-lock)
  // and the broadcast wave (post-lock) fire only over the ball, never from a
  // dead corner of the canvas. Hover is broadcast so the cursor can show it.
  let lastClientX = -1, lastClientY = -1;
  let overCore = false;

  // Scene visibility — driven by setProgress(p). 1.0 at hero, ramps to 0 as
  // user scrolls into about. Multiplied into emissive / bloom / material
  // opacities so the seal dims via shader (not opacity fade on the host) and
  // becomes a faint ambient backdrop for the about inscription.
  let sceneVis = 1.0;
  // Travelling seal (spec 2026-06-10): App sets the target; the scene lerps per
  // frame so scroll updates feel continuous instead of stepping section to section.
  const CAM_DIST = 9.0;
  const journeyTarget: Journey = { x: 50, y: 50, s: 1, o: 1, r: 0 };
  const journeyCur: Journey = { x: 50, y: 50, s: 1, o: 1, r: 0 };
  const J_LERP = 0.07;
  const CAMERA_EPS = 0.0025;
  const VIEW_OFFSET_EPS = 0.35;
  const PARALLAX_EPS = 0.0008;
  const cameraApplied = { x: NaN, y: NaN, s: NaN, r: NaN, yawOff: NaN, pitchOff: NaN, w: 0, h: 0 };
  let cameraDirty = true;
  // Roots dim far less than the core/bloom — they stay alive behind the about
  // text rather than fading to a ghost (driven alongside sceneVis in setProgress).
  let rootsVis = 1.0;
  const rootBaseColor = new THREE.Color(BASE_COLOR);
  const rootAccentColor = new THREE.Color(ACCENT);
  const rootTintColor = new THREE.Color(BASE_COLOR);
  let lastRootTint = BASE_COLOR;

  // Size floor: the seal's on-screen size is ∝ viewport height (perspective
  // projection). On short viewports it would shrink without limit, so below
  // MIN_VIEWH we pull the camera proportionally closer — the apparent size then
  // freezes at its MIN_VIEWH value instead of collapsing. Applied to every place
  // that derives the seal's screen size (camera dolly + the hit-test).
  const MIN_VIEWH = 640;
  const fitScale = () => (viewH < MIN_VIEWH ? MIN_VIEWH / viewH : 1);

  // Hit-test: is a screen point (client px) over the seal core's projected disc?
  // Projects the core's world centre through the live camera (so it stays true
  // under journey travel + parallax orbit), and derives the on-screen radius
  // analytically from the perspective FOV. HIT_FORGIVE widens it past the bare
  // sphere to cover the visible glow/halo so the target feels comfortable.
  const HIT_FORGIVE = 2.4;
  const _coreNdc = new THREE.Vector3();
  const isOverCore = (clientX: number, clientY: number) => {
    _coreNdc.set(
      tetraGroup.position.x,
      tetraGroup.position.y,
      tetraGroup.position.z,
    ).project(camera);
    const cx = (_coreNdc.x * 0.5 + 0.5) * viewW;
    const cy = (-_coreNdc.y * 0.5 + 0.5) * viewH;
    const jDist = CAM_DIST / (journeyCur.s * fitScale());
    const worldR = CORE_R * tetraGroup.scale.x;
    const pxR =
      (worldR / jDist) *
      (viewH / (2 * Math.tan((camera.fov * Math.PI) / 360))) *
      HIT_FORGIVE;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return dx * dx + dy * dy <= pxR * pxR;
  };

  let pendingMouseX = 0;
  let pendingMouseY = 0;
  let mouseRaf = 0;
  const flushMouseMove = () => {
    mouseRaf = 0;
    mouseX = pendingMouseX;
    mouseY = pendingMouseY;
  };
  const onMouseMove = (e: MouseEvent) => {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    pendingMouseX = (e.clientX / viewW) * 2 - 1;
    pendingMouseY = (e.clientY / viewH) * 2 - 1;
    if (!mouseRaf) mouseRaf = requestAnimationFrame(flushMouseMove);
  };
  const onMouseLeave = () => {
    lastClientX = -1;
    lastClientY = -1;
    if (overCore) {
      overCore = false;
      for (const cb of hoverSubs) cb(false);
    }
    pendingMouseX = 0;
    pendingMouseY = 0;
    if (!mouseRaf) {
      mouseX = 0;
      mouseY = 0;
    }
  };
  // The seal core is the only interactive target. Pre-lock: holding the ball
  // charges the engine (a corner press is ignored — it misses the point of the
  // ritual). Post-lock: pressing the ball broadcasts a sonar wave. Either way,
  // off-ball presses do nothing.
  const onMouseDown = (e: MouseEvent) => {
    if (!isOverCore(e.clientX, e.clientY)) return;
    clickHeld = true;
    if (locked) triggerRing(clock.getElapsedTime());
  };
  const onMouseUp   = () => { clickHeld = false; };
  const onBlur      = () => { clickHeld = false; };
  const onTouchStart = (e: TouchEvent) => {
    const t0 = e.touches[0];
    if (t0 && !isOverCore(t0.clientX, t0.clientY)) return;
    clickHeld = true;
    if (locked) triggerRing(clock.getElapsedTime());
  };
  const onTouchEnd   = () => { clickHeld = false; };
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup',   onMouseUp);
  window.addEventListener('blur',      onBlur);
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend',   onTouchEnd);

  const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
  // ease-IN for root growth, but GENTLE: starts at zero the instant you press
  // (no jump) and grows visibly from the very first frames, accelerating toward
  // the lock. Exponent is the knob — higher = slower/deader start. 1.0 = linear.
  const GROWTH_EASE = 1.5;
  const easeInGrow = (x: number) => Math.pow(x, GROWTH_EASE);

  // Loop
  const clock = new THREE.Clock();
  let lastT = clock.getElapsedTime();
  let raf = 0;
  let perfPhase: 'startup' | 'steady' | 'locked' = 'startup';
  let qualityRamp = 0;
  let frameCount = 0;
  const perfStats = { samples: 0, over24: 0, over32: 0, maxDt: 0, degrades: 0, lastReason: 'init' };
  // Idle heartbeat — once locked, the engine emits a slow rhythmic ring on
  // its own so the chamber doesn't fall completely silent between user
  // interactions. Triggered after the post-lock announcement ring.
  let nextIdleRingAt = Infinity;
  const IDLE_RING_INTERVAL = 12.5;
  // window.__heroPerf inspection is opt-in via ?hero-profile=1 — no global
  // side effects on normal visits.
  const syncPerfDebug = (extra?: Record<string, unknown>) => {
    if (!HERO_PERF.profile) return;
    perfDebug.__heroPerf = {
      tier: runtimeTier,
      phase: perfPhase,
      dpr: window.devicePixelRatio,
      renderPixelRatio: renderer.getPixelRatio(),
      ...perfStats,
      ...extra,
    };
  };
  const refreshLineResolutions = () => {
    const px = renderer.getPixelRatio();
    for (const m of rootMats) m.resolution.set(viewW * px, viewH * px);
  };
  const resetPerfWindow = (reason: string) => {
    perfStats.samples = 0;
    perfStats.over24 = 0;
    perfStats.over32 = 0;
    perfStats.maxDt = 0;
    perfStats.lastReason = reason;
  };
  const applyRuntimeTier = (nextTier: HeroQualityTier, reason: string) => {
    if (HERO_TIER_ORDER.indexOf(nextTier) <= HERO_TIER_ORDER.indexOf(runtimeTier)) return;
    runtimeTier = nextTier;
    perfStats.degrades += 1;
    resetPerfWindow(reason);
    setRenderPixelRatio(perfPhase);
    refreshLineResolutions();
    syncPerfDebug({ downgraded: true, downgradeReason: reason });
  };
  const maybeDegradeRuntimeTier = (dtMs: number, t: number) => {
    if (t > 4.5) return;
    perfStats.samples += 1;
    if (dtMs > 24) perfStats.over24 += 1;
    if (dtMs > 32) perfStats.over32 += 1;
    perfStats.maxDt = Math.max(perfStats.maxDt, dtMs);
    if (runtimeTier === 'full' && (perfStats.over32 >= 1 || perfStats.over24 >= 4)) {
      applyRuntimeTier('balanced', `startup-drop:${dtMs.toFixed(1)}ms`);
    } else if (runtimeTier === 'balanced' && perfStats.samples >= 45 && (perfStats.over32 >= 1 || perfStats.over24 >= 6)) {
      applyRuntimeTier('safe', `persistent-drop:${dtMs.toFixed(1)}ms`);
    }
  };
  const settleRenderQuality = () => {
    setRenderPixelRatio(perfPhase);
    refreshLineResolutions();
  };
  syncPerfDebug();

  const loop = () => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - lastT);
    lastT = t;
    frameCount += 1;
    const tier = getTierSettings();
    const dtMs = dt * 1000;
    maybeDegradeRuntimeTier(dtMs, t);

    if (perfPhase === 'startup' && t >= STARTUP_QUALITY_S) {
      perfPhase = 'steady';
      settleRenderQuality();
    }
    if (perfPhase !== 'startup') {
      qualityRamp = Math.min(1, qualityRamp + dt / QUALITY_RAMP_S);
    }

    // Journey: lerp toward the App target, then apply camera orbit/dolly and
    // frame offset. The world stays at origin; the camera decides where the
    // seal lands on screen.
    journeyCur.x += (journeyTarget.x - journeyCur.x) * J_LERP;
    journeyCur.y += (journeyTarget.y - journeyCur.y) * J_LERP;
    journeyCur.s += (journeyTarget.s - journeyCur.s) * J_LERP;
    journeyCur.o += (journeyTarget.o - journeyCur.o) * J_LERP;
    journeyCur.r += (journeyTarget.r - journeyCur.r) * J_LERP;

    // Pointer parallax moves the CAMERA, not the figure. The seal never turns
    // toward the cursor — the viewpoint drifts around it on a small orbit, so
    // perspective and (world-fixed) lighting both say "we move, it holds
    // still", the same illusion as the moon keeping its face.
    if (HERO_PERF.enableParallax && tier.parallaxScale > 0) {
      const parallaxLerp = 0.035 + tier.parallaxScale * 0.025;
      parallaxX += (mouseX - parallaxX) * parallaxLerp;
      parallaxY += (mouseY - parallaxY) * parallaxLerp;
    } else {
      parallaxX *= 0.88;
      parallaxY *= 0.88;
    }
    const camYawOff = parallaxX * 0.21 * tier.parallaxScale;
    const camPitchOff = -parallaxY * 0.16 * tier.parallaxScale;

    const cameraNeedsUpdate = cameraDirty
      || Math.abs(journeyCur.x - cameraApplied.x) > VIEW_OFFSET_EPS
      || Math.abs(journeyCur.y - cameraApplied.y) > VIEW_OFFSET_EPS
      || Math.abs(journeyCur.s - cameraApplied.s) > CAMERA_EPS
      || Math.abs(journeyCur.r - cameraApplied.r) > CAMERA_EPS
      || Math.abs(camYawOff - cameraApplied.yawOff) > PARALLAX_EPS
      || Math.abs(camPitchOff - cameraApplied.pitchOff) > PARALLAX_EPS
      || viewW !== cameraApplied.w
      || viewH !== cameraApplied.h;
    if (cameraNeedsUpdate) {
      const yaw = (journeyCur.r * Math.PI) / 180 + camYawOff;
      const jDist = CAM_DIST / (journeyCur.s * fitScale());
      const cosPitch = Math.cos(camPitchOff);
      camera.position.set(
        Math.sin(yaw) * jDist * cosPitch,
        Math.sin(camPitchOff) * jDist,
        Math.cos(yaw) * jDist * cosPitch,
      );
      camera.lookAt(0, 0, 0);
      camera.setViewOffset(
        viewW, viewH,
        ((journeyCur.x - 50) / 100) * -viewW,
        ((journeyCur.y - 50) / 100) * -viewH,
        viewW, viewH,
      );
      camera.updateProjectionMatrix();
      cameraApplied.x = journeyCur.x;
      cameraApplied.y = journeyCur.y;
      cameraApplied.s = journeyCur.s;
      cameraApplied.r = journeyCur.r;
      cameraApplied.yawOff = camYawOff;
      cameraApplied.pitchOff = camPitchOff;
      cameraApplied.w = viewW;
      cameraApplied.h = viewH;
      cameraDirty = false;
    }
    const jVis = journeyCur.o;

    // Charge ramps LINEARLY in time while held — the ring fills at a steady
    // rate with no asymptotic crawl at the end. Releasing early drains it faster.
    if (locked) {
      charge = 1;
    } else if (clickHeld) {
      charge = Math.min(1, charge + dt / HOLD_FILL_S);
    } else {
      charge = Math.max(0, charge - dt / RELEASE_FALL_S);
    }
    // Notify only on actual movement — post-lock charge is a constant 1 and
    // subscribers write CSS vars; no reason to touch style 60×/s forever.
    if (charge !== lastNotifiedCharge) {
      lastNotifiedCharge = charge;
      for (const cb of chargeSubs) cb(charge);
    }
    if (!locked && charge >= LOCK_THRESHOLD) {
      charge = 1;
      fireLock();
      resetPerfWindow('post-lock');
      perfPhase = 'locked';
      settleRenderQuality();
      // Announce activation with one final ring — the engine just turned on.
      triggerRing(t);
      nextIdleRingAt = REDUCED_MOTION ? Infinity : t + IDLE_RING_INTERVAL;
    }

    // Idle heartbeat post-lock — slow rhythmic ring even without input.
    if (locked && tier.idleRings && t >= nextIdleRingAt) {
      triggerRing(t);
      nextIdleRingAt = REDUCED_MOTION ? Infinity : t + IDLE_RING_INTERVAL;
    }

    // Roots breathe with a slow BOUNDED turn (±~9°) instead of a continuous spin —
    // a full rotation would swing the in-plane tendrils edge-on, where they pile
    // into a tangled mess. Oscillating keeps the figure in its good-looking range.
    // motionT freezes at 0 under reduced motion — the figure holds its pose.
    const motionT = REDUCED_MOTION ? 0 : t;
    rootsGroup.rotation.y = Math.sin(motionT * 0.045) * 0.16;
    rootsGroup.rotation.x = Math.sin(motionT * 0.06) * 0.05;
    rootsGroup.position.y = Math.sin(motionT * 0.4) * 0.015;

    // Growth + flex. Tendrils are ordered parent-before-branch, so a branch can
    // read its parent's already-flexed attach point this same frame and ride it.
    const shouldUpdateRoots = frameCount % tier.rootUpdateStep === 0;
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
      if (shouldUpdateRoots) {
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
        if (shouldUpdateRoots) {
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

    // Comets — pre-lock: speed scales with charge (slow → fast streaks). Post-
    // lock: speed decouples and stays at idle drift even though charge is 1.
    let pullX = 0, pullY = 0, pullZ = 0;
    if (
      HERO_PERF.enableComets
      && cGeo
      && tier.cometTrailScale > 0
      && tier.cometUpdateStep > 0
      && frameCount % tier.cometUpdateStep === 0
    ) {
      const cometSpeedMul = locked ? 0.35 : 0.35 + charge * 3.2;
      const cometDt = Math.min(dt, 0.022);
      const pointerMotion = Math.min(1, (Math.abs(mouseX - parallaxX) + Math.abs(mouseY - parallaxY)) * 1.8);
      const trailMotionDamp = 1 - pointerMotion * 0.55;
      const cPosAttr = cGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < COMET_COUNT; i++) {
        cPhase[i] += cBaseSpeed[i] * cometSpeedMul * cometDt * tier.cometUpdateStep;
        const cs = Math.cos(cPhase[i]) * cRadius[i];
        const sn = Math.sin(cPhase[i]) * cRadius[i];
        const tx_ = cs * cuX[i] + sn * cvX[i];
        const ty_ = cs * cuY[i] + sn * cvY[i];
        const tz_ = cs * cuZ[i] + sn * cvZ[i];

        const lr = Math.min(1, cometDt * 14 * tier.cometUpdateStep);
        const px = cPrevX[i] + (tx_ - cPrevX[i]) * lr;
        const py = cPrevY[i] + (ty_ - cPrevY[i]) * lr;
        const pz = cPrevZ[i] + (tz_ - cPrevZ[i]) * lr;

        const dx = px - cPrevX[i];
        const dy = py - cPrevY[i];
        const dz = pz - cPrevZ[i];
        const sp = Math.sqrt(dx*dx + dy*dy + dz*dz);

        const trail = Math.min(0.46 * tier.cometTrailScale, sp * 16 * tier.cometTrailScale) * trailMotionDamp;
        const inv = sp > 0.00001 ? 1 / sp : 0;
        cPosAttr[i*6 + 0] = px - dx * inv * trail;
        cPosAttr[i*6 + 1] = py - dy * inv * trail;
        cPosAttr[i*6 + 2] = pz - dz * inv * trail;
        cPosAttr[i*6 + 3] = px;
        cPosAttr[i*6 + 4] = py;
        cPosAttr[i*6 + 5] = pz;

        let minD = 1e9;
        let nvx = 0, nvy = 0, nvz = 0;
        for (let k = 0; k < anchorVerts.length; k++) {
          const vv = anchorVerts[k];
          const ddx = px - vv.x, ddy = py - vv.y, ddz = pz - vv.z;
          const d = ddx*ddx + ddy*ddy + ddz*ddz;
          if (d < minD) { minD = d; nvx = vv.x; nvy = vv.y; nvz = vv.z; }
        }
        const dist = Math.sqrt(minD);
        const aff = Math.max(0, 1 - dist / PROX);
        if (aff > 0) {
          pullX += (px - nvx) * aff;
          pullY += (py - nvy) * aff;
          pullZ += (pz - nvz) * aff;
        }

        cPrevX[i] = px; cPrevY[i] = py; cPrevZ[i] = pz;
      }
      cGeo.attributes.position.needsUpdate = true;
    }

    // Proximity tug — post-lock the seal drifts a hair toward passing comets so
    // it reads as alive. PRE-LOCK the tug is OFF: the core must stay pinned at
    // origin so it sits dead-centre inside the charge ring during the hold
    // ritual (the tug used to pull it off-centre as charge climbed).
    const tugStrength = locked ? 0.0015 : 0;
    const tugLerp = 0.15;
    tetraGroup.position.x += (pullX * tugStrength - tetraGroup.position.x) * tugLerp;
    tetraGroup.position.y += (pullY * tugStrength - tetraGroup.position.y) * tugLerp;
    tetraGroup.position.z += (pullZ * tugStrength - tetraGroup.position.z) * tugLerp;

    // Hover state — recomputed once per frame against the live camera + core
    // position, broadcast on change so the cursor's over-ball affordance tracks
    // the seal wherever it travels. Skipped while the pointer is off-canvas.
    if (lastClientX >= 0) {
      const nowOver = isOverCore(lastClientX, lastClientY);
      if (nowOver !== overCore) {
        overCore = nowOver;
        for (const cb of hoverSubs) cb(nowOver);
      }
    }

    // Core breathing + emissive
    const pulseScale = HERO_PERF.enableChargePulse ? tier.pulseScale : 0;
    const chargeFx = HERO_PERF.enableChargePulse ? charge * pulseScale : 0;
    const breath = 1 + (HERO_PERF.enableChargePulse ? Math.sin(t * 1.25) * 0.04 * pulseScale : 0);
    coreMesh.scale.setScalar(breath);
    coreMat.emissiveIntensity = (3.2 + chargeFx * 3.0 + (HERO_PERF.enableChargePulse ? Math.sin(t * 1.7) * 0.15 * pulseScale : 0)) * sceneVis * jVis;

    glowSprite.scale.setScalar((1.0 + chargeFx * 0.5) * breath);
    haloMat.opacity = (0.50 + chargeFx * 0.18) * sceneVis * jVis;

    // Sonar rings — each pulse is a discrete event (mousedown / lock), not a
    // metronome. Idle rings sit at opacity 0; active rings expand outward
    // and fade over RING_DURATION seconds, then return to idle.
    for (const r of rings) {
      if (!r.active) {
        r.mat.opacity = 0;
        continue;
      }
      const local = (t - r.startT) / RING_DURATION;
      if (local >= 1) {
        r.active = false;
        r.mat.opacity = 0;
        continue;
      }
      const scale = RING_MIN_SCALE + local * (RING_MAX_SCALE - RING_MIN_SCALE);
      r.sprite.scale.setScalar(scale * breath);
      // Heartbeat ease — rises fast (peak around 8%), then long lingering
      // tail (pow 0.7 = slow drift to 0 instead of a steep drop near end).
      // The pulse "dissolves into the walls" rather than blinking out.
      const rise = Math.min(1, local / 0.08);
      const fall = Math.pow(1 - Math.max(0, (local - 0.08) / 0.92), 0.7);
      r.mat.opacity = rise * fall * 0.55 * tier.sonarOpacity * sceneVis * jVis;
    }

    const startupBloomMul = 0.65 + qualityRamp * 0.35;
    if (bloom) bloom.strength = (0.32 + chargeFx * 0.20) * startupBloomMul * tier.bloomScale * sceneVis * jVis;

    if (cMat) cMat.opacity = tier.cometOpacity * sceneVis * jVis;

    const tintTarget = charge > 0.01
      ? rootTintColor.copy(rootBaseColor).lerp(rootAccentColor, charge * 0.4).getHex()
      : BASE_COLOR;
    for (const m of rootMats) {
      if (tintTarget !== lastRootTint) m.color.setHex(tintTarget);
      // Roots use rootsVis (high floor) not sceneVis — the tendrils stay alive
      // behind the about text instead of fading to a pale ghost. Only the core /
      // bloom / halo dim hard (they're what washes the text out).
      m.opacity = (rootBaseOpacity.get(m) ?? 0.8) * rootsVis * (0.05 + 0.95 * jVis);
    }
    lastRootTint = tintTarget;

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    if (frameCount % 30 === 0) syncPerfDebug();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const onResize = () => {
    const s = measure();
    viewW = s.w; viewH = s.h;
    renderer.setSize(viewW, viewH);
    composer?.setSize(viewW, viewH);
    bloom?.setSize(viewW, viewH);
    camera.aspect = viewW / viewH;
    cameraDirty = true;
    camera.updateProjectionMatrix();
    refreshLineResolutions();
    syncPerfDebug({ resized: true });
  };
  window.addEventListener('resize', onResize);

  return {
    setProgress(p: number) {
      // Scene-dim via shader as user scrolls into about — seal dims from
      // foreground engine to ambient backdrop without an opacity fade on
      // the host element. p=0..0.15: full brightness. p=0.15..0.75: ramps
      // down. p>=0.75: minimum backdrop visibility.
      const fadeStart = 0.15;
      const fadeEnd = 0.75;
      const local = Math.max(0, Math.min(1, (p - fadeStart) / (fadeEnd - fadeStart)));
      // The organism stays ALIVE in about — neither the core light nor the roots
      // extinguish on scroll. They only settle a little (core/bloom floor 0.65,
      // roots floor 0.8); legibility comes entirely from a local dark box behind
      // the text, not from killing the engine. (.inscription::after in about.css)
      sceneVis = 1 - local * 0.35;
      rootsVis = 1 - local * 0.2;
    },
    setJourney(j: Journey) {
      journeyTarget.x = j.x;
      journeyTarget.y = j.y;
      journeyTarget.s = j.s;
      journeyTarget.o = j.o;
      journeyTarget.r = j.r;
    },
    onLock(cb) {
      lockSubs.add(cb);
      if (locked) cb();
      return () => { lockSubs.delete(cb); };
    },
    onCharge(cb) {
      chargeSubs.add(cb);
      cb(charge);
      return () => { chargeSubs.delete(cb); };
    },
    onHover(cb) {
      hoverSubs.add(cb);
      cb(overCore);
      return () => { hoverSubs.delete(cb); };
    },
    holdStart() {
      clickHeld = true;
      if (locked) triggerRing(clock.getElapsedTime());
    },
    holdEnd() {
      clickHeld = false;
    },
    dispose() {
      cancelAnimationFrame(raf);
      delete perfDebug.__heroPerf;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup',   onMouseUp);
      window.removeEventListener('blur',      onBlur);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      cancelAnimationFrame(mouseRaf);
      cancelAnimationFrame(introRaf);
      for (const m of rootMats) m.dispose();
      for (const tend of tendrils) {
        for (const { geom } of tend.lines) geom.dispose();
      }
      coreMat.dispose();
      coreGeom.dispose();
      haloMat.dispose();
      haloTex.dispose();
      // EffectComposer.dispose only frees its own targets (r169) — the bloom
      // pass and the sonar sprite materials hold GPU resources of their own.
      for (const r of rings) r.mat.dispose();
      bloom?.dispose();
      ringTex?.dispose();
      cMat?.dispose();
      cGeo?.dispose();
      composer?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
