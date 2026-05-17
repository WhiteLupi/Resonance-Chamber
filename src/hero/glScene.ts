import {
  createGLContext,
  sizeCanvas,
  WebGL2NotSupportedError,
  FloatRenderNotSupportedError,
} from './gl/context';
import { createFullscreenQuad } from './gl/quad';
import { createParticleState } from './gl/state';
import { createUpdatePass } from './gl/updatePass';
import { createParticleRenderer } from './gl/particles';
import { buildTextMask, collectInterior, type TextMask, type TextMaskOpts } from './gl/textMask';

const BG_R = 0xdd / 255;
const BG_G = 0xe0 / 255;
const BG_B = 0xe4 / 255;
// Vault-dark: matches the body --bg-vault color so the canvas clear stays
// flush with the CSS-driven page background. Same sRGB linear lerp both sides.
const BG_ABOUT_R = 0x04 / 255;
const BG_ABOUT_G = 0x07 / 255;
const BG_ABOUT_B = 0x0a / 255;

const PRIMARY_LINES = ["Let's hear", 'motion'];
const SIGNATURE_LINES = ['KASIA WALTER'];
const PRIMARY_FONT_FAMILY = '"Rubik Glitch", sans-serif';
const SIGNATURE_FONT_FAMILY = '"Space Mono", ui-monospace, monospace';
const FONT_WEIGHT = 400;

const PRIMARY_PADDING_X_CSS = 64;
const PRIMARY_PADDING_Y_CSS = 180;
const PRIMARY_SIZE_FRAC = 0.105;
const PRIMARY_SIZE_MAX = 210;
const PRIMARY_LINE_HEIGHT = 0.95;
const PRIMARY_MAX_WIDTH_FRAC = 0.62;

const SIGNATURE_PADDING_X_CSS = 64;
const SIGNATURE_PADDING_Y_CSS = 96;
const SIGNATURE_SIZE_FRAC = 0.028;
const SIGNATURE_SIZE_MAX = 48;
const SIGNATURE_LINE_HEIGHT = 1.0;
const SIGNATURE_MAX_WIDTH_FRAC = 0.45;

const GRID_SIZE = 384;
const DIRECTED_FRAC = 0.97;
const PRIMARY_FRAC = 0.78;

const ENTRANCE_PRIMARY_START = 0.0;
const ENTRANCE_PRIMARY_END = 1.5;
const ENTRANCE_SIGNATURE_START = 1.4;
const ENTRANCE_SIGNATURE_END = 2.25;
const APPROACH_DURATION = 1.7;
const APPROACH_DURATION_SIGNATURE = 1.1;
const SPAWN_TIME_JITTER = 0.15;
const SIGNATURE_SPAWN_JITTER = 0.22;
const FADE_IN = 0.18;
const SPAWN_OFFSET_X_CSS = 120;

const WIND_SPEED = 25;
const CURL_AMP_FLIGHT = 15;
const CURL_AMP_BG = 10;
const CURL_SCALE = 0.0055;
const CURL_TIME_SCALE = 0.18;
const GLITCH_AMP_CSS = 14;
const WAVE_AMP_CSS = 36;

const PRIMARY_INTERIOR_THRESHOLD = 50;
const SIGNATURE_INTERIOR_THRESHOLD = 130;

const DT_CAP = 1 / 30;

export type HeroScene = {
  setProgress: (p: number) => void;
  dispose: () => void;
};

