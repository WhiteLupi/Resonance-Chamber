import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { prefersReducedMotion } from '../motion';
import { ACCENT, CORE_R } from './gl/constants';
import { createTierGovernor, readHeroPerf, type HeroQualityTier } from './gl/perf';
import { createSonarRings } from './gl/sonar';
import { createComets } from './gl/comets';
import { createTendrilField } from './gl/tendrils';

// charge reaches this and we lock — the seal stays charged forever and comets
// decouple back to idle drift speed. Charge now ramps LINEARLY in time so it
// hits 1 cleanly; lock just shy of 1 to avoid a one-frame growth pop at the snap.
const LOCK_THRESHOLD = 0.999;
// Hold timing: seconds to fully charge while held, and a faster drain on release.
const HOLD_FILL_S = 2.0;
const RELEASE_FALL_S = 0.9;
const STARTUP_QUALITY_S = 1.2;
const QUALITY_RAMP_S = 0.8;
// The chamber breathes on a ~1.25Hz sine and the comets drift; nothing here
// resolves faster than the eye. On a 120Hz panel rAF fires twice as often as the
// scene has anything new to say, and each extra frame pays the bloom's full
// fullscreen-blur bill. Cap at 60. The 1ms slack matters: without it a 60Hz
// display would miss the budget by a rounding hair every frame and halve to 30.
const MIN_FRAME_S = 1 / 60 - 0.001;

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

  // With bloom on, the scene is rasterized into the composer's render target and
  // the default framebuffer receives only a fullscreen quad — which has no
  // interior edges for MSAA to resolve. `antialias: true` therefore bought a 4×
  // multisampled backbuffer that smoothed nothing and cost a resolve every
  // frame. The seal's edge never was antialiased; the bloom hides it. Ask the
  // canvas for MSAA only when there is no composer, where it does real work.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !HERO_PERF.enableBloom,
    alpha: false,
  });
  // Start conservative where the machine tells us it will struggle: a dense
  // display multiplies every fill, and a small core count usually travels with a
  // weak integrated GPU. The governor can only walk DOWN, so guessing `full` on
  // a slow laptop costs it seconds of stutter before it recovers; guessing
  // `balanced` costs a fast one almost nothing.
  const modestCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  let initialTier: HeroQualityTier =
    (HERO_PERF.enableComets && window.devicePixelRatio >= 2) || modestCpu ? 'balanced' : 'full';
  if (!HERO_PERF.enableComets && !HERO_PERF.enableSonarRings && !HERO_PERF.enableChargePulse) {
    initialTier = 'safe';
  }
  const governor = createTierGovernor(initialTier, MIN_FRAME_S * 1000, (reason) => {
    setRenderPixelRatio(perfPhase);
    refreshLineResolutions();
    syncPerfDebug({ downgraded: true, downgradeReason: reason });
  });
  const getPixelRatioCap = (phase: 'startup' | 'steady' | 'locked') => {
    const tier = governor.settings;
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
  if (bloom) {
    // Every bloom target is a fullscreen blur — not one of them reads or writes
    // depth, yet WebGLRenderTarget attaches a depth buffer by default. On a
    // tile-based GPU (Apple silicon) each attachment is loaded into and stored
    // out of tile memory per pass, so eleven unused depth buffers cost eleven
    // round trips to VRAM every frame. Drop them before first use, while the
    // GPU-side targets are still unallocated.
    const bloomTargets = [
      bloom.renderTargetBright,
      ...bloom.renderTargetsHorizontal,
      ...bloom.renderTargetsVertical,
    ];
    for (const rt of bloomTargets) {
      rt.depthBuffer = false;
      rt.stencilBuffer = false;
    }
  }

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

  const sonar = createSonarRings(HERO_PERF.enableSonarRings, tetraGroup);

  const lineRes = new THREE.Vector2(
    viewW * renderer.getPixelRatio(),
    viewH * renderer.getPixelRatio(),
  );
  const roots = createTendrilField(tetraGroup, lineRes);

  const comets = createComets(HERO_PERF.enableComets, particlesGroup);

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
    if (locked) sonar.trigger(clock.getElapsedTime());
  };
  const onMouseUp   = () => { clickHeld = false; };
  const onBlur      = () => { clickHeld = false; };
  const onTouchStart = (e: TouchEvent) => {
    const t0 = e.touches[0];
    if (t0 && !isOverCore(t0.clientX, t0.clientY)) return;
    clickHeld = true;
    if (locked) sonar.trigger(clock.getElapsedTime());
  };
  const onTouchEnd   = () => { clickHeld = false; };
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup',   onMouseUp);
  window.addEventListener('blur',      onBlur);
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend',   onTouchEnd);

  // Loop
  const clock = new THREE.Clock();
  let lastT = clock.getElapsedTime();
  let lastRawT = lastT;
  let raf = 0;
  let perfPhase: 'startup' | 'steady' | 'locked' = 'startup';
  let qualityRamp = 0;
  let frameCount = 0;
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
      tier: governor.tier,
      phase: perfPhase,
      dpr: window.devicePixelRatio,
      renderPixelRatio: renderer.getPixelRatio(),
      ...governor.stats,
      ...extra,
    };
  };
  const refreshLineResolutions = () => {
    const px = renderer.getPixelRatio();
    roots.setResolution(viewW * px, viewH * px);
  };
  const settleRenderQuality = () => {
    setRenderPixelRatio(perfPhase);
    refreshLineResolutions();
  };
  syncPerfDebug();

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    // Every tick, rendered or not, tells us how fast this display runs.
    governor.observeRefresh((t - lastRawT) * 1000);
    lastRawT = t;
    // Frame-rate cap: bail before any work — no camera math, no root flexing,
    // no bloom. On a 60Hz panel this passes every frame; on 120Hz it drops
    // every other one, and the scene looks identical.
    if (t - lastT < MIN_FRAME_S) return;
    const sinceLast = t - lastT;
    // Physics gets a clamped step so a stall can't teleport the scene; the
    // governor gets the real one, because the stall is exactly what it hunts.
    const dt = Math.min(0.05, sinceLast);
    lastT = t;
    frameCount += 1;
    const tier = governor.settings;
    governor.sample(sinceLast * 1000, t);

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
      // Reduced motion: the visitor asked for calm, not endurance — a single
      // press wakes the engine instead of a 2-second sustained hold.
      charge = REDUCED_MOTION ? 1 : Math.min(1, charge + dt / HOLD_FILL_S);
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
      // Lock is where the scene gets heavy — the tendrils finish growing and the
      // draw count roughly quadruples. Judge the new load, not the old one.
      governor.resetWindow('post-lock', t);
      perfPhase = 'locked';
      settleRenderQuality();
      // Announce activation with one final ring — the engine just turned on.
      sonar.trigger(t);
      nextIdleRingAt = REDUCED_MOTION ? Infinity : t + IDLE_RING_INTERVAL;
    }

    // Idle heartbeat post-lock — slow rhythmic ring even without input.
    if (locked && tier.idleRings && t >= nextIdleRingAt) {
      sonar.trigger(t);
      nextIdleRingAt = REDUCED_MOTION ? Infinity : t + IDLE_RING_INTERVAL;
    }

    // motionT freezes at 0 under reduced motion — the figure holds its pose.
    const motionT = REDUCED_MOTION ? 0 : t;
    roots.update(charge, motionT, frameCount % tier.rootUpdateStep === 0);

    const pointerMotion = Math.min(1, (Math.abs(mouseX - parallaxX) + Math.abs(mouseY - parallaxY)) * 1.8);
    const pull = comets.update({
      dt,
      charge,
      locked,
      frameCount,
      updateStep: tier.cometUpdateStep,
      trailScale: tier.cometTrailScale,
      pointerMotion,
    });

    // Proximity tug — post-lock the seal drifts a hair toward passing comets so
    // it reads as alive. PRE-LOCK the tug is OFF: the core must stay pinned at
    // origin so it sits dead-centre inside the charge ring during the hold
    // ritual (the tug used to pull it off-centre as charge climbed).
    const tugStrength = locked ? 0.0015 : 0;
    const tugLerp = 0.15;
    tetraGroup.position.x += (pull.x * tugStrength - tetraGroup.position.x) * tugLerp;
    tetraGroup.position.y += (pull.y * tugStrength - tetraGroup.position.y) * tugLerp;
    tetraGroup.position.z += (pull.z * tugStrength - tetraGroup.position.z) * tugLerp;

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

    sonar.update(t, breath, tier.sonarOpacity * sceneVis * jVis);

    const startupBloomMul = 0.65 + qualityRamp * 0.35;
    if (bloom) bloom.strength = (0.32 + chargeFx * 0.20) * startupBloomMul * tier.bloomScale * sceneVis * jVis;

    comets.setOpacity(tier.cometOpacity * sceneVis * jVis);
    roots.applyVisibility(charge, rootsVis, jVis);

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    if (frameCount % 30 === 0) syncPerfDebug();
  };
  raf = requestAnimationFrame(loop);

  // A backgrounded tab still owns its GPU context, and rAF only reliably stalls
  // when the tab is truly hidden — a window buried behind another on a second
  // monitor keeps ticking. Park the loop outright. On resume, swallow the gap:
  // lastT catches up so dt doesn't spike, and the idle heartbeat re-arms instead
  // of firing a ring the instant the visitor comes back.
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    if (raf) return;
    lastT = clock.getElapsedTime();
    lastRawT = lastT;
    if (nextIdleRingAt !== Infinity) nextIdleRingAt = lastT + IDLE_RING_INTERVAL;
    raf = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', onVisibility);

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
      if (locked) sonar.trigger(clock.getElapsedTime());
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
      roots.dispose();
      coreMat.dispose();
      coreGeom.dispose();
      haloMat.dispose();
      haloTex.dispose();
      // EffectComposer.dispose only frees its own targets (r169) — the bloom
      // pass and the sonar sprite materials hold GPU resources of their own.
      sonar.dispose();
      bloom?.dispose();
      comets.dispose();
      composer?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
