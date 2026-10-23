import './hero.css';

type HeroProps = {
  locked: boolean;
  /** phones: the recorded awakening plays on a touch instead of a hold */
  onWake?: () => void;
};

// The canvas paints the seal and veins behind; once awake, the question stands
// beside it and lands on "Alive". Pre-lock interaction is discoverable
// from the cursor's over-ball "hold" affordance; holding Enter charges the same
// ritual from the keyboard (App's lock gate listens window-wide). The prompt is
// a real button so AT users find a labelled control, and focusing it reveals
// the key hint.
export function Hero({ locked, onWake }: HeroProps) {
  return (
    <section id="hero" className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <button
        type="button"
        className="hero-prompt"
        aria-label={onWake ? 'Wake the engine' : 'Hold Enter to wake the engine'}
        aria-hidden={locked}
        disabled={locked}
        onClick={onWake}
      >
        {onWake ? 'TOUCH' : 'HOLD'}
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