export function startHero(host: HTMLElement): HeroScene {
  let ctx;
  try {
    ctx = createGLContext(host);
  } catch (err) {
    const cleanup = mountErrorMessage(host, err);
    return { setProgress: () => {}, dispose: cleanup };
  }

  if (import.meta.env.DEV) {
    console.info('[hero] WebGL2 init', {
      floatRender: ctx.floatRender,
      halfFloatRender: ctx.halfFloatRender,
      maxTextureSize: ctx.gl.getParameter(ctx.gl.MAX_TEXTURE_SIZE),
      vendor: ctx.gl.getParameter(ctx.gl.VENDOR),
      renderer: ctx.gl.getParameter(ctx.gl.RENDERER),
    });
  }

  const { gl, canvas } = ctx;

  let size = sizeCanvas(ctx, host);
  const onResize = () => {
    size = sizeCanvas(ctx, host);
  };
  window.addEventListener('resize', onResize);

  const quad = createFullscreenQuad(gl);

  let maskPrimary: TextMask = buildTextMask(gl, buildPrimaryMaskOpts(size.w, size.h, size.dpr));
  let maskSignature: TextMask = buildTextMask(gl, buildSignatureMaskOpts(size.w, size.h, size.dpr));
  let lastMaskKey = `${size.w}x${size.h}`;

  const { initPos, initVel } = makeInitData(GRID_SIZE, size.w, size.h, maskPrimary, maskSignature);
  const state = createParticleState(gl, {
    gridSize: GRID_SIZE,
    floatRender: ctx.floatRender,
    initPos,
    initVel,
  });

  const update = createUpdatePass(gl, state, quad);
  const renderer = createParticleRenderer(gl);

  let startTime = performance.now();
  const reseed = () => {
    const data = makeInitData(GRID_SIZE, size.w, size.h, maskPrimary, maskSignature);
    state.uploadInit(data.initPos, data.initVel);
    startTime = performance.now();
  };

  const ensureFontLoaded = () => {
    const primaryName = PRIMARY_FONT_FAMILY.split(',')[0].trim();
    const signatureName = SIGNATURE_FONT_FAMILY.split(',')[0].trim();
    Promise.all([
      document.fonts.load(`${FONT_WEIGHT} 100px ${primaryName}`),
      document.fonts.load(`${FONT_WEIGHT} 100px ${signatureName}`),
    ]).then(() => {
      lastMaskKey = '__force__';
    });
  };
  ensureFontLoaded();

  let raf = 0;
  let prevT = performance.now();
  let scrollProgress = 0;
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(DT_CAP, (now - prevT) / 1000);
    const time = (now - startTime) / 1000;
    prevT = now;

    const key = `${size.w}x${size.h}`;
    if (key !== lastMaskKey) {
      maskPrimary.dispose();
      maskSignature.dispose();
      maskPrimary = buildTextMask(gl, buildPrimaryMaskOpts(size.w, size.h, size.dpr));
      maskSignature = buildTextMask(gl, buildSignatureMaskOpts(size.w, size.h, size.dpr));
      lastMaskKey = key;
      reseed();
    }

    update.run({
      dt,
      time,
      resolution: { w: size.w, h: size.h },
      windSpeed: WIND_SPEED * size.dpr,
      curlAmp: CURL_AMP_FLIGHT * size.dpr,
      curlAmpBg: CURL_AMP_BG * size.dpr,
      curlScale: CURL_SCALE / size.dpr,
      curlTimeScale: CURL_TIME_SCALE,
      approachDuration: APPROACH_DURATION,
      approachDurationSignature: APPROACH_DURATION_SIGNATURE,
      settleBreath: GLITCH_AMP_CSS * size.dpr,
      spawnOffsetX: SPAWN_OFFSET_X_CSS * size.dpr,
      waveAmp: WAVE_AMP_CSS * size.dpr,
    });

    gl.viewport(0, 0, size.w, size.h);
    const p = Math.max(0, Math.min(1, scrollProgress));
    gl.clearColor(
      BG_R + (BG_ABOUT_R - BG_R) * p,
      BG_G + (BG_ABOUT_G - BG_G) * p,
      BG_B + (BG_ABOUT_B - BG_B) * p,
      1,
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderer.render(state, time, size, FADE_IN, p);

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setProgress(p: number) {
      scrollProgress = p;
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      maskPrimary.dispose();
      maskSignature.dispose();
      renderer.dispose();
      update.dispose();
      state.dispose();
      quad.dispose();
      const lose = gl.getExtension('WEBGL_lose_context');
      lose?.loseContext();
      canvas.remove();
    },
  };
}

function computeFontSize(
  lines: string[],
  family: string,
  weight: number,
  sizeFrac: number,
  sizeMax: number,
  maxWidthFrac: number,
  widthCss: number,
): number {
  const heightBasedCss = Math.min(widthCss * sizeFrac, sizeMax);
  const probeCtx = document.createElement('canvas').getContext('2d');
  if (!probeCtx) return heightBasedCss;
  const nominal = 100;
  probeCtx.font = `${weight} ${nominal}px ${family}`;
  let widest = 0;
  for (const line of lines) {
    const lw = probeCtx.measureText(line).width;
    if (lw > widest) widest = lw;
  }
  if (widest <= 0) return heightBasedCss;
  const targetWidthCss = widthCss * maxWidthFrac;
  const widthBasedCss = (nominal * targetWidthCss) / widest;
  return Math.min(heightBasedCss, widthBasedCss);
}

