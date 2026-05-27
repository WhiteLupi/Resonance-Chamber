import './cockpit.css';

type HeroProps = {
  locked: boolean;
};

// Seal as the central glyph of one carved sentence. Canvas paints the seal +
// roots behind; the inscription is just "motion" (the manifesto in a single
// word) and the signature at the base. Section header lives elsewhere (left
// wall relief, step 3). Pre-lock interaction is discoverable from the
// cursor's scroll-state hint.
export function Hero({ locked }: HeroProps) {
  return (
    <section className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <div className="hero-inscription">
        <div className="hero-inscription__bottom" aria-hidden={!locked}>
          {Array.from('motion').map((ch, i, arr) => (
            <span
              key={i}
              className="hero-inscription__letter"
              style={{ ['--i' as string]: i - (arr.length - 1) / 2 }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>
      <div className="hero-signature" aria-hidden={!locked}>— K · WALTER</div>
    </section>
  );
}
