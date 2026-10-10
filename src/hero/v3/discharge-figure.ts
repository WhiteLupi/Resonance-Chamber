// Build-time Lichtenberg figure: stochastic leaders that jitter, fork and avoid
// each other (a cheap stand-in for dielectric breakdown), then get rounded
// into veins. Pure data, no three.js, so it can be inspected outside the app.

type V3 = [number, number, number];

export type Branch = {
  /** smoothed points, xyz flat */
  pts: number[];
  /** arc distance from the core along the tree, per point */
  dist: number[];
  /** ribbon width in CSS px, per point */
  width: number[];
  order: number;
  /** stable 0..1 random, drives flicker */
  seed: number;
  /** 0..1 how far this leader gets before the lock flash; never above its parent */
  reach: number;
};

export type Figure = { branches: Branch[]; maxDist: number; pointCount: number };

export const FIGURE = {
  seed: 7,
  trunks: 18,
  /** ellipsoid the figure fills (before the Z squash); overflows the frame vertically */
  bounds: [2.45, 1.95, 1.5] as V3,
  zSquash: 0.4,
  step: 0.075,
  stepDecay: 0.88,
  stepMin: 0.032,
  /** per-step random heading kick: higher = more electric zig-zag */
  jitter: 0.62,
  /** pull away from the core so leaders keep spreading */
  outward: 0.22,
  /** push away from other branches; keeps the fractal from clumping */
  repel: 0.05,
  repelR: 0.16,
  forkP: [0.3, 0.3, 0.28, 0.26, 0.22, 0.18, 0.14],
  forkAngle: [0.35, 0.85] as [number, number],
  maxOrder: 7,
  maxBranches: 1400,
  maxRawPoints: 9000,
  /** Chaikin passes: rounds the zig-zags into veins, keeps the fractal outline */
  smooth: 2,
  /** width (CSS px) = clamp(tip + k * downstreamLength ^ exp) */
  widthTip: 0.55,
  widthK: 0.75,
  widthExp: 0.5,
  widthMax: 5.5,
};

const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
// Rodrigues rotation of v around unit axis k.
const rotate = (v: V3, k: V3, ang: number): V3 => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
};

type Raw = { pts: V3[]; parent: number; attach: number; order: number; reach: number; seed: number };
type Seed = { start: V3; heading: V3; order: number; budget: number; parent: number; attach: number; reach: number };

export function buildFigure(baseRadius: number): Figure {
  const F = FIGURE;
  const rnd = mulberry32(F.seed);
  const randUnit = (): V3 => {
    for (;;) {
      const v: V3 = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
      const l = len(v);
      if (l > 0.05 && l <= 1) return [v[0] / l, v[1] / l, v[2] / l];
    }
  };
  const randPerp = (h: V3) => norm(cross(h, randUnit()));
  const ellip = (p: V3) => Math.hypot(p[0] / F.bounds[0], p[1] / F.bounds[1], p[2] / F.bounds[2]);

  // Spatial hash of every grown point, for repulsion and no-crossing checks.
  const cell = F.repelR;
  const grid = new Map<string, { p: V3; b: number }[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const insert = (p: V3, b: number) => {
    const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell));
    const list = grid.get(k);
    if (list) list.push({ p, b });
    else grid.set(k, [{ p, b }]);
  };
  const neighbours = (p: V3, self: number, ignore: number) => {
    let push: V3 = [0, 0, 0];
    let nearest = Infinity;
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    const cz = Math.floor(p[2] / cell);
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let z = cz - 1; z <= cz + 1; z++) {
          const list = grid.get(key(x, y, z));
          if (!list) continue;
          for (const q of list) {
            if (q.b === self || q.b === ignore) continue;
            const d = sub(p, q.p);
            const l = len(d);
            if (l > F.repelR || l < 1e-6) continue;
            nearest = Math.min(nearest, l);
            push = add(push, d, (F.repelR - l) / (l * F.repelR));
          }
        }
    return { push, nearest };
  };

  const raws: Raw[] = [];
  const queue: Seed[] = [];
  let rawPoints = 0;

  for (let i = 0; i < F.trunks; i++) {
    const ang = (i / F.trunks) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const dir = norm([Math.cos(ang), Math.sin(ang) * 0.85, (rnd() - 0.5) * 0.9]);
    // A few trunks stay short so the core isn't a symmetric star.
    const budget = rnd() < 0.3 ? 0.6 + rnd() * 0.7 : 2.4 + rnd() * 1.0;
    queue.push({ start: [dir[0] * baseRadius, dir[1] * baseRadius, dir[2] * baseRadius], heading: dir, order: 0, budget, parent: -1, attach: 0, reach: 1 });
  }

  // FIFO: each generation grows before the next, so finer branches compete for
  // the space the leaders left, as in a real discharge.
  while (queue.length && raws.length < F.maxBranches && rawPoints < F.maxRawPoints) {
    const s = queue.shift()!;
    const id = raws.length;
    const step = Math.max(F.stepMin, F.step * Math.pow(F.stepDecay, s.order));
    const pts: V3[] = [s.start];
    let pos = s.start;
    let h = s.heading;
    let travelled = 0;
    while (travelled < s.budget) {
      const ignore = pts.length < 4 ? s.parent : -2;
      const { push, nearest } = neighbours(pos, id, ignore);
      h = add(h, randUnit(), F.jitter);
      h = add(h, norm(pos), F.outward);
      h = add(h, push, F.repel);
      h = norm(h);
      const next = add(pos, h, step);
      // Discharge channels don't merge: stop before touching another one.
      if ((nearest < step * 0.6 && len(next) > 0.3) || ellip(next) > 1 + rnd() * 0.06) break;
      pos = next;
      pts.push(pos);
      travelled += step;
      const forkP = F.forkP[Math.min(s.order, F.forkP.length - 1)];
      if (s.order < F.maxOrder && pts.length > 2 && rnd() < forkP) {
        const axis = randPerp(h);
        const a = F.forkAngle[0] + rnd() * (F.forkAngle[1] - F.forkAngle[0]);
        const budget = (s.budget - travelled) * (0.45 + rnd() * 0.5);
        if (budget > step * 3) {
          queue.push({
            start: pos, heading: rotate(h, axis, a), order: s.order + 1, budget,
            parent: id, attach: pts.length - 1, reach: s.reach * (0.6 + rnd() * 0.4),
          });
          h = rotate(h, axis, -a * 0.3);
        }
      }
    }
    // Forks need 3+ points, so a dropped stub never has queued children.
    if (pts.length < 3) continue;
    raws.push({ pts, parent: s.parent, attach: s.attach, order: s.order, reach: s.reach, seed: rnd() });
    rawPoints += pts.length;
    for (const p of pts) insert(p, id);
  }

  return finish(raws);
}

