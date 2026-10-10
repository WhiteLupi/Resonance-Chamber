import * as THREE from 'three';
import { prefersReducedMotion } from '../../motion';
import { ACCENT, CORE_R } from '../gl/constants';
import { readHeroPerf } from '../gl/perf';
import type { HeroScene, Journey } from '../glScene';
import { createTendrilFieldV2 } from './tendrils';
import { createCometsV2 } from './comets';
import { createCoreGlow, createSonarRingsV2 } from './glows';

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
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

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

  const glow = createCoreGlow(sealGroup);
  const sonar = createSonarRingsV2(PERF.enableSonarRings, sealGroup);
  const roots = createTendrilFieldV2(sealGroup);
  const comets = createCometsV2(PERF.enableComets, particlesGroup);

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
  const journeyTarget: Journey = { x: 50, y: 50, s: 1, o: 1, r: 0 };
  const journeyCur: Journey = { x: 50, y: 50, s: 1, o: 1, r: 0 };
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

  const clock = new THREE.Clock(false);
  const press = () => {
    clickHeld = true;
    if (locked) sonar.trigger(clock.getElapsedTime());
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
  let lastT = 0;
  let nextIdleRingAt = Infinity;
  let frames = 0;
  let frameMsAvg = 0;

  const syncPerfDebug = () => {
    if (!PERF.profile) return;
    perfDebug.__heroPerf = {
      engine: 'v2',
      dpr: window.devicePixelRatio,
      renderPixelRatio: renderer.getPixelRatio(),
      canvasPx: [canvas.width, canvas.height],
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frameMsAvg: Number(frameMsAvg.toFixed(2)),
    };
  };

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
    camera.setViewOffset(
      viewW, viewH,
      ((journeyCur.x - 50) / 100) * -viewW,
      ((journeyCur.y - 50) / 100) * -viewH,
      viewW, viewH,
    );
    camera.updateProjectionMatrix();
  };

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    const rawDt = t - lastT;
    lastT = t;
    const dt = Math.min(0.05, rawDt);
    frames += 1;
    frameMsAvg += (rawDt * 1000 - frameMsAvg) * 0.05;

    const jl = smoothing(0.07, dt);
    journeyCur.x += (journeyTarget.x - journeyCur.x) * jl;
    journeyCur.y += (journeyTarget.y - journeyCur.y) * jl;
    journeyCur.s += (journeyTarget.s - journeyCur.s) * jl;
    journeyCur.o += (journeyTarget.o - journeyCur.o) * jl;
    journeyCur.r += (journeyTarget.r - journeyCur.r) * jl;

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
      sonar.trigger(t);
      nextIdleRingAt = REDUCED_MOTION ? Infinity : t + IDLE_RING_INTERVAL;
    }
    if (locked && t >= nextIdleRingAt) {
      sonar.trigger(t);
      nextIdleRingAt = t + IDLE_RING_INTERVAL;
    }

    const motionT = REDUCED_MOTION ? 0 : t;
    roots.update(charge, motionT);

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
    coreMat.emissiveIntensity = (1.6 + chargeFx * 3.0 + Math.sin(t * 1.7) * 0.15 * pulse) * coreGlow;

    glow.update(
      (1.0 + chargeFx * 0.5) * breath,
      (0.28 + chargeFx * 0.18) * coreGlow,
      (0.20 + chargeFx * 0.22) * coreGlow * 3.0,
    );
    sonar.update(t, breath, sealVis);
    comets.setOpacity(0.95 * sealVis);
    roots.applyVisibility(charge, rootsVis, rootJVis, PERF.mobile ? 1.8 : 1);

    renderer.render(scene, camera);
    if (frames % 30 === 0) syncPerfDebug();
  };

  // Compile every program before the first visible frame so the reveal never
  // hitches on shader compilation; the canvas fades in only once it can draw.
  renderer.compileAsync(scene, camera).then(() => {
    if (disposed) return;
    started = true;
    clock.start();
    lastT = clock.getElapsedTime();
    raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => {
      if (!disposed) host.style.opacity = '1';
    });
  });

  // A hidden tab parks the loop; on return the gap is swallowed so dt doesn't
  // spike and the idle heartbeat re-arms instead of firing at once.
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      clock.stop();
      return;
    }
    if (raf || disposed || !started) return;
    clock.start();
    lastT = clock.getElapsedTime();
    if (nextIdleRingAt !== Infinity) nextIdleRingAt = lastT + IDLE_RING_INTERVAL;
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
