import type { HeroScene } from './hero/glScene';

export type JourneyTarget = Pick<HeroScene, 'setJourney' | 'pulse'>;
import { ACCENT, MOBILE_MAX_W } from './hero/gl/constants';

// Travelling seal: the route moves through the empty space in each section,
// always opposite the copy. Keyframes are interpolated from scroll position
// here; glScene smooths the target per frame. `m` is the veins' tempo and `g`
// their brightness, so each value can be felt in the figure; `o` is the
// seal's overall brightness (legibility comes from the pools behind the text).
// `hold` keeps the seal parked on a key through the first fraction of its
// outgoing segment: the ritual in hero, and each value while it is read.
type Key = {
  id: string; x: number; y: number; s: number; o: number; r: number;
  m?: number; g?: number; c?: number; hold?: number; pulse?: boolean;
};
// Earth tones, low in chroma: sage as home, one warm departure (clay) for
// the manifesto. Interface accents stay teal throughout.
const SAGE = ACCENT;
const C = {
  clay: 0x766656,
  stone: 0x6a6964,
  rose: 0x77636b,
  ochre: 0x736a52,
  lichen: 0x646e5e,
  dusk: 0x484c50,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpHex = (a: number, b: number, t: number) => {
  const ch = (shift: number) => Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
// Keyframe x is a position within the content column (max CONTENT_MAX px),
// so on a wide screen the seal stays beside its copy instead of drifting
// to the viewport edge. Must match --content-max in index.css.
const CONTENT_MAX = 1600;
const toViewX = (x: number) => 50 + (x - 50) * Math.min(1, CONTENT_MAX / window.innerWidth);
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Returns the per-frame update: reads section positions, sets the seal's target.
// `video` is the phone's recorded hero, where only y, s and o apply.
export function createJourney(locked: boolean, video: boolean) {
  // Pre-lock the seal sits dead centre inside the charge ring; once awake it
  // drifts left and the question takes the right.
  const HERO_X = locked ? 33 : 50;
  const VALUE_HOLD = 0.7;
  const KEYS: Key[] = [
    { id: 'hero', x: HERO_X, y: 50, s: 1.00, o: 1.00, r: 0, hold: 0.45 },
    { id: 'about', x: 70, y: 48, s: 0.72, o: 0.75, r: 40, c: C.clay, hold: 0.2 },
    { id: 'values', x: 50, y: 34, s: 0.62, o: 0.5, r: 80 },
    { id: 'value-whole', x: 30, y: 50, s: 0.5, o: 0.95, r: 110, c: C.stone, hold: VALUE_HOLD },
    { id: 'value-sense', x: 30, y: 50, s: 0.95, o: 1, r: 140, g: 1.45, c: C.rose, hold: VALUE_HOLD },
    { id: 'value-meaning', x: 30, y: 50, s: 0.85, o: 0.9, r: 170, g: 1.1, c: C.ochre, hold: VALUE_HOLD, pulse: true },
    { id: 'value-play', x: 30, y: 50, s: 0.9, o: 1, r: 215, m: 2.4, g: 1.15, c: C.lichen, hold: VALUE_HOLD },
    { id: 'value-rest', x: 30, y: 50, s: 0.78, o: 0.4, r: 235, m: 0.25, g: 0.7, c: C.dusk, hold: VALUE_HOLD },
    // Contact: the seal settles centred above the closing line.
    { id: 'contact', x: 50, y: 30, s: 0.8, o: 0.85, r: 270 },
  ];
  // The mobile route is a vertical spine — every keyframe sits at x:50. A
  // phone viewport has no side room: any lateral keyframe turns into a
  // visible side-to-side swim between sections. The seal breathes along the
  // centre axis instead: scale, height, glow, tempo.
  const KEYS_MOBILE: Key[] = [
    { id: 'hero', x: 50, y: locked ? 36 : 50, s: 1.00, o: 1.00, r: 0, hold: 0.45 },
    { id: 'about', x: 50, y: 24, s: 0.62, o: 0.10, r: 40, c: C.clay },
    { id: 'values', x: 50, y: 26, s: 0.55, o: 0.2, r: 80 },
    { id: 'value-whole', x: 50, y: 26, s: 0.45, o: 0.35, r: 110, c: C.stone },
    { id: 'value-sense', x: 50, y: 26, s: 0.7, o: 0.35, r: 140, g: 1.45, c: C.rose },
    { id: 'value-meaning', x: 50, y: 26, s: 0.65, o: 0.35, r: 170, g: 1.1, c: C.ochre, pulse: true },
    { id: 'value-play', x: 50, y: 26, s: 0.65, o: 0.35, r: 215, m: 2.4, g: 1.15, c: C.lichen },
    { id: 'value-rest', x: 50, y: 26, s: 0.6, o: 0.2, r: 235, m: 0.25, g: 0.7, c: C.dusk },
    // Between the eyebrow and the closing block.
    { id: 'contact', x: 50, y: 47, s: 0.55, o: 0.60, r: 270 },
  ];

  // The recorded seal: down at the edge under the manifesto, gone while the
  // values are read, back in the middle for the close.
  const KEYS_VIDEO: Key[] = [
    { id: 'hero', x: 50, y: 36, s: 1, o: 1, r: 0 },
    { id: 'about', x: 50, y: 80, s: 1, o: 0.25, r: 0 },
    { id: 'values', x: 50, y: 80, s: 1, o: 0, r: 0 },
    { id: 'value-rest', x: 50, y: 80, s: 1, o: 0, r: 0 },
    { id: 'contact', x: 50, y: 50, s: 0.9, o: 0.5, r: 0 },
  ];

  let segment = '';
  const enter = (scene: JourneyTarget, k: Key) => {
    if (k.id === segment) return;
    segment = k.id;
    if (k.pulse) scene.pulse();
  };

  return (scene: JourneyTarget) => {
    const mobile = window.innerWidth <= MOBILE_MAX_W;
    const activeKeys = video ? KEYS_VIDEO : mobile ? KEYS_MOBILE : KEYS;
    const mid = window.innerHeight * (mobile ? 0.12 : 0.5);
    const secs = activeKeys
      .map((k) => ({ k, el: document.getElementById(k.id) }))
      .filter((s): s is { k: Key; el: HTMLElement } => s.el !== null);
    for (let i = 0; i < secs.length; i++) {
      const { k } = secs[i];
      const r = secs[i].el.getBoundingClientRect();
      const next = secs[i + 1];
      if (!next) {
        enter(scene, k);
        scene.setJourney({
          x: toViewX(k.x), y: k.y, s: k.s, o: k.o, r: k.r, m: k.m ?? 1, g: k.g ?? 1, c: k.c ?? SAGE,
        });
        return;
      }
      const nr = next.el.getBoundingClientRect();
      // A last section shorter than the screen never brings its top up to
      // `mid`; it arrives when the page bottoms out instead.
      const arrive = i + 2 === secs.length ? Math.max(mid, window.innerHeight - nr.height) : mid;
      if (r.top <= mid && nr.top > arrive) {
        enter(scene, k);
        let raw = Math.min(1, Math.max(0, (mid - r.top) / (mid - r.top + nr.top - arrive)));
        // Mobile has no "hold to charge" indicator and the seal is only a
        // faint backdrop behind the text — so a keyframe hold or a per-segment
        // ease reads as the scroll STICKING, not as intent. On mobile the seal
        // tracks scroll 1:1 (no hold, linear) for uniform motion; desktop keeps
        // the holds and the eased settle between keys.
        const hold = mobile ? 0 : (k.hold ?? 0);
        if (hold > 0) {
          raw = Math.max(0, (raw - hold) / (1 - hold));
        }
        const t = mobile ? raw : ease(raw);
        const n = next.k;
        scene.setJourney({
          x: toViewX(lerp(k.x, n.x, t)),
          y: lerp(k.y, n.y, t),
          s: lerp(k.s, n.s, t),
          o: lerp(k.o, n.o, t),
          r: lerp(k.r, n.r, t),
          m: lerp(k.m ?? 1, n.m ?? 1, t),
          g: lerp(k.g ?? 1, n.g ?? 1, t),
          c: lerpHex(k.c ?? SAGE, n.c ?? SAGE, t),
        });
        return;
      }
    }
  };
}
