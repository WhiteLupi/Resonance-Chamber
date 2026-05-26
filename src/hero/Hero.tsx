import { Telemetry } from './Telemetry';
import './cockpit.css';

type HeroProps = {
  locked: boolean;
};

// Headline + signature stay hidden until the seal locks. They appear over the
// still-animating seal — the seal becomes the centerpiece of the dark hero,
// not the whole hero. Tied to the lock event the scene fires from glScene.ts.
export function Hero({ locked }: HeroProps) {
  return (
    <section className={`hero-section ${locked ? 'hero-section--revealed' : ''}`}>
      <h1 className="hero-headline" aria-hidden={!locked}>
        <span>LET&rsquo;S</span>
        <span>HEAR</span>
        <span>MOTION</span>
      </h1>
      <div className="hero-signature" aria-hidden={!locked}>KASIA WALTER</div>
      <Telemetry revealed={locked} />
    </section>
  );
}
