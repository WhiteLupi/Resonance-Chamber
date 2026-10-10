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
  config.mobile = window.innerWidth <= 760 || matchMedia('(pointer: coarse)').matches;
  return config;
};
