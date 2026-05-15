import { useRef } from 'react';
import { Inscription } from './Inscription';
import { GlyphMargin } from './GlyphMargin';
import './about.css';

export function About() {
  const inscriptionRef = useRef<HTMLDivElement>(null);

  return (
    <section className="about-section" id="about" aria-label="about">
      <GlyphMargin />
      <Inscription ref={inscriptionRef} />
    </section>
  );
}
