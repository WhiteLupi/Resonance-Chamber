import { Inscription } from './Inscription';
import { useDwell } from './useDwell';
import { BgBreath } from './BgBreath';
import './about.css';

// The manifesto sits left; the right side stays open for the travelling seal.
export function About() {
  const phase = useDwell();

  return (
    <section className="about-section" id="about" aria-label="manifesto">
      <div className="about-stage">
        {/* The visual thesis is split per-character for animation; this h2
            keeps the heading outline whole. Desktop hides it visually (the
            left spine carries the name); mobile shows it as the section-top
            eyebrow, same voice as the other sections. */}
        <h2 className="section-eyebrow about-eyebrow">&mdash; THE LANGUAGE</h2>
        <BgBreath active={phase.v4} />
        <div className="practice-top">
          <Inscription phase={phase} />
        </div>
      </div>
    </section>
  );
}
