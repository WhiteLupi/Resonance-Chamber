import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../motion';

const LINES: string[] = [
  'To create art is to speak another language.',
  "You can't move a heart if yours stands still.",
  'Feelings matter. To taste, to love, to dream is to feel.',
];

// Signs a letter can turn into; all of them exist in Syne Mono, so a swap
// never falls back to another font or changes the width.
const SIGNS = '&#§£*¶~¤¿%@¥';
const LETTER = /[A-Za-z]/;
// Letters within this radius of the pointer swap, closest first.
const RADIUS_PX = 72;
const STAGGER_MS = 22;
// The ambient swap: one letter at a time, now and then, even without a pointer.
const AMBIENT_EVERY_MS = 6500;
const AMBIENT_JITTER_MS = 3000;
const AMBIENT_HOLD_MS = 900;

const pickSign = () => SIGNS[Math.floor(Math.random() * SIGNS.length)];

function Line({ text }: { text: string }) {
  const words = text.split(' ');
  return words.map((word, w) => (
    <span key={w}>
      <span className="ls-word">
        {[...word].map((ch, i) =>
          LETTER.test(ch) ? (
            <span key={i} className="ls-ch">
              <span className="ls-ch__l">{ch}</span>
            </span>
          ) : (
            ch
          ),
        )}
      </span>
      {w < words.length - 1 && ' '}
    </span>
  ));
}

// Split per character for the swaps, which a screen reader would spell out;
// the same words reach it as plain prose from the .sr-only header (App).
export function Inscription() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const chars = [...root.querySelectorAll<HTMLElement>('.ls-ch')];
    const near = new Set<HTMLElement>();

    const swap = (el: HTMLElement, delayMs: number) => {
      el.style.setProperty('--d', `${delayMs}ms`);
      if (!el.classList.contains('is-sign')) el.dataset.sign = pickSign();
      el.classList.add('is-sign');
    };
    const restore = (el: HTMLElement, delayMs: number) => {
      el.style.setProperty('--d', `${delayMs}ms`);
      el.classList.remove('is-sign');
    };

    // Pointer pass: at most once per frame, and only while the manifesto is on
    // screen. Scroll moves letters under a still pointer, so it reruns too.
    let px = -1e4;
    let py = -1e4;
    let onScreen = false;
    let raf = 0;
    const frame = () => {
      raf = 0;
      if (!onScreen) return;
      const entering: { el: HTMLElement; d: number }[] = [];
      const leaving: { el: HTMLElement; d: number }[] = [];
      for (const el of chars) {
        const r = el.getBoundingClientRect();
        const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
        if (d <= RADIUS_PX) {
          if (!near.has(el)) entering.push({ el, d });
        } else if (near.has(el)) {
          leaving.push({ el, d });
        }
      }
      entering.sort((a, b) => a.d - b.d).forEach(({ el }, i) => {
        near.add(el);
        swap(el, i * STAGGER_MS);
      });
      leaving.sort((a, b) => a.d - b.d).forEach(({ el }, i) => {
        near.delete(el);
        restore(el, i * STAGGER_MS);
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onPointerMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      schedule();
    };
    const onPointerOut = (e: PointerEvent) => {
      if (e.relatedTarget !== null) return;
      px = -1e4;
      py = -1e4;
      schedule();
    };

    // Uninvited motion, so reduced motion skips it; pointer swaps stay.
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const ambient = () => {
      if (onScreen) {
        const el = chars[Math.floor(Math.random() * chars.length)];
        if (!el.classList.contains('is-sign')) {
          swap(el, 0);
          later(() => { if (!near.has(el)) restore(el, 0); }, AMBIENT_HOLD_MS);
        }
      }
      later(ambient, AMBIENT_EVERY_MS + (Math.random() - 0.5) * AMBIENT_JITTER_MS);
    };
    if (!prefersReducedMotion()) later(ambient, 400);

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      schedule();
    });
    io.observe(root);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('pointerout', onPointerOut);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', schedule);
      document.removeEventListener('pointerout', onPointerOut);
    };
  }, []);

  return (
    <div ref={ref} className="inscription" aria-hidden="true">
      {LINES.map((line, lineIdx) => (
        <p key={lineIdx} className="inscription__line" data-line={lineIdx}>
          <span className="inscription__copy">
            <Line text={line} />
            {lineIdx === LINES.length - 1 && (
              <span className="inscription__caret">{'▌'}</span>
            )}
          </span>
        </p>
      ))}
    </div>
  );
}
