import { useInView } from './useInView';
import './sections.css';

// One value per screen. The left half belongs to the seal, which answers each
// value through its journey keyframe (App: `value-<name>`).
type Value = {
  name: string;
  line: string;
  quote?: { text: string; author: string };
};

const VALUES: Value[] = [
  { name: 'Whole', line: 'I see the whole before I touch a part.' },
  { name: 'Sense', line: 'Little patience for what makes no sense. What stays, stays for a reason.' },
  {
    name: 'Meaning',
    line: 'A good conclusion says more than the number.',
    quote: { text: 'Not everything that counts can be counted.', author: 'William Bruce Cameron' },
  },
  { name: 'Play', line: 'No creativity without play. No play without creativity.' },
  { name: 'Rest', line: 'Caring for myself is part of the work. Rest is where ideas come back.' },
];

function ValueStep({ value }: { value: Value }) {
  const { ref, inView } = useInView<HTMLLIElement>(0.4);
  return (
    <li
      ref={ref}
      id={`value-${value.name.toLowerCase()}`}
      className={`value-step${inView ? ' is-in' : ''}`}
    >
      <div className="value-step__body">
        <h3 className="value-step__name">{value.name}</h3>
        <p className="value-step__line">{value.line}</p>
        {value.quote && (
          <blockquote className="value-step__quote">
            <p>&ldquo;{value.quote.text}&rdquo;</p>
            <cite>{value.quote.author}</cite>
          </blockquote>
        )}
      </div>
    </li>
  );
}

export function Values() {
  const { ref, inView } = useInView<HTMLParagraphElement>(0.5);

  return (
    <section className="section values-section" id="values" aria-label="values">
      <h2 className="section-eyebrow values-eyebrow">— WHAT I KEEP</h2>
      <p ref={ref} className={`values-intro${inView ? ' is-in' : ''}`}>
        Between the first sketch
        <br />
        and the last line of code,
        <br />
        this is what I keep.
      </p>
      <ol className="values-steps">
        {VALUES.map((v) => (
          <ValueStep key={v.name} value={v} />
        ))}
      </ol>
    </section>
  );
}
