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
            A motion-led marketing site &mdash; I built the frontend and its
            GSAP scroll choreography, tuned for rhythm, contrast, and feel.
          </p>
          <p className="work-copy">
            Awwwards Developer Award and Site of the Day, February 2024.
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
          {/* "current" moved to the About aside — one fact, one home. */}
          <div className="work-side">
            <div>
              <p className="work-side__label">focus</p>
              <p className="work-copy">
                Particle systems, concept-art-driven visuals, living
                motion &mdash; and products that don&rsquo;t exclude people.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
