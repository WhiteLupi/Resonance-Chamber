import { useRef } from 'react';
import { Inscription } from './Inscription';
import { useDwell } from './useDwell';
import { BgBreath } from './BgBreath';
import { Telemetry } from '../hero/Telemetry';
import './about.css';

type AboutProps = {
  locked: boolean;
};

export function About({ locked }: AboutProps) {
  const inscriptionRef = useRef<HTMLDivElement>(null);
  const phase = useDwell();

  return (
    <section className="about-section" id="about" aria-label="about">
      <div className="about-stage">
        <BgBreath active={phase.v4} />
        <Inscription ref={inscriptionRef} phase={phase} />
      </div>
      <Telemetry revealed={locked} />
    </section>
  );
}
