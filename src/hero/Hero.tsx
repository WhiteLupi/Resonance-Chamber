import './cockpit.css';

type HeroProps = {
  locked: boolean;
};

// Seal as the central glyph of one carved sentence. Canvas paints the seal +
// roots behind; the inscription is a question that lands on "Alive" — a stance,
// not a medium. The signature sits at the base. Pre-lock interaction is discoverable
// from the cursor's over-ball "hold" affordance; holding Enter charges the same
// ritual from the keyboard (App's lock gate listens window-wide). The prompt is
// a real button so AT users find a labelled control, and focusing it reveals
// the key hint.
export function Hero({ locked }: HeroProps) {
  return (
    <section id="hero" className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <button
        type="button"
        className="hero-prompt"
        aria-label="Hold Enter to wake the engine"
        aria-hidden={locked}
        disabled={locked}
      >
        HOLD
      </button>
      <div className="hero-inscription">
        <div className="hero-inscription__bottom" aria-hidden={!locked}>
          <span className="hero-inscription__lead">What makes you feel</span>
          Alive?
        </div>
      </div>
    </section>
  );
}
