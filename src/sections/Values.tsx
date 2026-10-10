import type { CSSProperties } from 'react';
import { useInView } from './useInView';
import './sections.css';

// Each band is a full-viewport row with hairline borders. Empty space between
// the line and the quote belongs to the travelling seal (journey keyframe x:60).
type Band = {
  name: string;
  line: string;
  quote?: { text: string; author: string };
};

const BANDS: Band[] = [
  { name: 'WHOLE', line: 'I see the whole before I touch a part.' },
  { name: 'SENSE', line: 'Little patience for what makes no sense. What stays, stays for a reason.' },
  {
    name: 'MEANING',
    line: 'A good conclusion says more than the number.',
    quote: { text: 'Not everything that counts can be counted.', author: 'William Bruce Cameron' },
  },
  { name: 'PLAY', line: 'No creativity without play. No play without creativity.' },
  { name: 'REST', line: 'Caring for myself is part of the work. Rest is where ideas come back.' },
];

export function Values() {
  const { ref, inView } = useInView<HTMLUListElement>();

  return (
    <section className="section values-section" id="values" aria-label="values">
      <h2 className="section-eyebrow values-eyebrow">— WHAT I KEEP</h2>
      <ul
        ref={ref}
        className={`values-register${inView ? ' is-in' : ''}`}
      >
        {BANDS.map((b, i) => (
          <li className="values-band" key={b.name} style={{ '--i': i } as CSSProperties}>
            <h3 className="values-band__name">{b.name}</h3>
            <p className="values-band__line">{b.line}</p>
            {b.quote && (
              <blockquote className="values-band__quote">
                <p>&ldquo;{b.quote.text}&rdquo;</p>
                <cite>{b.quote.author}</cite>
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
