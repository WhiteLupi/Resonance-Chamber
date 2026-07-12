import type { CSSProperties } from 'react';
import { useInView } from './useInView';
import './sections.css';

// "THE CRAFT" — register (spec 2026-06-10): each band is a full-viewport row
// with hairline borders, tags as dim metadata on the right. Empty space between
// description and tags belongs to the travelling seal (journey keyframe x:60).
type Band = {
  name: string;
  desc: string;
  tags: string;
};

const BANDS: Band[] = [
  {
    name: 'MOTION',
    desc: 'I write the engine, not the tween. Shaders, particle systems, and scroll choreography, timed so the page has a pulse.',
    tags: "awwwards developer award '24 · webgl · glsl · gsap",
  },
  {
    name: 'INTERFACE',
    desc: 'React and TypeScript systems that survive real product pressure. Design systems in code: tokens, component APIs, and the discipline that keeps them from rotting.',
    tags: 'react · typescript · next · design systems',
  },
  {
    name: 'INTERACTION',
    desc: 'The micro-signals: easing, state, feedback. What tells you the machine heard you.',
    tags: 'gesture · easing · state · polish',
  },
  {
    name: 'REPAIR',
    desc: 'I find what feels wrong before anyone can name it, then fix the structure underneath instead of the symptom. Frame budgets, GPU tiers — the things that decide whether it feels alive on a cheap phone.',
    tags: 'perf budgets · gpu tiers · frame time',
  },
  {
    name: 'DIRECTION',
    desc: 'I run AI agents with persistent memory and review every diff. The design-direction methodology I use is one I wrote myself.',
    tags: 'design direction · agent skills · judgement',
  },
];

export function Skills() {
  const { ref, inView } = useInView<HTMLUListElement>();

  return (
    <section className="section craft-section" id="skills" aria-label="craft">
      <h2 className="section-eyebrow craft-eyebrow">— THE CRAFT</h2>
      <ul
        ref={ref}
        className={`craft-register${inView ? ' is-in' : ''}`}
      >
        {BANDS.map((b, i) => (
          <li className="craft-band" key={b.name} style={{ '--i': i } as CSSProperties}>
            <h3 className="craft-band__name">{b.name}</h3>
            <p className="craft-band__desc">{b.desc}</p>
            <p className="craft-band__tags">{b.tags}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
