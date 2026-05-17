import type { ShapeKind } from '../hero/Cursor';

// Voice v2 — letter substitution bus.
// Char state machine: idle → entering → held → exiting → idle. Hover-in-radius
// keeps a char held indefinitely; when the radius leaves, it cascades back out.
// Ambient scheduler triggers a single brief enter+exit cycle on a random char
// to keep the inscription quietly breathing even without interaction.

const SHAPES: ShapeKind[] = ['circle', 'triangle', 'square', 'circle-half', 'triangle-half'];

export const ENTER_MS = 220;
export const EXIT_MS = 220;
const AUTO_HOLD_MS = 700;
const SCHEDULER_BASE_MS = 6500;
const SCHEDULER_JITTER_MS = 3000;

export type Phase = 'idle' | 'entering' | 'held' | 'exiting';
export type CharState = { phase: Phase; startedAt: number; shape: ShapeKind };

type CharKey = string;
type Listener = (s: CharState) => void;

const states = new Map<CharKey, CharState>();
const listeners = new Map<CharKey, Listener>();
const lines = new Map<number, number[]>();
const holdTimers = new Map<CharKey, number>();
const exitTimers = new Map<CharKey, number>();

let schedTimer: number | null = null;
let running = false;

function k(li: number, ci: number): CharKey { return `${li}-${ci}`; }
function pickShape(): ShapeKind { return SHAPES[Math.floor(Math.random() * SHAPES.length)]; }

function emit(key: CharKey, s: CharState) {
  states.set(key, s);
  listeners.get(key)?.(s);
}

function clearTimer(map: Map<CharKey, number>, key: CharKey) {
  const t = map.get(key);
  if (t != null) { window.clearTimeout(t); map.delete(key); }
}

function enter(li: number, ci: number) {
  const key = k(li, ci);
  // Always cancel any pending exit — stale staggered exits from a previous
  // diff must not fire over a char the cursor returned to.
  clearTimer(exitTimers, key);
  const cur = states.get(key);
  if (cur && (cur.phase === 'entering' || cur.phase === 'held')) return;
  clearTimer(holdTimers, key);
  emit(key, { phase: 'entering', startedAt: performance.now(), shape: pickShape() });
  const t = window.setTimeout(() => {
    holdTimers.delete(key);
    const c = states.get(key);
    if (c?.phase === 'entering') emit(key, { ...c, phase: 'held' });
  }, ENTER_MS);
  holdTimers.set(key, t);
}

function exit(li: number, ci: number) {
  const key = k(li, ci);
  const cur = states.get(key);
  if (!cur || cur.phase === 'idle' || cur.phase === 'exiting') return;
  // If still entering, let it finish entering before exiting (avoid a snap).
  const ageMs = performance.now() - cur.startedAt;
  const remaining = cur.phase === 'entering' ? Math.max(0, ENTER_MS - ageMs) : 0;

  const begin = () => {
    const c = states.get(key);
    if (!c || c.phase === 'idle' || c.phase === 'exiting') return;
    emit(key, { phase: 'exiting', startedAt: performance.now(), shape: c.shape });
    const t = window.setTimeout(() => {
      exitTimers.delete(key);
      const after = states.get(key);
      if (after?.phase === 'exiting') emit(key, { phase: 'idle', startedAt: 0, shape: after.shape });
    }, EXIT_MS);
    exitTimers.set(key, t);
  };

  if (remaining === 0) begin();
  else exitTimers.set(key, window.setTimeout(begin, remaining));
}

function autoTick() {
  if (!running) return;
  const entries = [...lines.entries()].filter(([, p]) => p.length > 0);
  if (entries.length > 0) {
    const [li, pos] = entries[Math.floor(Math.random() * entries.length)];
    const ci = pos[Math.floor(Math.random() * pos.length)];
    const cur = states.get(k(li, ci));
    if (!cur || cur.phase === 'idle') {
      enter(li, ci);
      window.setTimeout(() => exit(li, ci), ENTER_MS + AUTO_HOLD_MS);
    }
  }
  const delay = SCHEDULER_BASE_MS + (Math.random() - 0.5) * SCHEDULER_JITTER_MS;
  schedTimer = window.setTimeout(autoTick, delay);
}

export const letterSubBus = {
  registerLine(li: number, positions: number[]) { lines.set(li, positions); },
  unregisterLine(li: number) { lines.delete(li); },
  subscribe(li: number, ci: number, cb: Listener): () => void {
    const key = k(li, ci);
    listeners.set(key, cb);
    cb(states.get(key) ?? { phase: 'idle', startedAt: 0, shape: 'circle' });
    return () => { if (listeners.get(key) === cb) listeners.delete(key); };
  },
  requestEnter: enter,
  requestExit: exit,
  ensureRunning() {
    if (running) return;
    running = true;
    // Fire one shortly after activation so even fast scrollers see the swap.
    schedTimer = window.setTimeout(autoTick, 400);
  },
  stop() {
    running = false;
    if (schedTimer != null) { window.clearTimeout(schedTimer); schedTimer = null; }
  },
};
