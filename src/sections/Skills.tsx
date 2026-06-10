import type { CSSProperties } from 'react';
import { useInView } from './useInView';
import './sections.css';

// "THE CRAFT" — the engine tunes one instrument across five bands. Each row is
// a frequency the listener resolves; the little spectrum on the right is that
// band reading live, surging when you lean in (hover). Content is mock-but-true
// to the voice ("I hear motion / browser animation / React / taste is mine").
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

// Deterministic-ish bar heights per band so each spectrum reads distinct but
// stable across renders (no Math.random — keeps SSR/HMR calm and avoids jitter).
const BARS = 18;
function barSeed(band: number, i: number) {
  const a = Math.sin((band + 1) * 12.9898 + i * 78.233) * 43758.5453;
  return a - Math.floor(a); // 0..1
}

export function Skills() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section craft-section" id="skills" aria-label="craft">
      <div
        ref={ref}
        className={`section-inner craft-inner${inView ? ' is-in' : ''}`}
      >
        <p className="section-eyebrow">— THE CRAFT</p>
        <h2 className="section-heading">
          Frontend as medium,
          <br />
          tuned across five bands.
        </h2>

        <ul className="craft-list">
          {BANDS.map((b, i) => (
            <li className="craft-row" key={b.name} style={{ '--i': i } as CSSProperties}>
              <span className="craft-row__idx">{String(i + 1).padStart(2, '0')}</span>
              <div className="craft-row__body">
                <h3 className="craft-row__name">{b.name}</h3>
                <p className="craft-row__desc">{b.desc}</p>
                <p className="craft-row__tags">{b.tags}</p>
              </div>
              <div className="craft-eq" aria-hidden="true">
                {Array.from({ length: BARS }).map((_, k) => {
                  const h = 0.22 + barSeed(i, k) * 0.78;
                  const dur = 1.1 + barSeed(i, k + 7) * 1.6;
                  const delay = -barSeed(i, k + 3) * 2.4;
                  return (
                    <span
                      key={k}
                      className="craft-eq__bar"
                      style={
                        {
                          '--h': h.toFixed(3),
                          animationDuration: `${dur.toFixed(2)}s`,
                          animationDelay: `${delay.toFixed(2)}s`,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
