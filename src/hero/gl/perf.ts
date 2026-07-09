export type HeroQualityTier = 'full' | 'balanced' | 'safe';

export type HeroTierSettings = {
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
  if (params.get('hero-safe') === '1') {
    config.enableComets = false;
    config.enableSonarRings = false;
    config.enableChargePulse = false;
    config.startupPixelRatioCap = 0.9;
    config.settledPixelRatioCap = 1.0;
  }
  return config;
};

// Runtime quality governor — samples frame times during the first seconds and
// walks the tier down (full → balanced → safe) when the budget is blown. Tiers
// only ever degrade; recovering upward would make the scene visibly pump.
export function createTierGovernor(
  initialTier: HeroQualityTier,
  onDowngrade: (reason: string) => void,
) {
  let tier = initialTier;
  const stats = { samples: 0, over24: 0, over32: 0, maxDt: 0, degrades: 0, lastReason: 'init' };

  const resetWindow = (reason: string) => {
    stats.samples = 0;
    stats.over24 = 0;
    stats.over32 = 0;
    stats.maxDt = 0;
    stats.lastReason = reason;
  };

  const degradeTo = (nextTier: HeroQualityTier, reason: string) => {
    if (HERO_TIER_ORDER.indexOf(nextTier) <= HERO_TIER_ORDER.indexOf(tier)) return;
    tier = nextTier;
    stats.degrades += 1;
    resetWindow(reason);
    onDowngrade(reason);
  };

  const sample = (dtMs: number, t: number) => {
    if (t > 4.5) return;
    stats.samples += 1;
    if (dtMs > 24) stats.over24 += 1;
    if (dtMs > 32) stats.over32 += 1;
    stats.maxDt = Math.max(stats.maxDt, dtMs);
    if (tier === 'full' && (stats.over32 >= 1 || stats.over24 >= 4)) {
      degradeTo('balanced', `startup-drop:${dtMs.toFixed(1)}ms`);
    } else if (tier === 'balanced' && stats.samples >= 45 && (stats.over32 >= 1 || stats.over24 >= 6)) {
      degradeTo('safe', `persistent-drop:${dtMs.toFixed(1)}ms`);
    }
  };

  return {
    get tier() { return tier; },
    get settings() { return HERO_TIER_SETTINGS[tier]; },
    stats,
    resetWindow,
    sample,
  };
}

export type TierGovernor = ReturnType<typeof createTierGovernor>;
