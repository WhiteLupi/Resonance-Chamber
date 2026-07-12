import { Inscription } from './Inscription';
import { useDwell } from './useDwell';
import { BgBreath } from './BgBreath';
import './about.css';

// Practice grid: inscription as left thesis, aside on the right. The middle of
// row 1 stays intentionally open for the travelling seal (journey keyframe
// x:47).
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
          {/* The only place on the page that says I am employed, where, and for
              how long. Everything else here is stance; this is the record. */}
          <aside className="practice-aside">
            <p className="practice-aside__label">since 2022</p>
            <p className="practice-aside__copy">
              Four years of production web, all of it at Pirxey / Widelab.
            </p>
            <p className="practice-aside__copy">
              Web developer first &mdash; motion-led sites in GSAP.
            </p>
            <p className="practice-aside__copy">
              React developer since 2024 &mdash; product apps and design systems
              in code.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
