import './cockpit.css';
import { ShapeSvg, type ShapeKind } from './Cursor';

type HeroProps = {
  locked: boolean;
};

// "motion" split per-letter so the engine's struggle reads on the word itself:
// as the void consumes it (scroll into about), a few letters corrupt into the
// organism's glyphs (the same shapes the about text swaps to). Each glyph letter
// renders both the letter and its glyph, cross-faded by --p in CSS — reversible.
const MOTION = 'motion';
const GLYPH_AT: Record<number, ShapeKind> = {
  1: 'circle',        // o
  3: 'triangle-half', // i
  4: 'square',        // o
};

// Seal as the central glyph of one carved sentence. Canvas paints the seal +
// roots behind; the inscription is just "motion" (the manifesto in a single
// word) and the signature at the base. Pre-lock interaction is discoverable
// from the cursor's scroll-state hint.
export function Hero({ locked }: HeroProps) {
  return (
    <section className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <div className="hero-prompt" aria-hidden={locked}>HOLD</div>
      <div className="hero-inscription">
        <div className="hero-inscription__bottom" aria-hidden={!locked}>
          {MOTION.split('').map((ch, i) => {
            const glyph = GLYPH_AT[i];
            return (
              <span className={`mo-ch${glyph ? ' mo-ch--glyph' : ''}`} key={i}>
                <span className="mo-ch__letter">{ch}</span>
                {glyph && (
                  <span className="mo-ch__glyph" aria-hidden="true">
                    <svg className="mo-ch__svg" viewBox="0 0 30 30">
                      <ShapeSvg kind={glyph} />
                    </svg>
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