function buildPrimaryMaskOpts(width: number, height: number, dpr: number): TextMaskOpts {
  const cssSize = computeFontSize(
    PRIMARY_LINES, PRIMARY_FONT_FAMILY, FONT_WEIGHT,
    PRIMARY_SIZE_FRAC, PRIMARY_SIZE_MAX, PRIMARY_MAX_WIDTH_FRAC,
    width / dpr,
  );
  return {
    lines: PRIMARY_LINES,
    fontFamily: PRIMARY_FONT_FAMILY,
    fontWeight: FONT_WEIGHT,
    fontSize: cssSize * dpr,
    width,
    height,
    anchor: 'top-left',
    paddingX: PRIMARY_PADDING_X_CSS * dpr,
    paddingY: PRIMARY_PADDING_Y_CSS * dpr,
    lineHeight: PRIMARY_LINE_HEIGHT,
    textAlign: 'left',
  };
}

function buildSignatureMaskOpts(width: number, height: number, dpr: number): TextMaskOpts {
  const cssSize = computeFontSize(
    SIGNATURE_LINES, SIGNATURE_FONT_FAMILY, FONT_WEIGHT,
    SIGNATURE_SIZE_FRAC, SIGNATURE_SIZE_MAX, SIGNATURE_MAX_WIDTH_FRAC,
    width / dpr,
  );
  return {
    lines: SIGNATURE_LINES,
    fontFamily: SIGNATURE_FONT_FAMILY,
    fontWeight: FONT_WEIGHT,
    fontSize: cssSize * dpr,
    width,
    height,
    anchor: 'bottom-right',
    paddingX: SIGNATURE_PADDING_X_CSS * dpr,
    paddingY: SIGNATURE_PADDING_Y_CSS * dpr,
    lineHeight: SIGNATURE_LINE_HEIGHT,
    textAlign: 'right',
  };
}

function makeInitData(
  gridSize: number,
  w: number,
  h: number,
  maskPrimary: TextMask,
  maskSignature: TextMask,
): { initPos: Float32Array; initVel: Float32Array } {
  const n = gridSize * gridSize;
  const initPos = new Float32Array(n * 4);
  const initVel = new Float32Array(n * 4);

  const interiorPrimary = collectInterior(maskPrimary, PRIMARY_INTERIOR_THRESHOLD);
  const interiorSignature = collectInterior(maskSignature, SIGNATURE_INTERIOR_THRESHOLD);
  const hasPrimary = interiorPrimary.length > 0 && !!maskPrimary.bbox;
  const hasSignature = interiorSignature.length > 0 && !!maskSignature.bbox;

  interiorPrimary.sort((a, b) => (a.x - b.x) || (a.y - b.y));
  interiorSignature.sort((a, b) => (a.x - b.x) || (a.y - b.y));

  const nDirected = (hasPrimary || hasSignature) ? Math.floor(n * DIRECTED_FRAC) : 0;
  let nPrimary = 0;
  let nSignature = 0;
  if (hasPrimary && hasSignature) {
    nPrimary = Math.floor(nDirected * PRIMARY_FRAC);
    nSignature = nDirected - nPrimary;
  } else if (hasPrimary) {
    nPrimary = nDirected;
  } else if (hasSignature) {
    nSignature = nDirected;
  }
  const nAmbient = n - nPrimary - nSignature;

  assignGroup(initPos, initVel, 0, nPrimary, 0, interiorPrimary, maskPrimary,
    ENTRANCE_PRIMARY_START, ENTRANCE_PRIMARY_END);
  assignSignatureWordSync(initPos, initVel, nPrimary, nSignature, 1,
    interiorSignature, maskSignature,
    ENTRANCE_SIGNATURE_START, ENTRANCE_SIGNATURE_END);

  for (let i = 0; i < nAmbient; i++) {
    const idx = nPrimary + nSignature + i;
    initPos[idx * 4 + 0] = Math.random() * (w + 200);
    initPos[idx * 4 + 1] = Math.random() * h;
    initPos[idx * 4 + 2] = 0;
    initPos[idx * 4 + 3] = 0;
    initVel[idx * 4 + 0] = -1;
    initVel[idx * 4 + 1] = 0;
    initVel[idx * 4 + 2] = 2; // group=2 (ambient). Distinct from PRIMARY(0)/SIGNATURE(1).
    initVel[idx * 4 + 3] = 0;
  }

  return { initPos, initVel };
}

