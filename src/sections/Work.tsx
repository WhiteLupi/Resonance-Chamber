import { useInView } from './useInView';
import './sections.css';

// "SELECTED WORK" - showcase (spec 2026-06-10). The left grid column is
// intentionally empty: the travelling seal docks there (journey keyframe work:
// x 30, brightness 0.95) and becomes the living motion preview.
export function Work() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section work-section" id="work" aria-label="selected work">
      <h2 className="section-eyebrow">— SELECTED WORK</h2>
      <div ref={ref} className={`work-grid${inView ? ' is-in' : ''}`}>
        <div className="work-stage" aria-hidden="true" />
        <div className="work-info">
          <h3 className="work-title">cuewigs</h3>
          <p className="work-copy">
            A motion-led marketing site built with attention to rhythm,
            contrast, and feel.
          </p>
          <p className="work-copy">
            GSAP-driven motion &mdash; Awwwards Developer Award and Site of the
            Day, February 2024.
          </p>
          <ul className="work-chips">
            <li>gsap motion</li>
            <li>awwwards 2024</li>
            <li>frontend build</li>
          </ul>
          <a
            className="work-link"
            href="https://www.cuewigs.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="work-link__text">visit cuewigs &#8599;</span>
            <span className="work-link__line" aria-hidden="true" />
          </a>
          <div className="work-side">
            <div>
              <p className="work-side__label">current</p>
              <p className="work-copy">
                At Pirxey / Widelab I work across frontend, interface
                quality, product UI, and design systems.
              </p>
            </div>
            <div>
              <p className="work-side__label">focus</p>
              <p className="work-copy">
                Visual polish, living motion, systems designers actually
                want to use, and products that don&rsquo;t exclude people.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
