import { useEffect, useState } from 'react';

// Section marker — a faint living-light inscription running UP the left margin
// (vertical spine), not a HUD tape across the top. Tracks the section currently
// holding the viewport and swaps its title: the active label slides up into the
// clip box as you move through the chamber. Drives off scroll position against
// each section's offset (robust under the sticky/fixed layout).
//
// Treatment is "trace of light in living tissue", not carved stone: phosphor
// teal halo + a slow breath on the hairline, so it reads alive.
//
// Hidden pre-lock — appears only after the engine is activated, so the initial
// encounter shows nothing but the seal, the charge ring and the HOLD prompt.

const SECTIONS = [
  { id: 'hero', label: 'THE ENGINE' },
  { id: 'about', label: 'THE SIGNAL' },
  { id: 'skills', label: 'THE CRAFT' },
  { id: 'contact', label: 'THE CHANNEL' },
];

type Props = { locked: boolean };

export function SectionHeader({ locked }: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    // Same discipline as App's scroll pass: sections mount once, so the element
    // list is cached (refreshed on resize) and layout is read at most once per
    // rAF — Lenis fires scroll densely and this must not contend with the GL
    // frame budget.
    let els: (HTMLElement | null)[] = [];
    const refreshEls = () => {
      els = SECTIONS.map((s) => document.getElementById(s.id));
    };

    let raf = 0;
    const frame = () => {
      raf = 0;
      // Mark a touch above viewport centre: a section claims the spine once its
      // top has risen past ~42% of the screen.
      const mark = window.innerHeight * 0.42;
      let idx = 0;
      for (let i = 0; i < els.length; i++) {
        if (els[i] && els[i]!.getBoundingClientRect().top <= mark) idx = i;
      }
      setActive((prev) => (prev === idx ? prev : idx));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      refreshEls();
      schedule();
    };

    refreshEls();
    frame();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className={`section-header${locked ? ' section-header--in' : ''}`} aria-hidden="true">
      <div className="section-header__inner">
        <div key={active} className="section-header__slot">
          {SECTIONS[active].label}
        </div>
      </div>
    </div>
  );
}