function assignGroup(
  initPos: Float32Array,
  initVel: Float32Array,
  offset: number,
  count: number,
  group: number,
  interior: { x: number; y: number }[],
  mask: TextMask,
  entranceStart: number,
  entranceEnd: number,
) {
  if (count <= 0 || interior.length === 0 || !mask.bbox) return;
  const xMin = mask.bbox.x0;
  const xRange = Math.max(1, mask.bbox.x1 - xMin);
  const span = entranceEnd - entranceStart;
  for (let i = 0; i < count; i++) {
    const idx = offset + i;
    const targetIdx = Math.floor((i * interior.length) / count) % interior.length;
    const tgt = interior[targetIdx];
    const tNorm = (tgt.x - xMin) / xRange;
    const jitter = (Math.random() - 0.5) * SPAWN_TIME_JITTER;
    const spawnTime = entranceStart + tNorm * span + jitter;

    initPos[idx * 4 + 0] = 0;
    initPos[idx * 4 + 1] = 0;
    initPos[idx * 4 + 2] = tgt.x;
    initPos[idx * 4 + 3] = tgt.y;
    initVel[idx * 4 + 0] = spawnTime;
    initVel[idx * 4 + 1] = 0;
    initVel[idx * 4 + 2] = group;
    initVel[idx * 4 + 3] = 0;
  }
}

function assignSignatureWordSync(
  initPos: Float32Array,
  initVel: Float32Array,
  offset: number,
  count: number,
  group: number,
  interior: { x: number; y: number }[],
  mask: TextMask,
  entranceStart: number,
  entranceEnd: number,
) {
  if (count <= 0 || interior.length === 0 || !mask.bbox) return;

  const xSet = new Set<number>();
  for (const p of interior) xSet.add(p.x);
  const xs = [...xSet].sort((a, b) => a - b);
  let maxGap = 0;
  let splitX = (mask.bbox.x0 + mask.bbox.x1) / 2;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > maxGap) {
      maxGap = gap;
      splitX = (xs[i - 1] + xs[i]) / 2;
    }
  }

  let w1Min = Infinity, w1Max = -Infinity;
  let w2Min = Infinity, w2Max = -Infinity;
  for (const p of interior) {
    if (p.x < splitX) {
      if (p.x < w1Min) w1Min = p.x;
      if (p.x > w1Max) w1Max = p.x;
    } else {
      if (p.x < w2Min) w2Min = p.x;
      if (p.x > w2Max) w2Max = p.x;
    }
  }
  const w1Range = Math.max(1, w1Max - w1Min);
  const w2Range = Math.max(1, w2Max - w2Min);
  const span = entranceEnd - entranceStart;

  for (let i = 0; i < count; i++) {
    const idx = offset + i;
    const targetIdx = Math.floor((i * interior.length) / count) % interior.length;
    const tgt = interior[targetIdx];

    const tNorm = tgt.x < splitX
      ? (tgt.x - w1Min) / w1Range
      : (tgt.x - w2Min) / w2Range;

    const jitter = (Math.random() - 0.5) * SIGNATURE_SPAWN_JITTER;
    const spawnTime = entranceStart + tNorm * span + jitter;

    initPos[idx * 4 + 0] = 0;
    initPos[idx * 4 + 1] = 0;
    initPos[idx * 4 + 2] = tgt.x;
    initPos[idx * 4 + 3] = tgt.y;
    initVel[idx * 4 + 0] = spawnTime;
    initVel[idx * 4 + 1] = 0;
    initVel[idx * 4 + 2] = group;
    initVel[idx * 4 + 3] = 0;
  }
}

function mountErrorMessage(host: HTMLElement, err: unknown): () => void {
  const div = document.createElement('div');
  div.style.cssText =
    'position:absolute;inset:0;display:grid;place-items:center;padding:24px;' +
    'color:#600;font:14px/1.5 system-ui,sans-serif;text-align:center';
  div.textContent =
    err instanceof WebGL2NotSupportedError
      ? 'Twoja przeglądarka nie wspiera WebGL2.'
      : err instanceof FloatRenderNotSupportedError
        ? 'Twoja karta nie wspiera renderowania do float textur.'
        : 'Błąd inicjalizacji WebGL.';
  host.appendChild(div);
  return () => div.remove();
}
