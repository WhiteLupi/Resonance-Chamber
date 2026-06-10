import { useInView } from './useInView';
import { ShapeSvg, type ShapeKind } from '../hero/Cursor';
import './sections.css';

type Node = { label: string; href: string; glyph: ShapeKind };

const NODES: Node[] = [
  { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/kasiawalter', glyph: 'square' },
];

export function Contact() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section channel-section" id="contact" aria-label="contact">
      <p className="section-eyebrow">— THE CHANNEL</p>
      <div
        ref={ref}
        className={`channel-grid${inView ? ' is-in' : ''}`}
      >
        <h2 className="channel-headline">
          Need something
          <br />
          clearer, stranger, or more alive.
        </h2>
        <div className="channel-panel">
          <a className="channel-cta" href="mailto:bronowickakasia@gmail.com">
            <span className="channel-cta__text">bronowickakasia@gmail.com</span>
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
            open to thoughtful product and frontend work
          </p>
        </div>
      </div>
    </section>
  );
}
