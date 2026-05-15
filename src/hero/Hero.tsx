import { Navbar } from './Navbar';
import { ScrollCta } from './ScrollCta';
import { Telemetry } from './Telemetry';
import './cockpit.css';

export function Hero() {
  return (
    <section className="hero-section">
      <Navbar />
      <Telemetry />
      <ScrollCta />
    </section>
  );
}
