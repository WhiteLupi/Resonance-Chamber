import './cockpit.css';

type HeroProps = {
  locked: boolean;
};

// Seal as the central glyph of one carved sentence. Canvas paints the seal +
// roots behind; the inscription is the single word "alive" — a stance, not a
// medium — which the About thesis later pays off ("…clearer, calmer, and more
// alive"). The signature sits at the base. Pre-lock interaction is discoverable
// from the cursor's over-ball "hold" affordance.
export function Hero({ locked }: HeroProps) {
  return (
    <section id="hero" className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <div className="hero-prompt" aria-hidden={locked}>HOLD</div>
      <div className="hero-inscription">
        <div className="hero-inscription__bottom" aria-hidden={!locked}>alive</div>
      </div>
    </section>
  );
}