const chaikin = (pts: V3[], passes: number): V3[] => {
  let out = pts;
  for (let k = 0; k < passes; k++) {
    const next: V3[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      next.push(add(a, sub(b, a), 0.25), add(a, sub(b, a), 0.75));
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
};

function finish(raws: Raw[]): Figure {
  const F = FIGURE;
  const smoothPts: V3[][] = [];
  const dists: number[][] = [];
  const attachS: number[] = [];

  raws.forEach((r, i) => {
    const raw = r.pts.map((p): V3 => [p[0], p[1], p[2] * F.zSquash]);
    let baseDist = 0;
    let at = 0;
    if (r.parent >= 0) {
      // Smoothing moved the parent's points: re-seat the fork on the parent's
      // smoothed curve so the joint stays closed.
      const pp = smoothPts[r.parent];
      let best = Infinity;
      for (let j = 0; j < pp.length; j++) {
        const d = len(sub(pp[j], raw[0]));
        if (d < best) { best = d; at = j; }
      }
      raw[0] = pp[at];
      baseDist = dists[r.parent][at];
    }
    const pts = chaikin(raw, F.smooth);
    const dist = [baseDist];
    for (let j = 1; j < pts.length; j++) dist.push(dist[j - 1] + len(sub(pts[j], pts[j - 1])));
    smoothPts[i] = pts;
    dists[i] = dist;
    attachS[i] = at;
  });

  // Downstream length (own remainder + every subtree hanging further out) sets
  // width, so trunks carry the whole figure's weight and forks taper smoothly.
  const subtree = new Map<number, number>();
  const children = new Map<number, number[]>();
  for (let i = 0; i < raws.length; i++) {
    const p = raws[i].parent;
    if (p >= 0) {
      const list = children.get(p);
      if (list) list.push(i);
      else children.set(p, [i]);
    }
  }
  const widths: number[][] = [];
  for (let i = raws.length - 1; i >= 0; i--) {
    const d = dists[i];
    const total = d[d.length - 1] - d[0];
    const kids = (children.get(i) ?? []).slice().sort((a, b) => attachS[b] - attachS[a]);
    const w = new Array<number>(d.length);
    let kidSum = 0;
    let kIdx = 0;
    for (let j = d.length - 1; j >= 0; j--) {
      while (kIdx < kids.length && attachS[kids[kIdx]] >= j) kidSum += subtree.get(kids[kIdx++]) ?? 0;
      const down = d[d.length - 1] - d[j] + kidSum;
      w[j] = Math.min(F.widthMax, F.widthTip + F.widthK * Math.pow(down, F.widthExp));
    }
    widths[i] = w;
    subtree.set(i, total + kidSum);
  }

  let maxDist = 0;
  let pointCount = 0;
  const branches: Branch[] = raws.map((r, i) => {
    const d = dists[i];
    maxDist = Math.max(maxDist, d[d.length - 1]);
    pointCount += d.length;
    return {
      pts: smoothPts[i].flat(),
      dist: d,
      width: widths[i],
      order: r.order,
      seed: r.seed,
      reach: r.reach,
    };
  });
  return { branches, maxDist, pointCount };
}
