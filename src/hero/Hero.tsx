import { useRef, type RefObject } from 'react';
import type { HeroScene } from './glScene';
import './cockpit.css';

type HeroProps = {
  locked: boolean;
  scene: RefObject<HeroScene | null>;
};

// Seal as the central glyph of one carved sentence. Canvas paints the seal +
// roots behind; the inscription is the single word "alive" — a stance, not a
// medium — which the About thesis later pays off ("…clearer, calmer, and more
// alive"). The signature sits at the base. Pre-lock interaction is discoverable
// from the cursor's over-ball "hold" affordance; the HOLD prompt is a real
// button, so holding Enter/Space is the keyboard's way through the same ritual.
export function Hero({ locked, scene }: HeroProps) {
  // One held-state guard for both key repeat (keydown fires repeatedly while
  // held) and the window-level mouseup that also clears the scene's hold.
  const heldRef = useRef(false);

  const holdStart = () => {
    if (heldRef.current || locked) return;
    heldRef.current = true;
    scene.current?.holdStart();
  };
  const holdEnd = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    scene.current?.holdEnd();
  };

  return (
    <section id="hero" className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <button
        type="button"
        className="hero-prompt"
        aria-label="Hold Enter to wake the engine"
        aria-hidden={locked}
        disabled={locked}
        onKeyDown={(e) => {
          if (e.repeat) return;
          if (e.key === 'Enter' || e.key === ' ') holdStart();
        }}
        onKeyUp={holdEnd}
        onBlur={holdEnd}
      >
        HOLD
      </button>
      <div className="hero-inscription">
        <div className="hero-inscription__bottom" aria-hidden={!locked}>Alive</div>
      </div>
    </section>
  );
}
