import './cockpit.css';

type HeroProps = {
  locked: boolean;
};

// Vertical inscription column. The seal renders behind (canvas, fixed inset 0),
// the text frames it vertically: invitation above, named outcome below,
// signature at the base. The seal is the central glyph of a carved sentence
// — not an object decorated with corner labels.
export function Hero({ locked }: HeroProps) {
  return (
    <section className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <div className="hero-inscription">
        <div className="hero-inscription__top" aria-hidden={!locked}>
          LET&rsquo;S · HEAR
        </div>
        <div className="hero-inscription__bottom" aria-hidden={!locked}>
          MOTION
        </div>
      </div>
      <div className="hero-signature" aria-hidden={!locked}>— K · WALTER</div>
    </section>
  );
}
