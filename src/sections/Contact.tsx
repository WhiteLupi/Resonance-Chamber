import { useInView } from './useInView';
import { ShapeSvg } from '../ShapeSvg';
import type { ShapeKind } from '../glyphs';
import './sections.css';

type Node = { label: string; href: string; glyph: ShapeKind };

const NODES: Node[] = [
  { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/kasiawalter', glyph: 'square' },
];

export function Contact() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section channel-section" id="contact" aria-label="contact">
      <h2 className="section-eyebrow">— THE CHANNEL</h2>
      <div
        ref={ref}
        className={`channel-grid${inView ? ' is-in' : ''}`}
      >
        <h3 className="channel-headline">
          Need something
          <br />
          clearer, stranger, or more alive.
        </h3>
        <div className="channel-panel">
          <a className="channel-cta" href="mailto:kasia.walter.it@gmail.com">
            <span className="channel-cta__text">kasia.walter.it@gmail.com</span>
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
          {/* The availability line is real content — only the pulsing dot is
              decoration. */}
          <p className="channel-status">
            <span className="channel-status__dot" aria-hidden="true" />
            open to motion-led product and frontend work &middot; EU remote
            &middot; based in Poland
          </p>
        </div>
      </div>
    </section>
  );
}
