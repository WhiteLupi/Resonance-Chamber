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
            <p className="practice-aside__label">since 2022</p>
            <p className="practice-aside__copy">
              Four years of production web &mdash; two in GSAP motion, two in
              React and Next.
            </p>
            <p className="practice-aside__copy">
              Awwwards Developer Award, 2024. For the build.
            </p>
            <p className="practice-aside__copy">
              Now at Pirxey / Widelab: frontend, AI engineering, design systems
              in code.
            </p>
          </aside>
        </div>
        {/* The methodology stays unnamed until its repo is public — a name
            nobody can look up carries nothing. */}
        <ul className="practice-facets" aria-label="practice facets">
          <li>awwwards developer award &rsquo;24</li>
          <li>custom webgl engines</li>
          <li>react + typescript</li>
          <li>my own design-direction method</li>
        </ul>
      </div>
    </section>
  );
}
