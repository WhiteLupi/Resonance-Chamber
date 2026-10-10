import { Inscription } from './Inscription';
import './about.css';

// The manifesto sits left; the right side stays open for the travelling seal.
export function About() {
  return (
    <section className="about-section" id="about" aria-label="manifesto">
      <div className="about-stage">
        {/* Desktop hides it visually (the left spine carries the name); mobile
            shows it as the section-top eyebrow, same voice as the other
            sections. */}
        <h2 className="section-eyebrow about-eyebrow">&mdash; THE LANGUAGE</h2>
        <Inscription />
      </div>
    </section>
  );
}
