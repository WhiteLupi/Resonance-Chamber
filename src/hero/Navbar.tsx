import { useEffect, useState } from 'react';

const INTRO_DELAY_MS = 3000;

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
        <span className="cockpit-navbar__sigil" aria-hidden="true">⌬</span>
        <span>SYS.K_WALTER</span>
      </div>
      <div className="cockpit-navbar__center">
        <a className="cockpit-navbar__link" href="#about">
          <span className="cockpit-navbar__glyph" aria-hidden="true">⏃</span>
          <span>ABOUT</span>
        </a>
        <a className="cockpit-navbar__link" href="#skills">
          <span className="cockpit-navbar__glyph" aria-hidden="true">⊛</span>
          <span>SKILLS</span>
        </a>
        <a className="cockpit-navbar__link" href="#contact">
          <span className="cockpit-navbar__glyph" aria-hidden="true">⟁</span>
          <span>CONTACT</span>
        </a>
      </div>
      <div className="cockpit-navbar__right" aria-hidden="true">
        <span className="cockpit-navbar__glyph">⬡</span>
        <span>2026.05</span>
      </div>
    </nav>
  );
}
