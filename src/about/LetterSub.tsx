import { useEffect, useMemo, useRef, useState } from 'react';
import { ShapeSvg } from '../ShapeSvg';
import { prefersReducedMotion } from '../motion';
import type { ShapeKind } from '../glyphs';
import {
  letterSubBus,
  ENTER_MS,
  EXIT_MS,
  type CharState,
} from './letterSubBus';

const ELIGIBLE = /[A-Za-z]/;

// Hover-in-radius: any eligible char inside this radius (px) of the pointer
// gets a swap. Cascade stagger orders by distance — closest first, very fast.
// Window-level listener: the radius affects text even when the pointer isn't
// directly over it.
const HOVER_RADIUS_PX = 72;
const CASCADE_STAGGER_MS = 22;

const TEAL = 'rgb(61, 110, 99)';

type Visual =
  | { showSwap: false }
  | {
      showSwap: true;
      letterY: number;
      letterOpacity: number;
      glyphY: number;
      glyphOpacity: number;
    };

// Gravity-only swap: in both directions, the outgoing element falls down and
// the incoming element drops in from above. ease-out cubic for the slide.
function visual(state: CharState, now: number): Visual {
  if (state.phase === 'idle') return { showSwap: false };
  if (state.phase === 'held') {
    return { showSwap: true, letterY: 1, letterOpacity: 0, glyphY: 0, glyphOpacity: 1 };
  }
  const ageMs = now - state.startedAt;
  if (state.phase === 'entering') {
    const u = Math.min(1, ageMs / ENTER_MS);
    const e = 1 - Math.pow(1 - u, 3);
    return {
      showSwap: true,
      letterY: e,                  // 0 → 1em (down + out)
      letterOpacity: 1 - e,
      glyphY: -1 + e,              // -1em → 0 (drops in from top)
      glyphOpacity: e,
    };
  }
  // exiting — glyph falls down, letter drops in from top
  const u = Math.min(1, ageMs / EXIT_MS);
  const e = 1 - Math.pow(1 - u, 3);
  return {
    showSwap: true,
    glyphY: e,                     // 0 → 1em (down + out)
    glyphOpacity: 1 - e,
    letterY: -1 + e,               // -1em → 0 (drops in from top)
    letterOpacity: e,
  };
}

function CharSpan({ ch, lineIdx, charIdx }: { ch: string; lineIdx: number; charIdx: number }) {
  const [state, setState] = useState<CharState>(() => ({ phase: 'idle', startedAt: 0, shape: 'circle' }));
  const [now, setNow] = useState(0);

  useEffect(() => letterSubBus.subscribe(lineIdx, charIdx, setState), [lineIdx, charIdx]);

  // Run RAF only during the transient phases — held & idle are static.
  useEffect(() => {
    if (state.phase !== 'entering' && state.phase !== 'exiting') return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.phase]);

  const v = visual(state, Math.max(now, state.startedAt));

  if (!v.showSwap) {
    return (
      <span className="ls-ch" data-idx={charIdx}>
        {ch}
      </span>
    );
  }

  return (
    <span className="ls-ch ls-ch--swap" data-idx={charIdx}>
      <span
        className="ls-ch__letter"
        style={{ transform: `translateY(${v.letterY}em)`, opacity: v.letterOpacity }}
      >
        {ch}
      </span>
      <span
        className="ls-ch__glyph"
        style={{
          transform: `translateY(${v.glyphY}em)`,
          opacity: v.glyphOpacity,
          color: TEAL,
        }}
      >
        <svg className="ls-svg" viewBox="0 0 30 30" aria-hidden="true">
          <ShapeSvg kind={state.shape as ShapeKind} />
        </svg>
      </span>
    </span>
  );
}

