import { useEffect, useRef, useState } from 'react';
import { ShapeSvg } from '../ShapeSvg';
import { SHAPES } from '../glyphs';
import './cursor.css';

type Variant = 'default' | 'link' | 'hold' | 'charging' | 'wave';

const SHAPE_INTERVAL_MS = 7000;

// Touch devices hide the cursor in CSS (hover:none / pointer:coarse) — match
// that here and skip the whole tracker: no rAF loop, listeners, or interval
// for an element that never shows. Evaluated once; a session doesn't change
// its primary pointer.
const TOUCH_ONLY =
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: none), (pointer: coarse)').matches;

export function Cursor({ locked, overCore }: { locked: boolean; overCore: boolean }) {
  if (TOUCH_ONLY) return null;
  return <PointerCursor locked={locked} overCore={overCore} />;
}

function PointerCursor({ locked, overCore }: { locked: boolean; overCore: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverVariant, setHoverVariant] = useState<'default' | 'link'>('default');
  const [held, setHeld] = useState(false);
  const [shapeIdx, setShapeIdx] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // The ring sits ON the pointer: it is a targeting reticle, and easing it
    // reads as a laggy mouse.
    const place = (x: number, y: number) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };
    const onMove = (e: MouseEvent) => place(e.clientX, e.clientY);
    place(window.innerWidth / 2, window.innerHeight / 2);

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('a, button, [role="button"]')) {
        setHoverVariant('link');
        return;
      }
      setHoverVariant('default');
    };

    const onLeave = () => setHoverVariant('default');

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseover', onOver);
    document.addEventListener('mouseleave', onLeave);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // The seal core is the sole hold target. Pre-lock, over the ball the cursor
  // becomes a "hold" ring, contracting to "charging" while pressed; off the
  // ball it stays default so a corner press reads as inert. Post-lock, over the
  // ball it shows a "wave" ripple (a click broadcasts a sonar wave). Press is
  // tracked window-wide but only surfaces as "charging" when actually on-ball.
  useEffect(() => {
    const down = () => setHeld(true);
    const up = () => setHeld(false);
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', up);
    };
  }, []);

  const variant: Variant = !locked
    ? overCore
      ? held
        ? 'charging'
        : 'hold'
      : 'default'
    : hoverVariant === 'link'
      ? 'link'
      : overCore
        ? 'wave'
        : 'default';

  useEffect(() => {
    const id = window.setInterval(() => {
      setShapeIdx(i => {
        let next = i;
        while (next === i) next = Math.floor(Math.random() * SHAPES.length);
        return next;
      });
    }, SHAPE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div ref={ref} className={`cursor cursor--${variant}`}>
      <svg
        key={shapeIdx}
        className="cursor__shape"
        viewBox="0 0 30 30"
        aria-hidden="true"
      >
        <ShapeSvg kind={SHAPES[shapeIdx]} />
      </svg>
      <span className="cursor__hold" aria-hidden="true">hold</span>
      <span className="cursor__ripple" aria-hidden="true" />
    </div>
  );
}
