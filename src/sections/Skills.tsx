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
    desc: 'Animation used as meaning: pacing, tension, feedback, and release.',
    tags: 'webgl · glsl · scroll choreography',
  },
  {
    name: 'INTERFACE',
    desc: 'React systems that stay clear under real product constraints.',
    tags: 'react · typescript · design systems',
  },
  {
    name: 'INTERACTION',
    desc: 'Micro-signals that reduce friction and make intent legible.',
    tags: 'gesture · easing · states · polish',
  },
  {
    name: 'REPAIR',
    desc: 'Finding what feels off, then tightening flow, structure, and experience.',
    tags: 'debugging · refinement · UX friction',
  },
  {
    name: 'DIRECTION',
    desc: 'Using AI agents without giving away authorship, taste, or the final call.',
    tags: 'ai workflows · judgement · systems thinking',
  },
];

export function Skills() {
  const { ref, inView } = useInView<HTMLUListElement>();

  return (
    <section className="section craft-section" id="skills" aria-label="craft">
      <p className="section-eyebrow craft-eyebrow">— THE CRAFT</p>
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
