import { useEffect, useRef, useState } from 'react';
import { ShapeSvg, type ShapeKind } from './Cursor';

// Delay between lock and navbar reveal — gives the chamber a beat to
// settle into its locked state before HUD elements arrive.
const POST_LOCK_DELAY_MS = 600;
// How close to the viewport top the pointer must be to force-reveal the navbar
// from anywhere on the page.
const REVEAL_TOP_PX = 100;
// Below this scrollY the navbar always shows; above it, direction wins.
const SCROLL_HIDE_THRESHOLD = 80;

function Glyph({ kind }: { kind: ShapeKind }) {
  return (
    <svg
      className="cockpit-navbar__glyph"
      viewBox="0 0 30 30"
      aria-hidden="true"
    >
      <ShapeSvg kind={kind} />
    </svg>
  );
}

type NavbarProps = { locked: boolean };

export function Navbar({ locked }: NavbarProps) {
  const [introDone, setIntroDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Reveal navbar only after the engine is locked — no HUD pre-lock.
  useEffect(() => {
    if (!locked) return;
    const id = window.setTimeout(() => setIntroDone(true), POST_LOCK_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [locked]);

  // Smart visibility: scroll-down hides, scroll-up shows. Mouse near the
  // viewport top is an override that always reveals — regardless of section
  // or scroll direction — so the nav is always reachable.
  const scrolledHiddenRef = useRef(false);
  const mouseNearTopRef = useRef(false);

  useEffect(() => {
    const update = () => {
      setHidden(scrolledHiddenRef.current && !mouseNearTopRef.current);
    };

    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 0) {
        scrolledHiddenRef.current = false;
      } else if (y > SCROLL_HIDE_THRESHOLD && y > lastY) {
        scrolledHiddenRef.current = true;
      } else if (y < lastY) {
        scrolledHiddenRef.current = false;
      }
      lastY = y;
      update();
    };

    const onMouseMove = (e: MouseEvent) => {
      const near = e.clientY < REVEAL_TOP_PX;
      if (near !== mouseNearTopRef.current) {
        mouseNearTopRef.current = near;
        update();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  const cls = [
    'cockpit-navbar',
    introDone ? 'cockpit-navbar--in' : '',
    hidden ? 'cockpit-navbar--hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <nav className={cls} aria-label="primary">
      <div className="cockpit-navbar__center">
        <a className="cockpit-navbar__link" href="#about">
          <Glyph kind="circle" />
          <span>ABOUT</span>
        </a>
        <a className="cockpit-navbar__link" href="#skills">
          <Glyph kind="triangle" />
          <span>SKILLS</span>
        </a>
        <a className="cockpit-navbar__link" href="#contact">
          <Glyph kind="square" />
          <span>CONTACT</span>
        </a>
      </div>
      <div className="cockpit-navbar__right" aria-hidden="true">
        <Glyph kind="triangle-half" />
        <span>2026.05</span>
      </div>
    </nav>
  );
}
