import { useEffect, useState } from 'react';

export function Navbar() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dir = y > lastY ? 'down' : 'up';
        const delta = Math.abs(y - lastY);
        if (delta > 4) {
          if (y > 80 && dir === 'down') setHidden(true);
          else if (dir === 'up') setHidden(false);
          lastY = y;
        }
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`cockpit-navbar${hidden ? ' cockpit-navbar--hidden' : ''}`}
      aria-label="primary"
    >
      <div className="cockpit-navbar__left">
        <span className="cockpit-navbar__dot" aria-hidden="true" />
        <span>SYS.K_WALTER</span>
      </div>
      <div className="cockpit-navbar__center">
        <a className="cockpit-navbar__link" href="#about">ABOUT</a>
        <span className="cockpit-navbar__sep" aria-hidden="true">·</span>
        <a className="cockpit-navbar__link" href="#skills">SKILLS</a>
        <span className="cockpit-navbar__sep" aria-hidden="true">·</span>
        <a className="cockpit-navbar__link" href="#contact">CONTACT</a>
      </div>
      <div className="cockpit-navbar__right" aria-hidden="true">
        <span className="cockpit-navbar__bracket">⌗</span>
        <span>2026.05</span>
      </div>
    </nav>
  );
}
