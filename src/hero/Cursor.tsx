import { useEffect, useRef, useState } from 'react';
import { ShapeSvg } from '../ShapeSvg';
import { SHAPES } from '../glyphs';

type Variant = 'default' | 'link' | 'scroll' | 'hold' | 'charging' | 'wave';

const SHAPE_INTERVAL_MS = 7000;

// Cursor enters the scroll-indicator state while the user is actively
// scrolling down. After the scroll burst stops we hold the state briefly so
// the indicator still confirms "going down" for a beat, then return to
// default. Scroll-up cancels the state immediately. Link hover always wins.
const SCROLL_HOLD_MS = 380;

export function Cursor({ locked, overCore }: { locked: boolean; overCore: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverVariant, setHoverVariant] = useState<'default' | 'link'>('default');
  const [scrolling, setScrolling] = useState(false);
  const [held, setHeld] = useState(false);
  const [shapeIdx, setShapeIdx] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    const ease = 0.22;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };

    let raf = 0;
    const tick = () => {
      cx += (tx - cx) * ease;
      cy += (ty - cy) * ease;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

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
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;
    let holdTimer: number | null = null;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      if (delta > 0) {
        setScrolling(true);
        if (holdTimer != null) window.clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          setScrolling(false);
          holdTimer = null;
        }, SCROLL_HOLD_MS);
      } else if (delta < 0) {
        setScrolling(false);
        if (holdTimer != null) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (holdTimer != null) window.clearTimeout(holdTimer);
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
        : scrolling
          ? 'scroll'
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
    <div ref={ref} className={`cockpit-cursor cockpit-cursor--${variant}`}>
      <svg
        key={shapeIdx}
        className="cockpit-cursor__shape"
        viewBox="0 0 30 30"
        aria-hidden="true"
      >
        <ShapeSvg kind={SHAPES[shapeIdx]} />
      </svg>
      <span className="cockpit-cursor__hint" aria-hidden="true">
        <span className="cockpit-cursor__hint-text">going down</span>
        <span className="cockpit-cursor__hint-arrow">↓</span>
      </span>
      <span className="cockpit-cursor__hold" aria-hidden="true">hold</span>
      <span className="cockpit-cursor__ripple" aria-hidden="true" />
    </div>
  );
}
