import { useInView } from './useInView';
import { ShapeSvg } from '../ShapeSvg';
import type { ShapeKind } from '../glyphs';
import './sections.css';

type Node = { label: string; href: string; glyph: ShapeKind };

const NODES: Node[] = [
  { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/kasia-walter', glyph: 'square' },
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
          <ul className="channel-links">
            <li>
              <a className="channel-link" href="mailto:kasia.walter.it@gmail.com">
                <span className="channel-link__text">kasia.walter.it@gmail.com</span>
                <span className="channel-link__line" aria-hidden="true" />
              </a>
            </li>
            {NODES.map((n) => (
              <li key={n.label}>
                <a
                  className="channel-link channel-link--second"
                  href={n.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg className="channel-link__glyph" viewBox="0 0 30 30" aria-hidden="true">
                    <ShapeSvg kind={n.glyph} />
                  </svg>
                  <span className="channel-link__text">{n.label}</span>
                  <span className="channel-link__line" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          {/* The availability line is real content — only the pulsing dot is
              decoration. Broken across two lines: one long uppercase run at
              0.4em tracking read as texture, not as a sentence. */}
          <p className="channel-status">
            <span className="channel-status__dot" aria-hidden="true" />
            <span>
              open to motion-led product &amp; frontend work
              <br />
              EU remote &middot; based in Poland
            </span>
          </p>
          {/* The colophon answers the question every visitor will ask of an
              AI-era portfolio before they ask it — the DIRECTION band's claim,
              proven by the page itself. */}
          <p className="channel-colophon">
            this site: react + three.js, built by directing AI agents
            &mdash; every diff reviewed
          </p>
        </div>
      </div>
    </section>
  );
}
