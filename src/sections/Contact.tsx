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
      <h2 className="section-eyebrow">— THE TRUTH</h2>
      <div
        ref={ref}
        className={`channel-grid${inView ? ' is-in' : ''}`}
      >
        <h3 className="channel-headline">
          As words get cheaper,
          <br />
          truth gets priceless.
        </h3>
        <div className="channel-panel">
          <p className="channel-invite">
            <span className="channel-invite__dot" aria-hidden="true" />
            Tell me yours.
          </p>
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
        </div>
      </div>
    </section>
  );
}