export function LetterSub({ text, lineIdx }: { text: string; lineIdx: number }) {
  const eligible = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < text.length; i++) if (ELIGIBLE.test(text[i])) arr.push(i);
    return arr;
  }, [text]);

  useEffect(() => {
    letterSubBus.registerLine(lineIdx, eligible);
    return () => letterSubBus.unregisterLine(lineIdx);
  }, [lineIdx, eligible]);

  type Part = { type: 'space' | 'word'; text: string; start: number };
  const parts = useMemo<Part[]>(() => {
    const out: Part[] = [];
    let i = 0;
    while (i < text.length) {
      let j = i;
      const isSpace = /\s/.test(text[i]);
      while (j < text.length && /\s/.test(text[j]) === isSpace) j++;
      out.push({ type: isSpace ? 'space' : 'word', text: text.slice(i, j), start: i });
      i = j;
    }
    return out;
  }, [text]);

  // Pointer tracking is RAF-driven: every frame we re-read each char's rect
  // and the latest pointer position, then reconcile state. Bulletproof against
  // (a) flicks where pointermove stops firing between throttle windows, and
  // (b) scroll moving chars under a stationary cursor. Per-char cascade timers
  // are cancellable, so a stale "enter" is wiped if the cursor leaves before
  // its stagger fires.
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let px = -9999;
    let py = -9999;
    const inRadius = new Set<number>();
    const pendingTimers = new Map<number, number>();
    let raf = 0;

    const onPointerMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
    };
    const onPointerOut = (e: PointerEvent) => {
      if (e.relatedTarget !== null) return;
      px = -9999;
      py = -9999;
    };

    const schedule = (charIdx: number, action: 'enter' | 'exit', delay: number) => {
      const prev = pendingTimers.get(charIdx);
      if (prev != null) window.clearTimeout(prev);
      const fire = () => {
        pendingTimers.delete(charIdx);
        if (action === 'enter') letterSubBus.requestEnter(lineIdx, charIdx);
        else letterSubBus.requestExit(lineIdx, charIdx);
      };
      if (delay === 0) fire();
      else pendingTimers.set(charIdx, window.setTimeout(fire, delay));
    };

    // The reconcile loop reads every char's rect each frame — that's the
    // price of being bulletproof against scroll-under-cursor, so it runs only
    // while the inscription is on screen.
    let onScreen = false;

    const tick = () => {
      if (!onScreen) {
        raf = 0;
        return;
      }
      const container = containerRef.current;
      if (container) {
        const r2 = HOVER_RADIUS_PX * HOVER_RADIUS_PX;
        const chars = container.querySelectorAll<HTMLElement>('.ls-ch[data-idx]');

        const enters: { idx: number; d2: number }[] = [];
        const exits: { idx: number; d2: number }[] = [];
        const next = new Set<number>();

        chars.forEach(el => {
          const raw = el.dataset.idx;
          if (raw === undefined) return;
          const idx = Number.parseInt(raw, 10);
          if (Number.isNaN(idx) || !ELIGIBLE.test(text[idx])) return;
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = px - cx;
          const dy = py - cy;
          const d2 = dx * dx + dy * dy;
          const inside = d2 <= r2;
          const was = inRadius.has(idx);
          if (inside) {
            next.add(idx);
            if (!was) enters.push({ idx, d2 });
          } else if (was) {
            exits.push({ idx, d2 });
          }
        });

        inRadius.clear();
        next.forEach(v => inRadius.add(v));

        enters.sort((a, b) => a.d2 - b.d2);
        enters.forEach((it, i) => schedule(it.idx, 'enter', i * CASCADE_STAGGER_MS));
        exits.sort((a, b) => a.d2 - b.d2);
        exits.forEach((it, i) => schedule(it.idx, 'exit', i * CASCADE_STAGGER_MS));
      }
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (!onScreen) return;
      if (!raf) raf = requestAnimationFrame(tick);
      // The ambient swaps are uninvited motion, so reduced motion skips them;
      // pointer-driven swaps stay, they move only when the visitor moves.
      if (!prefersReducedMotion()) letterSubBus.ensureRunning();
      // leaving the viewport lets the running tick see the flag and stop
    });
    if (containerRef.current) io.observe(containerRef.current);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      pendingTimers.forEach(t => window.clearTimeout(t));
    };
  }, [lineIdx, text]);

  return (
    <span ref={containerRef} className="letter-sub">
      {parts.map((part, partIdx) =>
        part.type === 'space' ? (
          <span key={partIdx}>{part.text}</span>
        ) : (
          <span key={partIdx} className="ls-word">
            {part.text.split('').map((ch, j) => (
              <CharSpan key={j} ch={ch} lineIdx={lineIdx} charIdx={part.start + j} />
            ))}
          </span>
        ),
      )}
    </span>
  );
}
