import * as THREE from 'three';
import { prefersReducedMotion } from '../motion';
import { ACCENT, CORE_R } from './gl/constants';
import { readHeroPerf } from './gl/perf';
import { createComets } from './gl/comets';
import { createCoreGlow, createSonarRings } from './gl/glows';
import { createVeins } from './gl/veins';

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
  /** tempo of the veins' sway and breath (1 = calm default) */
  m: number;
  /** vein brightness multiplier */
  g: number;
  /** accent colour (sRGB hex) for core, glow, tips, rings and comets */
  c: number;
};

export type HeroScene = {
  setProgress: (p: number) => void;
  setJourney: (j: Journey) => void;
  /** Sends one wave of light through the figure. */
  pulse: () => void;
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

const LOCK_THRESHOLD = 0.999;
const HOLD_FILL_S = 2.0;
const RELEASE_FALL_S = 0.9;
// The core settles toward a backdrop on scroll but never goes out.
const CORE_GLOW_FLOOR = 0.72;
// No post-processing means the frame is cheap enough to render at the display's
// native density; 2 is where extra pixels stop being visible.
const MAX_PIXEL_RATIO = 2;
const CAM_DIST = 9.0;
const MIN_VIEWH = 640;
const HIT_FORGIVE = 2.4;
const IDLE_RING_INTERVAL = 12.5;
const MOBILE_MAX_W = 760;

// Per-frame smoothing written as a rate, so 60Hz and 120Hz displays converge
// identically. `perFrame` is the fraction covered in one 60Hz frame.
// Frame guard: when frames keep missing the display's refresh, give up pixels
// one step at a time. Never steps back up — a resolution that pumps reads as
// flicker. Lines antialias in their shaders, so a lower ratio stays smooth.
const PIXEL_RATIO_STEPS = [1.5, 1.25, 1];
const GUARD_WARMUP_S = 1.5;
const GUARD_WINDOW = 90;
const GUARD_SLOW_SHARE = 0.3;

function createFrameGuard(stepDown: () => boolean) {
  const refresh: number[] = [];
  let expectedMs = 0;
  let quietUntil = GUARD_WARMUP_S;
  let samples = 0;
  let slow = 0;
  let exhausted = false;
  const reset = (t: number) => {
    samples = 0;
    slow = 0;
    quietUntil = t + 1;
  };
  const sample = (ms: number, t: number) => {
    if (exhausted || ms > 250) return;
    // The median of the first ticks is this display's refresh period.
    if (refresh.length < 60) {
      refresh.push(ms);
      if (refresh.length === 60) expectedMs = [...refresh].sort((a, b) => a - b)[30];
      return;
    }
    if (t < quietUntil) return;
    samples += 1;
    if (ms > expectedMs * 1.5) slow += 1;
    if (samples < GUARD_WINDOW) return;
    if (slow / samples >= GUARD_SLOW_SHARE) exhausted = !stepDown();
    reset(t);
  };
  return { sample, reset };
}

const smoothing = (perFrame: number, dt: number) => 1 - Math.pow(1 - perFrame, dt * 60);

export function startHero(host: HTMLElement): HeroScene {
  const PERF = readHeroPerf();
  const REDUCED_MOTION = prefersReducedMotion();
  if (REDUCED_MOTION) {
    PERF.enableComets = false;
    PERF.enableChargePulse = false;
  }
  const perfDebug = window as typeof window & { __heroPerf?: Record<string, unknown> };
  const lockSubs = new Set<() => void>();
  const chargeSubs = new Set<(charge: number) => void>();
  const hoverSubs = new Set<(over: boolean) => void>();
  let locked = false;
  let disposed = false;
  let started = false;

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;' +
    'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  host.appendChild(canvas);

  // Rendering straight to the canvas, so MSAA here antialiases the core's
  // silhouette; the lines antialias themselves in their shaders.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000);
  // The original look was tuned through a composer that wrote linear values
  // straight to the screen; matching that keeps the palette identical.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  let pixelRatioCap = MAX_PIXEL_RATIO;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, pixelRatioCap);

  const measure = () => ({ w: host.clientWidth || window.innerWidth, h: host.clientHeight || window.innerHeight });
  let { w: viewW, h: viewH } = measure();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, viewW / viewH, 0.1, 100);
  camera.position.set(0, 0, CAM_DIST);

  // Off-axis key + teal rim from behind the shadow side: the core reads as a
  // lit sphere and the parallax orbit sweeps the shading across it.
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(-3.5, 4, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(ACCENT, 1.4);
  rimLight.position.set(3.5, -2.5, -4);
  scene.add(rimLight);

  const sealGroup = new THREE.Group();
  const particlesGroup = new THREE.Group();
  scene.add(sealGroup, particlesGroup);
  sealGroup.scale.setScalar(1.7);

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xd4cfc6,
    emissive: new THREE.Color(ACCENT),
    emissiveIntensity: 2.4,
    roughness: 0.45,
    metalness: 0.0,
  });
  const coreGeom = new THREE.SphereGeometry(CORE_R, 64, 48);
  const coreMesh = new THREE.Mesh(coreGeom, coreMat);
  sealGroup.add(coreMesh);

  // One accent instance shared by every layer, so a section's colour arrives
  // everywhere in the same frame.
  const accent = new THREE.Color(ACCENT);
  const accentTarget = accent.clone();
  const glow = createCoreGlow(sealGroup, accent);
  const sonar = createSonarRings(PERF.enableSonarRings, sealGroup, accent);
  const roots = createVeins(sealGroup, accent);
  const comets = createComets(PERF.enableComets, particlesGroup, accent);

  const applySize = () => {
    const pr = pixelRatio();
    renderer.setPixelRatio(pr);
    renderer.setSize(viewW, viewH);
    camera.aspect = viewW / viewH;
    roots.setViewport(viewW, viewH, pr);
    comets.setViewport(viewW, viewH, pr);
  };

  // Interaction
  let charge = 0;
  let lastNotifiedCharge = -1;
  let clickHeld = false;
  let mouseX = 0, mouseY = 0;
  let parallaxX = 0, parallaxY = 0;
  let lastClientX = -1, lastClientY = -1;
  let overCore = false;
  let sceneVis = 1.0;
  let rootsVis = 1.0;
  const journeyTarget: Journey = { x: 50, y: 50, s: 1, o: 1, r: 0, m: 1, g: 1, c: ACCENT };
  const journeyCur: Journey = { ...journeyTarget };
  applySize();

  // Below MIN_VIEWH the camera pulls in, so the seal's apparent size freezes
  // instead of shrinking with the viewport.
  const fitScale = () => (viewH < MIN_VIEWH ? MIN_VIEWH / viewH : 1);

  const _coreNdc = new THREE.Vector3();
  const isOverCore = (clientX: number, clientY: number) => {
    _coreNdc.copy(sealGroup.position).project(camera);
    const cx = (_coreNdc.x * 0.5 + 0.5) * viewW;
    const cy = (-_coreNdc.y * 0.5 + 0.5) * viewH;
    const jDist = CAM_DIST / (journeyCur.s * fitScale());
    const worldR = CORE_R * sealGroup.scale.x;
    const pxR = (worldR / jDist) * (viewH / (2 * Math.tan((camera.fov * Math.PI) / 360))) * HIT_FORGIVE;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return dx * dx + dy * dy <= pxR * pxR;
  };

  // Scene time only advances while the loop runs. A hidden tab pauses it rather
  // than resetting it, so timed effects (pulses, lock flash) resume mid-flight.
  let t = 0;
  let lastNow = 0;
  // The veins' own clock, so a section can speed their life up or slow it down
  // without a jump in phase.
  let motionT = 0;
  const broadcast = (t: number) => {
    sonar.trigger(t);
    roots.pulse?.(t);
  };
  const press = () => {
    clickHeld = true;
    if (locked) broadcast(t);
  };
  const onPointerMove = (e: PointerEvent) => {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    mouseX = (e.clientX / viewW) * 2 - 1;
    mouseY = (e.clientY / viewH) * 2 - 1;
  };
  const onMouseLeave = () => {
    lastClientX = -1;
    lastClientY = -1;
    mouseX = 0;
    mouseY = 0;
    if (overCore) {
      overCore = false;
      for (const cb of hoverSubs) cb(false);
    }
  };
  // The core is the only target: off-ball presses neither charge nor pulse.
  const onPointerDown = (e: PointerEvent) => {
    if (isOverCore(e.clientX, e.clientY)) press();
  };
  const release = () => { clickHeld = false; };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  let raf = 0;
  let nextIdleRingAt = Infinity;
  let frames = 0;
  const frameGuard = createFrameGuard(() => {
    const current = renderer.getPixelRatio();
    const next = PIXEL_RATIO_STEPS.find((step) => step < current - 0.01);
    if (next === undefined) return false;
    pixelRatioCap = next;
    applySize();
    return true;
  });
  let frameMsAvg = 0;
  let cpuMsAvg = 0;
  let gpuMsAvg = -1;
  // Profile-only GPU timing: one query in flight, read back a few frames later.
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timerExt = PERF.profile ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  let gpuQuery: WebGLQuery | null = null;
  const beginGpuTimer = () => {
    if (!timerExt || gpuQuery) return false;
    gpuQuery = gl.createQuery();
    if (!gpuQuery) return false;
    gl.beginQuery(timerExt.TIME_ELAPSED_EXT, gpuQuery);
    return true;
  };
  const readGpuTimer = () => {
    if (!timerExt || !gpuQuery) return;
    if (!gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
      const ms = gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT) / 1e6;
      gpuMsAvg = gpuMsAvg < 0 ? ms : gpuMsAvg + (ms - gpuMsAvg) * 0.1;
    }
    gl.deleteQuery(gpuQuery);
    gpuQuery = null;
  };

  const syncPerfDebug = () => {
    if (!PERF.profile) return;
    perfDebug.__heroPerf = {
      dpr: window.devicePixelRatio,
      renderPixelRatio: renderer.getPixelRatio(),
      canvasPx: [canvas.width, canvas.height],
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frameMsAvg: Number(frameMsAvg.toFixed(2)),
      cpuMsAvg: Number(cpuMsAvg.toFixed(3)),
      gpuMsAvg: Number(gpuMsAvg.toFixed(3)),
      pixelRatioCap,
      journey: { ...journeyCur },
    };
  };

  // Moving the seal across the screen moves the CAMERA, not the picture: the
  // eye travels sideways, so near and far veins slide at different speeds and
  // the seal reads as staying put while the gaze shifts.
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _shift = new THREE.Vector3();
  const updateCamera = (camYawOff: number, camPitchOff: number) => {
    const yaw = (journeyCur.r * Math.PI) / 180 + camYawOff;
    const jDist = CAM_DIST / (journeyCur.s * fitScale());
    const cosPitch = Math.cos(camPitchOff);
    camera.position.set(
      Math.sin(yaw) * jDist * cosPitch,
      Math.sin(camPitchOff) * jDist,
      Math.cos(yaw) * jDist * cosPitch,
    );
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const worldH = 2 * jDist * Math.tan((camera.fov * Math.PI) / 360);
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    _shift
      .copy(_right).multiplyScalar(((50 - journeyCur.x) / 100) * worldH * camera.aspect)
      .addScaledVector(_up, ((journeyCur.y - 50) / 100) * worldH);
    camera.position.add(_shift);
    camera.updateProjectionMatrix();
  };

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const rawDt = (now - lastNow) / 1000;
    lastNow = now;
    const dt = Math.min(0.05, rawDt);
    t += dt;
    frames += 1;
    frameMsAvg += (rawDt * 1000 - frameMsAvg) * 0.05;
    frameGuard.sample(rawDt * 1000, t);

    const jl = smoothing(0.07, dt);
    journeyCur.x += (journeyTarget.x - journeyCur.x) * jl;
    journeyCur.y += (journeyTarget.y - journeyCur.y) * jl;
    journeyCur.s += (journeyTarget.s - journeyCur.s) * jl;
    journeyCur.o += (journeyTarget.o - journeyCur.o) * jl;
    journeyCur.r += (journeyTarget.r - journeyCur.r) * jl;
    journeyCur.m += (journeyTarget.m - journeyCur.m) * jl;
    journeyCur.g += (journeyTarget.g - journeyCur.g) * jl;
    accent.lerp(accentTarget, jl);

    // Pointer parallax orbits the CAMERA; the seal holds still, like the moon
    // keeping its face.
    if (PERF.enableParallax) {
      const pl = smoothing(0.06, dt);
      parallaxX += (mouseX - parallaxX) * pl;
      parallaxY += (mouseY - parallaxY) * pl;
    }
    updateCamera(parallaxX * 0.21, -parallaxY * 0.16);

    if (locked) {
      charge = 1;
    } else if (clickHeld) {
      // Reduced motion: a single press wakes the engine instead of a sustained hold.
      charge = REDUCED_MOTION ? 1 : Math.min(1, charge + dt / HOLD_FILL_S);
    } else {
      charge = Math.max(0, charge - dt / RELEASE_FALL_S);
    }
    if (charge !== lastNotifiedCharge) {
      lastNotifiedCharge = charge;
      for (const cb of chargeSubs) cb(charge);
    }
    if (!locked && charge >= LOCK_THRESHOLD) {
      charge = 1;
      locked = true;
      for (const cb of lockSubs) cb();
      broadcast(t);
      nextIdleRingAt = REDUCED_MOTION ? Infinity : t + IDLE_RING_INTERVAL;
    }
    if (locked && t >= nextIdleRingAt) {
      broadcast(t);
      nextIdleRingAt = t + IDLE_RING_INTERVAL;
    }

    if (!REDUCED_MOTION) motionT += dt * journeyCur.m;
    roots.update(charge, motionT, t);

    const pointerMotion = Math.min(1, (Math.abs(mouseX - parallaxX) + Math.abs(mouseY - parallaxY)) * 1.8);
    const pull = comets.update({ dt, charge, locked, pointerMotion });
    // Post-lock the seal leans a hair toward passing comets; pre-lock it stays
    // pinned dead-centre inside the charge ring.
    const tug = locked ? 0.0015 : 0;
    const tl = smoothing(0.15, dt);
    sealGroup.position.x += (pull.x * tug - sealGroup.position.x) * tl;
    sealGroup.position.y += (pull.y * tug - sealGroup.position.y) * tl;
    sealGroup.position.z += (pull.z * tug - sealGroup.position.z) * tl;

    if (lastClientX >= 0) {
      const nowOver = isOverCore(lastClientX, lastClientY);
      if (nowOver !== overCore) {
        overCore = nowOver;
        for (const cb of hoverSubs) cb(nowOver);
      }
    }

    const jVis = journeyCur.o;
    const sealVis = sceneVis * jVis;
    const coreGlow = CORE_GLOW_FLOOR + (1 - CORE_GLOW_FLOOR) * sealVis;
    const rootJVis = PERF.mobile ? Math.max(jVis, 0.6) : jVis;
    const pulse = PERF.enableChargePulse ? 1 : 0;
    const chargeFx = charge * pulse;
    const breath = 1 + Math.sin(t * 1.25) * 0.04 * pulse;
    coreMesh.scale.setScalar(breath);
    coreMat.emissive.copy(accent);
    rimLight.color.copy(accent);
    coreMat.emissiveIntensity = (1.6 + chargeFx * 3.0 + Math.sin(t * 1.7) * 0.15 * pulse) * coreGlow;

    glow.update(
      (1.0 + chargeFx * 0.5) * breath,
      (0.28 + chargeFx * 0.18) * coreGlow,
      (0.20 + chargeFx * 0.22) * coreGlow * 3.0,
    );
    sonar.update(t, breath, sealVis);
    comets.setOpacity(0.95 * sealVis);
    roots.applyVisibility(charge, rootsVis, rootJVis, (PERF.mobile ? 1.8 : 1) * journeyCur.g);

    const timing = PERF.profile && beginGpuTimer();
    renderer.render(scene, camera);
    if (timing && timerExt) gl.endQuery(timerExt.TIME_ELAPSED_EXT);
    if (PERF.profile) {
      readGpuTimer();
      cpuMsAvg += (performance.now() - now - cpuMsAvg) * 0.05;
    }
    if (frames % 30 === 0) syncPerfDebug();
  };

  // Compile every program before the first visible frame so the reveal never
  // hitches on shader compilation; the canvas fades in only once it can draw.
  renderer.compileAsync(scene, camera).then(() => {
    if (disposed) return;
    started = true;
    lastNow = performance.now();
    raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => {
      if (!disposed) host.style.opacity = '1';
    });
  });

  // A hidden tab parks the loop; on return the gap is swallowed, so nothing
  // jumps and the idle heartbeat keeps its rhythm.
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    if (raf || disposed || !started) return;
    lastNow = performance.now();
    frameGuard.reset(t);
    raf = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Phones resize on every address-bar collapse; only a width change (rotation,
  // real resize) re-measures there, or the seal jumps mid-scroll.
  const onResize = () => {
    const s = measure();
    if (s.w === viewW && s.w <= MOBILE_MAX_W && pixelRatio() === renderer.getPixelRatio()) return;
    viewW = s.w;
    viewH = s.h;
    applySize();
  };
  window.addEventListener('resize', onResize);

  return {
    setProgress(p: number) {
      // The organism stays alive under the about copy: core and roots only
      // settle a little; legibility comes from the dark pools behind the text.
      const local = Math.max(0, Math.min(1, (p - 0.15) / 0.6));
      sceneVis = 1 - local * 0.35;
      rootsVis = 1 - local * 0.2;
    },
    setJourney(j: Journey) {
      Object.assign(journeyTarget, j);
      accentTarget.setHex(j.c);
    },
    pulse() {
      if (locked && !REDUCED_MOTION) broadcast(t);
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
    holdStart: press,
    holdEnd: release,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      delete perfDebug.__heroPerf;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      roots.dispose();
      comets.dispose();
      sonar.dispose();
      glow.dispose();
      coreMat.dispose();
      coreGeom.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
