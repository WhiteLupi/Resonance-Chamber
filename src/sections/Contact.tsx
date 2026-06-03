import { useInView } from './useInView';
import { ShapeSvg, type ShapeKind } from '../hero/Cursor';
import './sections.css';

// "THE CHANNEL" — the closing room. The engine, dimmed to a ghost behind, makes
// the final move: an open invitation, the email as the one bright filament, and
// a small row of channels. Mirrors the hero (a single luminous focal point on
// black) so the page reads as a loop, not a dead end.
//
// MOCK: contact handles below are placeholders — swap for real ones.
type Node = { label: string; href: string; glyph: ShapeKind };

const NODES: Node[] = [
  { label: 'GITHUB', href: 'https://github.com/kasiawalter', glyph: 'triangle' },
  { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/kasiawalter', glyph: 'square' },
  { label: 'READ.CV', href: 'https://read.cv/kasiawalter', glyph: 'circle-half' },
  { label: 'X', href: 'https://x.com/kasiawalter', glyph: 'triangle-half' },
];

export function Contact() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section channel-section" id="contact" aria-label="contact">
      <div
        ref={ref}
        className={`section-inner channel-inner${inView ? ' is-in' : ''}`}
      >
        <p className="section-eyebrow">— THE CHANNEL</p>
        <h2 className="channel-headline">
          Let&rsquo;s make
          <br />
          something move.
        </h2>

        <a className="channel-cta" href="mailto:hello@kasiawalter.dev">
          <span className="channel-cta__text">hello@kasiawalter.dev</span>
          <span className="channel-cta__line" aria-hidden="true" />
        </a>

        <ul className="channel-nodes">
          {NODES.map((n) => (
            <li key={n.label}>
              <a className="channel-node" href={n.href} target="_blank" rel="noreferrer">
                <svg className="channel-node__glyph" viewBox="0 0 30 30" aria-hidden="true">
                  <ShapeSvg kind={n.glyph} />
                </svg>
                <span>{n.label}</span>
              </a>
            </li>
          ))}
        </ul>

        <p className="channel-status" aria-hidden="true">
          <span className="channel-status__dot" />
          transmission open
        </p>
      </div>
    </section>
  );
}
