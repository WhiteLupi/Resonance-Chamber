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
    name: 'INTERFACE',
    desc: 'React and TypeScript product apps: typed forms and validation, client and server state, components documented so the next person can use them. Webflow from Figma, with custom code shipped as a typed, versioned package.',
    tags: 'react · typescript · webflow · rtk query · zod · storybook',
  },
  {
    name: 'MOTION',
    desc: 'I write the engine, not the tween. Particle systems, custom geometry, and scroll choreography — and the render loop they have to share with the app.',
    tags: "awwwards developer award '24 · webgl · three.js · gsap",
  },
  {
    name: 'REPAIR',
    desc: 'I find what feels wrong before anyone can name it, then fix the structure underneath instead of the symptom. Frame budgets, GPU tiers, layout read once a frame — the work that decides whether it holds on a cheap phone.',
    tags: 'perf budgets · gpu tiers · frame time',
  },
  {
    name: 'INTERACTION',
    desc: 'The micro-signals: easing, state, feedback. What tells you the machine heard you.',
    tags: 'gesture · easing · state · polish',
  },
  {
    name: 'DIRECTION',
    desc: 'I run AI agents against a method I wrote myself, and I built the review they answer to. Deterministic code does the mechanics; models get language and judgement. What ships is my call.',
    tags: 'claude code · codex · mcp · agent skills · judgement',
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
