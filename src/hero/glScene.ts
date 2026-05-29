import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

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
// charge crosses this and we lock — the seal stays in the charged state forever
// and comets decouple back to idle drift speed. Slightly below 1 to avoid the
// asymptote of the exp-lerp never quite reaching 1.
const LOCK_THRESHOLD = 0.985;

export type HeroScene = {
  setProgress: (p: number) => void;
  onLock: (cb: () => void) => () => void;
  onCharge: (cb: (charge: number) => void) => () => void;
  dispose: () => void;
};

export function startHero(host: HTMLElement): HeroScene {
  const lockSubs = new Set<() => void>();
  const chargeSubs = new Set<(charge: number) => void>();
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
  // afterwards to hand off into the about section.
  requestAnimationFrame(() => {
    host.style.opacity = '1';
  });

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);

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

  scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(ACCENT, 0.4);
  rimLight.position.set(-3, -1, -2);
  scene.add(rimLight);

  const composer = new EffectComposer(renderer);
  composer.setSize(viewW, viewH);
  composer.addPass(new RenderPass(scene, camera));
  // Very tight bloom — small radius so glow stays at the core, doesn't
  // leak to canvas edges. (When bloom spread reached the framebuffer edges
  // it lifted canvas pixels above clearColor, producing a visible seam vs.
  // the solid about-section bg below.) Emissive is bumped separately to
  // compensate — the seal glows via its own pixels, not bloom-spread.
  const bloom = new UnrealBloomPass(new THREE.Vector2(viewW, viewH), 0.32, 0.18, 0.18);
  composer.addPass(bloom);

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
  const ringTex = new THREE.CanvasTexture(ringCanvas);

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

  // Fire one ring outward. Recycle by LOWEST current opacity instead of by
  // age — the ring that disappears is the least visible one, so resets are
  // not perceptible. Called on mousedown and once on engine lock; not on a
  // timer.
  const triggerRing = (now: number) => {
    let target = rings.find(r => !r.active);
    if (!target) {
      target = rings.reduce((a, b) => a.mat.opacity < b.mat.opacity ? a : b);
    }
    target.active = true;
    target.startT = now;
  };

  // Roots
  type Sway = { speed: number; amp: number; phase: number; axis: THREE.Vector3 };
  type Tendril = {
    lines: { line: Line2; endIdx: number; geom: LineGeometry }[];
    samples: number;
    type: 'main' | 'branch';
    parent?: Tendril;
    branchT?: number;
    growthStart?: number;
    growthDuration?: number;
    growth: number;
    group: THREE.Group;   // pivot at the core — main: own group, branch: parent's
    sway?: Sway;          // independent idle motion (main only)
  };

  // Each main tendril sways on its own axis/phase/speed so they drift
  // independently — like a root system stirred by a slow current, not one rigid
  // body rotating. Derived deterministically from the tendril's seed.
  const makeSway = (seed: number): Sway => ({
    speed: 0.35 + Math.abs(Math.sin(seed * 2.3)) * 0.30,
    amp: 0.040 + Math.abs(Math.cos(seed * 3.7)) * 0.050,
    phase: seed * 1.97,
    axis: new THREE.Vector3(
      Math.sin(seed * 4.1),
      Math.cos(seed * 2.9) * 0.5,
      Math.sin(seed * 5.6),
    ).normalize(),
  });

  const rootsGroup = new THREE.Group();
  const BASE_COLOR = 0xdcd5cb;
  const rootMats: LineMaterial[] = [];
  const lineRes = new THREE.Vector2(viewW * pixelRatio, viewH * pixelRatio);
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
    parentSpine: THREE.Vector3[],
    t: number,
    sideSign: number,
    lengthMul: number,
    helix: Helix | null,
  ) => {
    const spineCurve = new THREE.CatmullRomCurve3(parentSpine, false, SPINE_TYPE);
    const origin = spineCurve.getPointAt(t).clone();
    const tangent = spineCurve.getTangentAt(t).normalize();
    const upRef = Math.abs(tangent.y) > 0.85
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
    const branchLen = 0.40 * lengthMul;
    const end = origin.clone()
      .add(tangent.clone().multiplyScalar(branchLen * 0.4))
      .add(perp.clone().multiplyScalar(sideSign * branchLen * 0.75))
      .add(new THREE.Vector3(0, -branchLen * 0.5, 0));
    const mid = new THREE.Vector3().lerpVectors(origin, end, 0.5)
      .add(perp.clone().multiplyScalar(sideSign * 0.08));
    const built = buildTendril([origin, mid, end], helix, branchLayers, 48, parentTendril.group);
    tendrils.push({
      lines: built.lines,
      samples: built.samplesCount,
      type: 'branch',
      parent: parentTendril,
      branchT: t,
      growth: 0,
      group: parentTendril.group,
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
      sway: makeSway(opts.swayBias),
    };
    tendrils.push(mainTendril);
    for (let b = 0; b < opts.branches; b++) {
      const bt = 0.32 + b * 0.22 + Math.sin(opts.swayBias * (17.3 + b * 2)) * 0.06;
      const sideSign = (b % 2 === 0) ? 1 : -1;
      const bHelix: Helix | null = opts.helix
        ? { amp: opts.helix.amp * 0.5, freq: opts.helix.freq * 1.3, phase: opts.helix.phase + 1.5 }
        : null;
      addBranch(mainTendril, spine, bt, sideSign, opts.length * 0.9, bHelix);
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
    const tA: Tendril = { lines: builtA.lines, samples: builtA.samplesCount, type: 'main', growthStart: opts.growthStart, growthDuration: opts.growthDuration, growth: 0, group: groupA, sway: makeSway(opts.swayBias) };
    const tB: Tendril = { lines: builtB.lines, samples: builtB.samplesCount, type: 'main', growthStart: opts.growthStart + 0.02, growthDuration: opts.growthDuration, growth: 0, group: groupB, sway: makeSway(opts.swayBias + 7.0) };
    tendrils.push(tA, tB);
    for (let b = 0; b < opts.branches[0]; b++) {
      const bt = 0.35 + b * 0.20;
      addBranch(tA, spine, bt,  1, opts.length * 0.85, { amp: opts.helixAmp * 0.4, freq: opts.helixFreq * 1.2, phase: 0.8 });
    }
    for (let b = 0; b < opts.branches[1]; b++) {
      const bt = 0.40 + b * 0.18;
      addBranch(tB, spine, bt, -1, opts.length * 0.85, { amp: opts.helixAmp * 0.4, freq: opts.helixFreq * 1.2, phase: Math.PI + 0.8 });
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
  const COMET_COUNT = 24;
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
    let tx = 1, ty = 0, tz = 0;
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

  const cGeo = new THREE.BufferGeometry();
  cGeo.setAttribute('position', new THREE.BufferAttribute(cPositions, 3));
  cGeo.setAttribute('color',    new THREE.BufferAttribute(cColors, 3));
  const cMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const cometLines = new THREE.LineSegments(cGeo, cMat);
  particlesGroup.add(cometLines);

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
  let clickHeld = false;
  let mouseX = 0, mouseY = 0;
  let parallaxX = 0, parallaxY = 0;

  // Scene visibility — driven by setProgress(p). 1.0 at hero, ramps to 0 as
  // user scrolls into about. Multiplied into emissive / bloom / material
  // opacities so the seal dims via shader (not opacity fade on the host) and
  // becomes a faint ambient backdrop for the about inscription.
  let sceneVis = 1.0;

  const onMouseMove = (e: MouseEvent) => {
    mouseX = (e.clientX / viewW) * 2 - 1;
    mouseY = (e.clientY / viewH) * 2 - 1;
  };
  // Pre-lock clicks should NOT emit sonar rings — they're a post-activation
  // gesture (engine broadcasting), not a charge signal. The charge ring +
  // HOLD prompt handle pre-lock feedback by themselves.
  const onMouseDown = () => {
    clickHeld = true;
    if (locked) triggerRing(clock.getElapsedTime());
  };
  const onMouseUp   = () => { clickHeld = false; };
  const onBlur      = () => { clickHeld = false; };
  const onTouchStart = () => {
    clickHeld = true;
    if (locked) triggerRing(clock.getElapsedTime());
  };
  const onTouchEnd   = () => { clickHeld = false; };
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup',   onMouseUp);
  window.addEventListener('blur',      onBlur);
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend',   onTouchEnd);

  const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

  // Loop
  const clock = new THREE.Clock();
  let lastT = clock.getElapsedTime();
  let raf = 0;
  // Idle heartbeat — once locked, the engine emits a slow rhythmic ring on
  // its own so the chamber doesn't fall completely silent between user
  // interactions. Triggered after the post-lock announcement ring.
  let nextIdleRingAt = Infinity;
  const IDLE_RING_INTERVAL = 12.5;

  const loop = () => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - lastT);
    lastT = t;

    // Charge: 1 while clickHeld OR locked (locked pins at full), 0 otherwise.
    const target = (locked || clickHeld) ? 1 : 0;
    charge += (target - charge) * Math.min(1, dt * 2.2);
    for (const cb of chargeSubs) cb(charge);
    if (!locked && charge >= LOCK_THRESHOLD) {
      charge = 1;
      fireLock();
      // Announce activation with one final ring — the engine just turned on.
      triggerRing(t);
      nextIdleRingAt = t + IDLE_RING_INTERVAL;
    }

    // Idle heartbeat post-lock — slow rhythmic ring even without input.
    if (locked && t >= nextIdleRingAt) {
      triggerRing(t);
      nextIdleRingAt = t + IDLE_RING_INTERVAL;
    }

    // Parallax — outerGroup deeper than tetraGroup
    parallaxX += (mouseX - parallaxX) * 0.08;
    parallaxY += (mouseY - parallaxY) * 0.08;
    outerGroup.rotation.y =  parallaxX * 0.5;
    outerGroup.rotation.x = -parallaxY * 0.38;
    tetraGroup.rotation.y =  parallaxX * 0.12;
    tetraGroup.rotation.x = -parallaxY * 0.10;

    rootsGroup.rotation.y = t * 0.04;
    rootsGroup.rotation.x = Math.sin(t * 0.06) * 0.05;
    rootsGroup.position.y = Math.sin(t * 0.4) * 0.015;

    // Growth — main: staggered by growthStart/Duration; branch: gated on parent.
    for (const tend of tendrils) {
      if (tend.type === 'main') {
        const localRaw = (charge - (tend.growthStart ?? 0)) / (tend.growthDuration ?? 0.85);
        const local = Math.max(0, Math.min(1, localRaw));
        tend.growth = easeOutCubic(local);
        // Independent idle sway — pivot the whole tendril about the core on its
        // own axis/phase so each root drifts on its own, not as one rigid body.
        if (tend.sway) {
          const ang = Math.sin(t * tend.sway.speed + tend.sway.phase) * tend.sway.amp;
          tend.group.quaternion.setFromAxisAngle(tend.sway.axis, ang);
        }
      } else {
        const parentG = tend.parent!.growth;
        const span = 1 - (tend.branchT ?? 0);
        const local = span > 0.01
          ? Math.max(0, Math.min(1, (parentG - (tend.branchT ?? 0)) / span))
          : 0;
        tend.growth = easeOutCubic(local);
      }
      const targetIdx = Math.floor(tend.growth * tend.samples);
      for (const { line, endIdx } of tend.lines) {
        const segs = Math.max(0, Math.min(targetIdx, endIdx) - 1);
        (line.geometry as LineGeometry).instanceCount = segs;
      }
    }

    // Comets — pre-lock: speed scales with charge (slow → fast streaks). Post-
    // lock: speed decouples and stays at idle drift even though charge is 1.
    const cometSpeedMul = locked ? 0.35 : 0.35 + charge * 3.2;
    const cPosAttr = cGeo.attributes.position.array as Float32Array;
    let pullX = 0, pullY = 0, pullZ = 0;
    for (let i = 0; i < COMET_COUNT; i++) {
      cPhase[i] += cBaseSpeed[i] * cometSpeedMul * dt;
      const cs = Math.cos(cPhase[i]) * cRadius[i];
      const sn = Math.sin(cPhase[i]) * cRadius[i];
      const tx_ = cs * cuX[i] + sn * cvX[i];
      const ty_ = cs * cuY[i] + sn * cvY[i];
      const tz_ = cs * cuZ[i] + sn * cvZ[i];

      const lr = Math.min(1, dt * 14);
      const px = cPrevX[i] + (tx_ - cPrevX[i]) * lr;
      const py = cPrevY[i] + (ty_ - cPrevY[i]) * lr;
      const pz = cPrevZ[i] + (tz_ - cPrevZ[i]) * lr;

      const dx = px - cPrevX[i];
      const dy = py - cPrevY[i];
      const dz = pz - cPrevZ[i];
      const sp = Math.sqrt(dx*dx + dy*dy + dz*dz);

      const trail = Math.min(1.0, sp * 30);
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

    // Proximity tug — post-lock dampens (no charge multiplier) so the seal
    // settles still while comets continue drifting.
    const tugStrength = locked ? 0.0015 : 0.008 * charge;
    const tugLerp = 0.15;
    tetraGroup.position.x += (pullX * tugStrength - tetraGroup.position.x) * tugLerp;
    tetraGroup.position.y += (pullY * tugStrength - tetraGroup.position.y) * tugLerp;
    tetraGroup.position.z += (pullZ * tugStrength - tetraGroup.position.z) * tugLerp;

    // Core breathing + emissive
    const breath = 1 + Math.sin(t * 1.25) * 0.04;
    coreMesh.scale.setScalar(breath);
    coreMat.emissiveIntensity = (3.2 + charge * 3.0 + Math.sin(t * 1.7) * 0.15) * sceneVis;

    glowSprite.scale.setScalar((1.0 + charge * 0.5) * breath);
    haloMat.opacity = (0.50 + charge * 0.18) * sceneVis;

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
      r.mat.opacity = rise * fall * 0.55 * sceneVis;
    }

    bloom.strength = (0.32 + charge * 0.20) * sceneVis;

    cMat.opacity = 0.95 * sceneVis;

    const tintTarget = charge > 0.01
      ? new THREE.Color(BASE_COLOR).lerp(new THREE.Color(ACCENT), charge * 0.4).getHex()
      : BASE_COLOR;
    for (const m of rootMats) {
      m.color.setHex(tintTarget);
      m.opacity = (rootBaseOpacity.get(m) ?? 0.8) * sceneVis;
    }

    composer.render();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const onResize = () => {
    const s = measure();
    viewW = s.w; viewH = s.h;
    renderer.setSize(viewW, viewH);
    composer.setSize(viewW, viewH);
    bloom.setSize(viewW, viewH);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    const px = renderer.getPixelRatio();
    for (const m of rootMats) m.resolution.set(viewW * px, viewH * px);
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
      // Min 0.08 so the seal stays as a faint ghost behind the inscription
      // — the engine is still there even when you've entered it.
      sceneVis = 1 - local * 0.92;
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
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup',   onMouseUp);
      window.removeEventListener('blur',      onBlur);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend',   onTouchEnd);
      for (const m of rootMats) m.dispose();
      for (const tend of tendrils) {
        for (const { geom } of tend.lines) geom.dispose();
      }
      coreMat.dispose();
      coreGeom.dispose();
      haloMat.dispose();
      haloTex.dispose();
      cMat.dispose();
      cGeo.dispose();
      composer.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
