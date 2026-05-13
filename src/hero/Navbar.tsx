import { useEffect, useState } from 'react';
import { ShapeSvg, type ShapeKind } from './Cursor';

const INTRO_DELAY_MS = 3000;

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

export function Navbar() {
  const [introDone, setIntroDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setIntroDone(true), INTRO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (Math.abs(delta) > 4) {
          if (y > 80 && delta > 0) setHidden(true);
          else if (delta < 0) setHidden(false);
          lastY = y;
        } else if (y <= 0) {
          setHidden(false);
          lastY = y;
        }
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const cls = [
    'cockpit-navbar',
    introDone ? 'cockpit-navbar--in' : '',
    hidden ? 'cockpit-navbar--hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <nav className={cls} aria-label="primary">
      <div className="cockpit-navbar__left">
        <Glyph kind="circle-half" />
        <span>SYS.K_WALTER</span>
      </div>
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
