import { useEffect, useRef } from 'react';
import { startHero } from './glScene';
import { Navbar } from './Navbar';
import { ScrollCta } from './ScrollCta';
import { Telemetry } from './Telemetry';
import './cockpit.css';

export function Hero() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return startHero(host);
  }, []);

  return (
    <section className="hero-section">
      <div ref={hostRef} className="hero-canvas-host" />
      <Navbar />
      <Telemetry />
      <ScrollCta />
    </section>
  );
}
