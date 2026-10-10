// Deterministic space-colonization growth for the mycelium roots. Pure data, no
// three.js, so it can be inspected offline. Units are the roots' local space
// (before ROOTS_SCALE); z is the depth axis.

export type Lobe = {
  /** direction in the screen plane, degrees (0 = right, 90 = up) */
  angle: number;
  /** z component of the axis before normalising: tilts the lobe toward/away from camera */
  tilt: number;
  /** how far the attractor cloud reaches from the centre */
  reach: number;
  /** cone half-angle at full reach, radians */
  spread: number;
  /** charge at which this trunk starts to grow */
  start: number;
};

export type Chain = {
  /** xyz triplets */
  pos: number[];
  /** arclength from the core surface */
  s: number[];
  /** CSS px */
  width: number[];
  trunk: number;
};

export type MyceliumTree = { chains: Chain[]; trunkLen: number[]; nodeCount: number };

export type GrowParams = {
  seed: number;
  baseR: number;
  lobes: Lobe[];
  /** attractors per unit of reach (scaled by spread) */
  density: number;
  step: number;
  influence: number;
  kill: number;
  /** weight of the current heading against the attractor pull */
  inertia: number;
  /** per-step heading change limit, radians: keeps curves smooth */
  maxTurn: number;
  /** pull of tips away from the core */
  outward: number;
  forkMin: number;
  forkMax: number;
  /** nodes along a chain that must separate two forks */
  forkGap: number;
  /** vascular exponent: parent^E = sum(child^E); 2 = Leonardo, 3 = Murray */
  vascularE: number;
  tipPx: number;
  maxPx: number;
  /** arclength over which a branch thins to hairline before its tip */
  tipFade: number;
  /** Catmull-Rom subdivisions per growth step */
  subdiv: number;
};

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type V = [number, number, number];
const len = (v: V) => Math.hypot(v[0], v[1], v[2]);
const norm = (v: V): V => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const perpOf = (d: V): V => norm(cross(d, Math.abs(d[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]));

// Rotate `from` toward `to` so the angle between the result and `from` lies in
// [minA, maxA]. Used both to cap turning and to force Y-fork angles.
const steer = (from: V, to: V, minA: number, maxA: number): V => {
  const c = Math.max(-1, Math.min(1, dot(from, to)));
  const ang = Math.acos(c);
  let side = norm([to[0] - from[0] * c, to[1] - from[1] * c, to[2] - from[2] * c]);
  if (ang < 1e-4 || !Number.isFinite(side[0])) side = perpOf(from);
  const a = Math.max(minA, Math.min(maxA, ang));
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return norm([from[0] * ca + side[0] * sa, from[1] * ca + side[1] * sa, from[2] * ca + side[2] * sa]);
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function growMycelium(p: GrowParams): MyceliumTree {
  const rand = mulberry32(p.seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;

  const pos: V[] = [];
  const dir: V[] = [];
  const parent: number[] = [];
  const children: number[][] = [];
  const trunk: number[] = [];
  const blocked: boolean[] = [];

  const axes = p.lobes.map((l) => {
    const a = (l.angle * Math.PI) / 180;
    return norm([Math.cos(a), Math.sin(a), l.tilt]);
  });

  // Attractor clouds: one cone per lobe, widening outward. Uniform in radius
  // (not volume), so the far ends thin out into sparse hairlines.
  const attr: V[] = [];
  const stemR = p.baseR + p.influence * 0.6;
  p.lobes.forEach((l, k) => {
    const ax = axes[k];
    const u = perpOf(ax);
    const w = cross(ax, u);
    const n = Math.round(p.density * l.reach * (l.spread / 0.45));
    for (let i = 0; i < n; i++) {
      const r = stemR + (l.reach - stemR) * Math.pow(rand(), 0.85);
      const sp = l.spread * (0.3 + 0.7 * (r / l.reach));
      const a1 = gauss() * sp;
      const a2 = gauss() * sp * 0.45;
      const d = norm([
        ax[0] + u[0] * a1 + w[0] * a2,
        ax[1] + u[1] * a1 + w[1] * a2,
        (ax[2] + u[2] * a1 + w[2] * a2) * 0.6,
      ]);
      attr.push([d[0] * r, d[1] * r, d[2] * r]);
    }
  });
  const alive = attr.map(() => true);

  // Each attractor remembers its nearest node; only nodes added since the last
  // iteration can change that, so a new node scans just the attractors around it.
  const cell = p.influence;
  const key = (x: number, y: number, z: number) =>
    ((Math.floor(x / cell) + 512) * 1024 + (Math.floor(y / cell) + 512)) * 1024 + (Math.floor(z / cell) + 512);
  const buckets = (grid: Map<number, number[]>, q: V) => {
    const out: number[][] = [];
    const cx = Math.floor(q[0] / cell), cy = Math.floor(q[1] / cell), cz = Math.floor(q[2] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const b = grid.get(((cx + dx + 512) * 1024 + (cy + dy + 512)) * 1024 + (cz + dz + 512));
      if (b) out.push(b);
    }
    return out;
  };
  const insert = (grid: Map<number, number[]>, q: V, i: number) => {
    const k = key(q[0], q[1], q[2]);
    const b = grid.get(k);
    if (b) b.push(i);
    else grid.set(k, [i]);
  };
  const attrGrid = new Map<number, number[]>();
  attr.forEach((q, i) => insert(attrGrid, q, i));
  const attrNear = new Int32Array(attr.length).fill(-1);
  const attrDist = new Float64Array(attr.length).fill(Infinity);
  const nodeGrid = new Map<number, number[]>();

  const addNode = (pt: V, d: V, par: number, k: number) => {
    const i = pos.length;
    pos.push(pt);
    dir.push(d);
    parent.push(par);
    children.push([]);
    trunk.push(k);
    blocked.push(false);
    if (par >= 0) children[par].push(i);
    insert(nodeGrid, pt, i);
    for (const b of buckets(attrGrid, pt)) for (const a of b) {
      if (!alive[a]) continue;
      const q = attr[a];
      const dist = Math.hypot(q[0] - pt[0], q[1] - pt[1], q[2] - pt[2]);
      if (dist < p.kill) alive[a] = false;
      else if (dist < p.influence && dist < attrDist[a]) { attrDist[a] = dist; attrNear[a] = i; }
    }
    return i;
  };
  const crowded = (pt: V, r: number, skip: number) => {
    for (const b of buckets(nodeGrid, pt)) for (const i of b) {
      if (i === skip) continue;
      const q = pos[i];
      if (Math.hypot(q[0] - pt[0], q[1] - pt[1], q[2] - pt[2]) < r) return true;
    }
    return false;
  };

  // Trunk bases sit on the core; a short stem carries them to the cloud.
  axes.forEach((ax, k) => {
    let i = addNode([ax[0] * p.baseR, ax[1] * p.baseR, ax[2] * p.baseR], ax, -1, k);
    // The stem leaves the core with a slight curl so trunks don't read as spokes.
    const bend = perpOf(ax);
    const curl = (rand() - 0.5) * 0.12;
    while (len(pos[i]) < stemR) {
      const d = norm([dir[i][0] + bend[0] * curl, dir[i][1] + bend[1] * curl, dir[i][2] + bend[2] * curl]);
      const q = pos[i];
      blocked[i] = true;
      i = addNode([q[0] + d[0] * p.step, q[1] + d[1] * p.step, q[2] + d[2] * p.step], d, i, k);
    }
  });

  const run = (i: number) => {
    let n = 0;
    for (let j = i; parent[j] >= 0 && children[parent[j]].length === 1 && n < p.forkGap; j = parent[j]) n++;
    return n;
  };
  const blockAround = (i: number) => {
    let j = i;
    for (let n = 0; n < p.forkGap && j >= 0; n++, j = parent[j]) blocked[j] = true;
    j = i;
    for (let n = 0; n < p.forkGap && j >= 0; n++) {
      blocked[j] = true;
      j = children[j].length ? children[j][0] : -1;
    }
  };

  const pullX = new Float64Array(20000);
  const pullY = new Float64Array(20000);
  const pullZ = new Float64Array(20000);
  const pullN = new Uint16Array(20000);
  for (let iter = 0; iter < 400 && pos.length < 19000; iter++) {
    const count = pos.length;
    pullX.fill(0, 0, count); pullY.fill(0, 0, count); pullZ.fill(0, 0, count); pullN.fill(0, 0, count);
    for (let a = 0; a < attr.length; a++) {
      if (!alive[a]) continue;
      const index = attrNear[a];
      if (index < 0) continue;
      const q = attr[a];
      const dist = attrDist[a];
      const o = pos[index];
      pullX[index] += (q[0] - o[0]) / dist;
      pullY[index] += (q[1] - o[1]) / dist;
      pullZ[index] += (q[2] - o[2]) / dist;
      pullN[index]++;
    }
    let grew = 0;
    for (let i = 0; i < count; i++) {
      if (pullN[i] === 0) continue;
      const want = norm([pullX[i], pullY[i], pullZ[i]]);
      const d = dir[i];
      const nc = children[i].length;
      let nd: V;
      if (nc === 0) {
        // Outward bias keeps tips from hooking back toward the core.
        const out = norm(pos[i]);
        const blend = norm([
          d[0] * p.inertia + want[0] + out[0] * p.outward,
          d[1] * p.inertia + want[1] + out[1] * p.outward,
          d[2] * p.inertia + want[2] + out[2] * p.outward,
        ]);
        nd = steer(d, blend, 0, p.maxTurn);
      } else if (nc === 1 && !blocked[i] && pullN[i] >= 2 && run(i) >= p.forkGap) {
        // Side shoot only when the pull points away from the existing child.
        if (dot(want, dir[children[i][0]]) > Math.cos(p.forkMin)) continue;
        nd = steer(d, want, p.forkMin, p.forkMax);
      } else continue;
      const o = pos[i];
      const np: V = [o[0] + nd[0] * p.step, o[1] + nd[1] * p.step, o[2] + nd[2] * p.step];
      if (crowded(np, p.step * 0.6, i)) continue;
      if (nc === 1) blockAround(i);
      addNode(np, nd, i, trunk[i]);
      grew++;
    }
    if (!grew) break;
  }

  // Drop stubby side shoots: two-node spikes read as thorns, not roots.
  const removed = new Array<boolean>(pos.length).fill(false);
  for (let i = pos.length - 1; i >= 0; i--) {
    if (children[i].length || parent[i] < 0) continue;
    let j = i;
    let n = 0;
    while (parent[j] >= 0 && children[parent[j]].length === 1) { j = parent[j]; n++; }
    if (parent[j] >= 0 && n < 3) {
      for (let x = i; ; x = parent[x]) {
        removed[x] = true;
        if (x === j) break;
      }
      const par = parent[j];
      children[par] = children[par].filter((c) => c !== j);
    }
  }

  // Vascular widths and distance-to-tip, leaves first (children have higher ids).
  const N = pos.length;
  const wE = new Float64Array(N);
  const height = new Float64Array(N);
  const main = new Int32Array(N).fill(-1);
  for (let i = N - 1; i >= 0; i--) {
    if (removed[i]) continue;
    if (!children[i].length) { wE[i] = 1; continue; }
    let best = -1;
    for (const c of children[i]) {
      wE[i] += wE[c];
      const h = height[c] + len([pos[c][0] - pos[i][0], pos[c][1] - pos[i][1], pos[c][2] - pos[i][2]]);
      height[i] = Math.max(height[i], h);
      if (best < 0 || wE[c] > wE[best]) best = c;
    }
    main[i] = best;
  }

  // Laplacian smoothing along main paths irons out the residual step jitter;
  // forks move with their chain, so side shoots stay attached.
  for (let k = 0; k < 3; k++) {
    const next = pos.map((q) => [...q] as V);
    for (let i = 0; i < N; i++) {
      if (removed[i] || parent[i] < 0 || main[i] < 0) continue;
      const a = pos[parent[i]];
      const b = pos[main[i]];
      for (let c = 0; c < 3; c++) next[i][c] = pos[i][c] * 0.5 + (a[c] + b[c]) * 0.25;
    }
    for (let i = 0; i < N; i++) pos[i] = next[i];
  }

  const s = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (removed[i] || parent[i] < 0) continue;
    const a = pos[parent[i]];
    s[i] = s[parent[i]] + Math.hypot(pos[i][0] - a[0], pos[i][1] - a[1], pos[i][2] - a[2]);
  }
  const px = (i: number) => {
    const vasc = Math.min(p.maxPx, p.tipPx * Math.pow(wE[i], 1 / p.vascularE));
    const tipped = p.tipPx + (vasc - p.tipPx) * smoothstep(0, p.tipFade, height[i]);
    // Slight flare where the trunk leaves the core.
    return tipped * (1 + 0.2 * (1 - smoothstep(0, 0.3, s[i])));
  };

  const trunkLen = p.lobes.map(() => 0);
  const chains: Chain[] = [];
  let nodeCount = 0;
  for (let i = 0; i < N; i++) {
    if (removed[i]) continue;
    nodeCount++;
    const par = parent[i];
    if (par >= 0 && main[par] === i) continue;
    const ids: number[] = par >= 0 ? [par] : [];
    for (let j = i; j >= 0; j = main[j]) ids.push(j);
    if (ids.length < 2) continue;
    let w = ids.map(px);
    // The fork point belongs to the parent; start the shoot at its own width.
    if (par >= 0) w[0] = w[1];
    for (let k = 0; k < 4; k++) {
      w = w.map((v, n) => (n === 0 || n === w.length - 1 ? v : (w[n - 1] + 2 * v + w[n + 1]) * 0.25));
    }
    const k = trunk[i];
    trunkLen[k] = Math.max(trunkLen[k], s[ids[ids.length - 1]]);
    chains.push(subdivide(ids.map((id) => pos[id]), ids.map((id) => s[id]), w, k, p.subdiv));
  }
  return { chains, trunkLen, nodeCount };
}

// Uniform Catmull-Rom through the nodes (it interpolates them, so fork points
// stay exact); s and width interpolate linearly.
function subdivide(pts: V[], s: number[], w: number[], trunk: number, sub: number): Chain {
  const out: Chain = { pos: [], s: [], width: [], trunk };
  const n = pts.length;
  const at = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t, t3 = t2 * t;
      for (let c = 0; c < 3; c++) {
        out.pos.push(0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t
          + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
          + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3));
      }
      out.s.push(s[i] + (s[i + 1] - s[i]) * t);
      out.width.push(w[i] + (w[i + 1] - w[i]) * t);
    }
  }
  out.pos.push(...pts[n - 1]);
  out.s.push(s[n - 1]);
  out.width.push(w[n - 1]);
  return out;
}
