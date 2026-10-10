import type * as THREE from 'three';
import { MOBILE_MAX_W } from './constants';

const HERO_PERF_DEFAULTS = {
  enableComets: true,
  enableSonarRings: true,
  enableChargePulse: true,
  enableParallax: true,
  profile: false,
  mobile: false,
};

export type HeroPerf = typeof HERO_PERF_DEFAULTS;

const SWITCHES = ['enableComets', 'enableSonarRings', 'enableChargePulse', 'enableParallax', 'profile'] as const;

// Feature switches, overridable for debugging: ?hero-enableComets=0, and
// ?hero-profile=1 exposes frame timings on window.__heroPerf.
export const readHeroPerf = (): HeroPerf => {
  const config = { ...HERO_PERF_DEFAULTS };
  const params = new URLSearchParams(window.location.search);
  for (const key of SWITCHES) {
    const value = params.get(`hero-${key}`);
    if (value === '0' || value === 'false') config[key] = false;
    if (value === '1' || value === 'true') config[key] = true;
  }
  config.mobile = window.innerWidth <= MOBILE_MAX_W || matchMedia('(pointer: coarse)').matches;
  return config;
};

type Snapshot = () => Record<string, unknown>;

// Profile-only frame timings published on window.__heroPerf: frame, CPU and
// GPU averages plus whatever the scene adds. The GPU timer keeps one query in
// flight and reads it back a few frames later. Disabled, it just renders.
export function createProfiler(enabled: boolean, renderer: THREE.WebGLRenderer, snapshot: Snapshot) {
  const target = window as typeof window & { __heroPerf?: Record<string, unknown> };
  if (!enabled) {
    return { frame: (_now: number, _frameMs: number, render: () => void) => render(), dispose: () => {} };
  }
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let query: WebGLQuery | null = null;
  let frames = 0;
  let frameMsAvg = 0;
  let cpuMsAvg = 0;
  let gpuMsAvg = -1;

  const readGpu = () => {
    if (!timerExt || !query) return;
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
      const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gpuMsAvg = gpuMsAvg < 0 ? ms : gpuMsAvg + (ms - gpuMsAvg) * 0.1;
    }
    gl.deleteQuery(query);
    query = null;
  };

  const frame = (now: number, frameMs: number, render: () => void) => {
    frames += 1;
    frameMsAvg += (frameMs - frameMsAvg) * 0.05;
    let timing = false;
    if (timerExt && !query) {
      query = gl.createQuery();
      if (query) {
        gl.beginQuery(timerExt.TIME_ELAPSED_EXT, query);
        timing = true;
      }
    }
    render();
    if (timing && timerExt) gl.endQuery(timerExt.TIME_ELAPSED_EXT);
    readGpu();
    cpuMsAvg += (performance.now() - now - cpuMsAvg) * 0.05;
    if (frames % 30 !== 0) return;
    target.__heroPerf = {
      ...snapshot(),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frameMsAvg: Number(frameMsAvg.toFixed(2)),
      cpuMsAvg: Number(cpuMsAvg.toFixed(3)),
      gpuMsAvg: Number(gpuMsAvg.toFixed(3)),
    };
  };

  return { frame, dispose: () => { delete target.__heroPerf; } };
}
