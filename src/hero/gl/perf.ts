export type HeroQualityTier = 'full' | 'balanced' | 'safe';

type HeroTierSettings = {
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
};

const HERO_TIER_SETTINGS: Record<HeroQualityTier, HeroTierSettings> = {
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
    // Held level with startup, not raised. The composer's target now follows the
    // pixel ratio (it used to be frozen at the startup value, which quietly made
    // this number decorative), so climbing to 0.82 after settling would mean a
    // machine already too slow for `balanced` gets handed 16% more pixels the
    // moment it stops struggling. `safe` is where we stop asking for more.
    settledCapMax: 0.76,
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

export type HeroPerf = typeof HERO_PERF_DEFAULTS;

type HeroPerfBoolKey =
  | 'enableBloom' | 'enableComets' | 'enableSonarRings'
  | 'enableChargePulse' | 'enableParallax' | 'profile';

export const readHeroPerf = (): HeroPerf => {
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
  // Mobile is the primary surface, and bloom is the whole cost: a fullscreen
  // multi-pass blur that forced the canvas down to a sub-native pixel ratio
  // (the pixeloza) and had to re-blur the fullscreen sonar wave every frame
  // (the stutter). Drop it on phones — the core's glow comes from its additive
  // halo instead (boosted in glScene) — and let the canvas render at native
  // retina, capped at 2 (where 3 is imperceptibly sharper for 2.25× the fill).
  // Bloom off also flips antialias:true on in glScene, so the core edge and the
  // tendrils resolve clean. (detect-gpu will later split strong-mobile → this
  // live path from weak-mobile → video; every phone gets the crisp engine here.)
  const mobile = window.innerWidth <= 760 || matchMedia('(pointer: coarse)').matches;
  if (mobile && params.get('hero-enableBloom') === null) {
    config.enableBloom = false;
    config.startupPixelRatioCap = 1.5;
    config.settledPixelRatioCap = 2.0;
  }
  if (params.get('hero-safe') === '1') {
    config.enableComets = false;
    config.enableSonarRings = false;
    config.enableChargePulse = false;
    config.startupPixelRatioCap = 0.9;
    config.settledPixelRatioCap = 1.0;
  }
  return config;
};

// Every machine stutters here while shaders compile — judging it would condemn
// fast hardware on its first breath.
const WARMUP_MS = 600;
// A fresh tier changes the frame cost; give it time to show what it can do
// before deciding whether it, too, is too slow.
const GRACE_MS = 800;
// Roughly two seconds at the 60fps cap. Long enough that one hitch (a GC pause,
// a background tab waking) cannot condemn the scene, short enough to react.
const WINDOW_FRAMES = 120;
const MIN_SAMPLES = 30;
// Judged against what THIS display can deliver, not against absolute numbers.
const SLOW_FACTOR = 1.35;
const STALL_FACTOR = 1.8;
const STALL_LIMIT = 3;
const SLOW_SHARE = 0.25;

// Runtime quality governor — watches frame times for the WHOLE session and walks
// the tier down (full → balanced → safe) when the budget is blown. Tiers only
// ever degrade; recovering upward would make the scene visibly pump.
//
// It samples forever, on purpose. An earlier version stopped at t=4.5s, which is
// before most visitors finish the two-second hold — and the scene roughly
// quadruples its draw calls at lock, when the tendrils finish growing. A laptop
// that coasts through the idle seal can still drown in the grown one, so the
// window keeps sliding.
//
// Thresholds are relative because the loop caps rendering by skipping rAF ticks:
// the interval between rendered frames is a multiple of the display's refresh —
// 16.7ms on a 60Hz or 120Hz panel, but 20ms at 100Hz and 26.7ms at 75Hz. Fixed
// thresholds called a healthy 75Hz display "slow" on every single frame.
export function createTierGovernor(
  initialTier: HeroQualityTier,
  targetFrameMs: number,
  onDowngrade: (reason: string) => void,
) {
  let tier = initialTier;
  let expectedMs = targetFrameMs;
  let graceUntilMs = 0;
  const refreshSamples: number[] = [];
  const stats = {
    samples: 0, slow: 0, stalls: 0, maxDt: 0,
    degrades: 0, lastReason: 'init', expectedMs,
  };

  const resetWindow = (reason: string, t?: number) => {
    stats.samples = 0;
    stats.slow = 0;
    stats.stalls = 0;
    stats.maxDt = 0;
    stats.lastReason = reason;
    if (t !== undefined) graceUntilMs = t * 1000 + GRACE_MS;
  };

  // rAF fires at the display's refresh rate whether or not we render, so the
  // interval between ticks IS the refresh period. Take the MEDIAN of the first
  // batch, never the minimum: rAF jitters, and a single short tick would shrink
  // the expected frame time and make the governor condemn a healthy display.
  // 60 ticks is under a second everywhere, and the warmup ignores that window.
  const REFRESH_SAMPLES = 60;
  const observeRefresh = (rawDtMs: number) => {
    if (refreshSamples.length >= REFRESH_SAMPLES) return;
    if (rawDtMs < 4 || rawDtMs > 100) return; // tab switch, debugger, hidden tab
    refreshSamples.push(rawDtMs);
    if (refreshSamples.length < REFRESH_SAMPLES) return;
    const refreshMs = [...refreshSamples].sort((a, b) => a - b)[REFRESH_SAMPLES >> 1];
    // We render on the first tick past targetFrameMs, so that multiple of the
    // refresh is what a healthy frame costs on this display.
    const ticksPerFrame = Math.max(1, Math.ceil((targetFrameMs - 1) / refreshMs));
    expectedMs = refreshMs * ticksPerFrame;
    stats.expectedMs = Number(expectedMs.toFixed(1));
  };

  const degradeTo = (nextTier: HeroQualityTier, reason: string, t: number) => {
    if (HERO_TIER_ORDER.indexOf(nextTier) <= HERO_TIER_ORDER.indexOf(tier)) return;
    tier = nextTier;
    stats.degrades += 1;
    resetWindow(reason, t);
    onDowngrade(reason);
  };

  const sample = (dtMs: number, t: number) => {
    const tMs = t * 1000;
    if (tMs < WARMUP_MS || tMs < graceUntilMs) return;
    stats.samples += 1;
    if (dtMs > expectedMs * STALL_FACTOR) stats.stalls += 1;
    else if (dtMs > expectedMs * SLOW_FACTOR) stats.slow += 1;
    stats.maxDt = Math.max(stats.maxDt, dtMs);
    if (stats.samples < MIN_SAMPLES) return;

    const struggling =
      stats.stalls >= STALL_LIMIT ||
      (stats.slow + stats.stalls) / stats.samples >= SLOW_SHARE;
    if (struggling) {
      const next = HERO_TIER_ORDER[HERO_TIER_ORDER.indexOf(tier) + 1];
      // Already on the floor: keep watching, but there is nowhere left to go.
      if (next) degradeTo(next, `slow-frames:${stats.maxDt.toFixed(1)}ms`, t);
      else resetWindow('at-floor', t);
    } else if (stats.samples >= WINDOW_FRAMES) {
      resetWindow('window-roll');
    }
  };

  return {
    get tier() { return tier; },
    get settings() { return HERO_TIER_SETTINGS[tier]; },
    stats,
    resetWindow,
    observeRefresh,
    sample,
  };
}
