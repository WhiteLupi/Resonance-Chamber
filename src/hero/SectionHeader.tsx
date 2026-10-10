import { useEffect, useState } from 'react';

// Section marker — a faint living-light inscription running UP the left margin
// (vertical spine), not a HUD tape across the top. Tracks the section currently
// holding the viewport and swaps its title: the active label slides up into the
// clip box as you move through the page.
//
// Treatment is "trace of light in living tissue", not carved stone: phosphor
// teal halo + a slow breath on the hairline, so it reads alive.
//
// Hidden pre-lock — appears only after the engine is activated, so the initial
// encounter shows nothing but the seal, the charge ring and the HOLD prompt.

const SECTIONS = [
  { id: 'hero', label: 'THE PULSE' },
  { id: 'about', label: 'THE LANGUAGE' },
  { id: 'values', label: 'WHAT I KEEP' },
  { id: 'contact', label: 'THE TRUTH' },
];

type Props = { locked: boolean };

export function SectionHeader({ locked }: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    // A section claims the spine once its top rises past ~42% of the screen:
    // the observer watches a one-pixel line there, so scrolling costs no
    // layout reads.
    const els = SECTIONS.map((sec) => document.getElementById(sec.id));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const idx = els.indexOf(e.target as HTMLElement);
          if (idx >= 0) setActive(idx);
        }
      },
      { rootMargin: '-42% 0px -58% 0px' },
    );
    for (const el of els) if (el) io.observe(el);
    return () => io.disconnect();
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
