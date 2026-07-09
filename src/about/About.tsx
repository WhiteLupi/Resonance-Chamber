import { Inscription } from './Inscription';
import { useDwell } from './useDwell';
import { BgBreath } from './BgBreath';
import './about.css';

// Practice grid (spec 2026-06-10): inscription as left thesis, aside on the
// right, facets below. The middle of row 1 stays intentionally open for the
// travelling seal (journey keyframe x:47).
export function About() {
  const phase = useDwell();

  return (
    <section className="about-section" id="about" aria-label="about">
      <div className="about-stage">
        {/* The visual thesis is split per-character for animation; this h2
            keeps the heading outline whole. Desktop hides it visually (the
            left spine carries the name); mobile shows it as the section-top
            eyebrow, same voice as the other sections. */}
        <h2 className="section-eyebrow about-eyebrow">&mdash; THE SIGNAL</h2>
        <BgBreath active={phase.v4} />
        <div className="practice-top">
          <Inscription phase={phase} />
          {/* The concrete fact next to the manifesto — the AI stance already
              lives in the inscription's third voice; repeating it here wasted
              the column. */}
          <aside className="practice-aside">
            <p className="practice-aside__label">currently</p>
            <p className="practice-aside__copy">
              At Pirxey / Widelab I work across frontend, interface quality,
              product UI, and design systems.
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
