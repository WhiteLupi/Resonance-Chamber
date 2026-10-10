import type { Figure } from './veins-figure';

// Flattens the figure into the ribbon mesh's vertex buffers: two vertices per
// point (one per side), two triangles per segment. Transferable, so it can be
// built off the main thread.
export type VeinBuffers = {
  pos: Float32Array;
  prev: Float32Array;
  next: Float32Array;
  /** dist from core, side, width */
  attrA: Float32Array;
  vigour: Float32Array;
  index: Uint32Array;
  maxDist: number;
};

export function packFigure(figure: Figure): VeinBuffers {
  const vertCount = figure.pointCount * 2;
  const segCount = figure.branches.reduce((n, b) => n + Math.max(b.dist.length - 1, 0), 0);
  const pos = new Float32Array(vertCount * 3);
  const prev = new Float32Array(vertCount * 3);
  const next = new Float32Array(vertCount * 3);
  const attrA = new Float32Array(vertCount * 3);
  const vigour = new Float32Array(vertCount);
  const index = new Uint32Array(segCount * 6);
  let v = 0;
  let k = 0;
  for (const b of figure.branches) {
    const count = b.dist.length;
    const base = v;
    for (let i = 0; i < count; i++) {
      const ip = Math.max(i - 1, 0) * 3;
      const ic = i * 3;
      const inx = Math.min(i + 1, count - 1) * 3;
      for (const side of [-1, 1]) {
        const o = v * 3;
        for (let c = 0; c < 3; c++) {
          pos[o + c] = b.pts[ic + c];
          prev[o + c] = b.pts[ip + c];
          next[o + c] = b.pts[inx + c];
        }
        attrA[o] = b.dist[i];
        attrA[o + 1] = side;
        attrA[o + 2] = b.width[i];
        vigour[v] = b.reach;
        v++;
      }
      if (i < count - 1) {
        const a = base + i * 2;
        index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k);
        k += 6;
      }
    }
  }
  return { pos, prev, next, attrA, vigour, index, maxDist: figure.maxDist };
}

export const transferablesOf = (b: VeinBuffers) =>
  [b.pos.buffer, b.prev.buffer, b.next.buffer, b.attrA.buffer, b.vigour.buffer, b.index.buffer];
