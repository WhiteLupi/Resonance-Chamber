import { useEffect, useRef, useState } from 'react';

type Variant = 'default' | 'link' | 'scroll' | 'hold' | 'charging';
export type ShapeKind = 'circle' | 'triangle' | 'square' | 'circle-half' | 'triangle-half';

const SHAPES: ShapeKind[] = [
  'circle',
  'triangle',
  'square',
  'circle-half',
  'triangle-half',
];

const SHAPE_INTERVAL_MS = 7000;

export function ShapeSvg({ kind }: { kind: ShapeKind }) {
  const stroke = 'currentColor';
  const sw = 1.4;

  switch (kind) {
    case 'circle':
      return (
        <>
          <circle cx="15" cy="15" r="13" stroke={stroke} strokeWidth={sw} fill="none" />
          <circle cx="15" cy="15" r="1.7" fill={stroke} />
        </>
      );
    case 'triangle':
      return (
        <>
          <polygon
            points="15,3 27,25 3,25"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="19" r="1.7" fill={stroke} />
        </>
      );
    case 'square':
      return (
        <>
          <rect
            x="3"
            y="3"
            width="24"
            height="24"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="15" r="1.7" fill={stroke} />
        </>
      );
    case 'circle-half':
      return (
        <>
          <path d="M15,2 A13,13 0 0,1 15,28 Z" fill={stroke} />
          <circle cx="15" cy="15" r="13" stroke={stroke} strokeWidth={sw} fill="none" />
        </>
      );
    case 'triangle-half':
      return (
        <>
          <polygon points="15,3 27,25 15,25" fill={stroke} />
          <polygon
            points="15,3 27,25 3,25"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
        </>
      );
  }
}

// Cursor enters the scroll-indicator state while the user is actively
// scrolling down. After the scroll burst stops we hold the state briefly so
// the indicator still confirms "going down" for a beat, then return to
// default. Scroll-up cancels the state immediately. Link hover always wins.
const SCROLL_HOLD_MS = 380;

export function Cursor({ locked }: { locked: boolean }) {
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

  // Pre-lock the whole hero IS the hold target (glScene charges on mousedown
  // anywhere), and there is nothing else on screen to hover — so the cursor
  // becomes the affordance: a "hold" ring, contracting to a "charging" state
  // while pressed. Post-lock: link hover wins, then the scroll indicator.
  useEffect(() => {
    if (locked) {
      setHeld(false);
      return;
    }
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
  }, [locked]);

  const variant: Variant = !locked
    ? (held ? 'charging' : 'hold')
    : hoverVariant === 'link'
      ? 'link'
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
    </div>
  );
}
