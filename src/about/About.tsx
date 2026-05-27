import { useRef } from 'react';
import { Inscription } from './Inscription';
import { useDwell } from './useDwell';
import { BgBreath } from './BgBreath';
import './about.css';

export function About() {
  const inscriptionRef = useRef<HTMLDivElement>(null);
  const phase = useDwell();

  return (
    <section className="about-section" id="about" aria-label="about">
      <div className="about-stage">
        <BgBreath active={phase.v4} />
        <Inscription ref={inscriptionRef} phase={phase} />
      </div>
    </section>
  );
}
