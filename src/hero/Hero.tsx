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
      <div className="hero-marker hero-marker--tl" aria-hidden={!locked}>
        § 01 · INVOCATION
      </div>
      <div className="hero-marker hero-marker--tr" aria-hidden={!locked}>
        <span className="hero-marker__dot" aria-hidden="true" />
        STATUS · RECEIVING
      </div>
      <div className="hero-inscription">
        <div className="hero-inscription__top" aria-hidden={!locked}>
          LET&rsquo;S · HEAR
        </div>
        <div className="hero-inscription__bottom" aria-hidden={!locked}>
          MOTION
        </div>
      </div>
      {/* Invitation hint — visible before lock, dissolves after the engine
          activates. Tells the user what to do without an onboarding modal. */}
      <div className="hero-prompt" aria-hidden={locked}>
        <span className="hero-prompt__action">HOLD</span>
        <span className="hero-prompt__dot" aria-hidden="true" />
        <span className="hero-prompt__caption">TO TUNE THE ENGINE</span>
      </div>
      <div className="hero-signature" aria-hidden={!locked}>— K · WALTER</div>
    </section>
  );
}
