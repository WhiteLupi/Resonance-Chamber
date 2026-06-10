import { useRef } from 'react';
import { Inscription } from './Inscription';
import { useDwell } from './useDwell';
import { BgBreath } from './BgBreath';
import './about.css';

// Practice grid (spec 2026-06-10): inscription as left thesis, aside on the
// right, facets below. The middle of row 1 stays intentionally open for the
// travelling seal (journey keyframe x:47).
export function About() {
  const inscriptionRef = useRef<HTMLDivElement>(null);
  const phase = useDwell();

  return (
    <section className="about-section" id="about" aria-label="about">
      <div className="about-stage">
        <BgBreath active={phase.v4} />
        <div className="practice-top">
          <Inscription ref={inscriptionRef} phase={phase} />
          <aside className="practice-aside">
            <p className="practice-aside__label">building with ai</p>
            <p className="practice-aside__copy">
              A tool for exploring, structuring, and shipping. Judgement,
              taste, and direction stay human.
            </p>
          </aside>
        </div>
        <ul className="practice-facets" aria-label="practice facets">
          <li>motion as meaning</li>
          <li>frontend as medium</li>
          <li>systems with taste</li>
          <li>tools that stay human</li>
        </ul>
      </div>
    </section>
  );
}
