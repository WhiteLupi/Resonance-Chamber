import { useEffect, useRef, useState } from 'react';

type Variant = 'default' | 'link' | 'scroll';
type ShapeKind = 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon' | 'octagon' | 'crosshair';

type Shape = {
  kind: ShapeKind;
  filled: boolean;
};

const SHAPES: Shape[] = [
  { kind: 'circle',    filled: false },
  { kind: 'triangle',  filled: false },
  { kind: 'square',    filled: false },
  { kind: 'diamond',   filled: true  },
  { kind: 'hexagon',   filled: false },
  { kind: 'circle',    filled: true  },
  { kind: 'crosshair', filled: false },
  { kind: 'octagon',   filled: false },
];

function ShapeSvg({ shape }: { shape: Shape }) {
  const stroke = 'currentColor';
  const fill = shape.filled ? 'currentColor' : 'none';
  const strokeWidth = shape.filled ? 0 : 1.4;
  const common = { stroke, fill, strokeWidth, strokeLinejoin: 'round' as const };

  switch (shape.kind) {
    case 'circle':
      return <circle cx="15" cy="15" r="13" {...common} />;
    case 'triangle':
      return <polygon points="15,3 27,25 3,25" {...common} />;
    case 'square':
      return <rect x="3" y="3" width="24" height="24" {...common} />;
    case 'diamond':
      return <polygon points="15,2 28,15 15,28 2,15" {...common} />;
    case 'hexagon':
      return <polygon points="15,3 26,9 26,21 15,27 4,21 4,9" {...common} />;
    case 'octagon':
      return <polygon points="11,3 19,3 27,11 27,19 19,27 11,27 3,19 3,11" {...common} />;
    case 'crosshair':
      return (
        <g stroke={stroke} strokeWidth={1.4} fill="none" strokeLinecap="round">
          <circle cx="15" cy="15" r="11" />
          <line x1="15" y1="2"  x2="15" y2="7"  />
          <line x1="15" y1="23" x2="15" y2="28" />
          <line x1="2"  y1="15" x2="7"  y2="15" />
          <line x1="23" y1="15" x2="28" y2="15" />
        </g>
      );
  }
}

export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  const [variant, setVariant] = useState<Variant>('default');
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
      if (target.closest('.cockpit-scroll')) {
        setVariant('scroll');
        return;
      }
      if (target.closest('a, button, [role="button"]')) {
        setVariant('link');
        return;
      }
      setVariant('default');
    };

    const onLeave = () => setVariant('default');

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
    const id = window.setInterval(() => {
      setShapeIdx(i => {
        let next = i;
        while (next === i) next = Math.floor(Math.random() * SHAPES.length);
        return next;
      });
    }, 4200);
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
        <ShapeSvg shape={SHAPES[shapeIdx]} />
      </svg>
      <span className="cockpit-cursor__hint" aria-hidden="true">↓</span>
    </div>
  );
}
