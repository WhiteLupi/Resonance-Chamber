import { useInView } from './useInView';
import './sections.css';

// "SELECTED WORK" — the left grid column is intentionally empty: the travelling
// seal docks there (journey keyframe work: x 30, brightness 0.95) and becomes
// the living motion preview.
export function Work() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section work-section" id="work" aria-label="selected work">
      <h2 className="section-eyebrow">— SELECTED WORK</h2>
      <div ref={ref} className={`work-grid${inView ? ' is-in' : ''}`}>
        <div className="work-stage" aria-hidden="true" />
        <div className="work-info">
          <article className="work-entry">
            <h3 className="work-title">cuewigs</h3>
            <p className="work-copy">
              I wrote the frontend. The design and the motion spec came from the
              designer; every line that made it run is mine &mdash; the GSAP
              implementation, the responsive system, the performance.
            </p>
            <p className="work-copy">
              The layout scales as one continuous system: everything in rem, the
              root font-size interpolated against the viewport, so nothing jumps
              between breakpoints. That one was my call.
            </p>
            <p className="work-copy">
              <strong className="work-award">
                Awwwards Developer Award, February 2024.
              </strong>{' '}
              Awwwards gives that one to the developer. Site of the Day the same
              month.
            </p>
            <ul className="work-chips">
              <li>awwwards developer award &rsquo;24</li>
              <li>gsap</li>
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
          </article>

          <article className="work-entry">
            <h3 className="work-title">this site</h3>
            <p className="work-copy">
              A WebGL engine written from scratch: a shaded core lit off-axis,
              tendrils reaching out of it, a sonar pulse, comets, and a charge
              mechanic that locks the chamber. Three.js and my own shaders
              &mdash; no library did this.
            </p>
            <p className="work-copy">
              It stays smooth on a mid-range phone because I made it: GPU
              tiering, bloom dropped where it costs too much, native-resolution
              rendering, and a frame budget every effect has to pay into.
            </p>
            <p className="work-copy">
              Built by directing AI agents with persistent memory &mdash; every
              diff reviewed by me. You are looking at the proof of the last band.
            </p>
            <ul className="work-chips">
              <li>three.js</li>
              <li>glsl</li>
              <li>perf engineering</li>
              <li>agent-directed build</li>
            </ul>
          </article>

          <div className="work-side">
            <div>
              <p className="work-side__label">also</p>
              <p className="work-copy">
                React and Next.js product apps. Design systems built in code from
                a designer&rsquo;s visual language &mdash; the token architecture
                and component API underneath. Four years of production web.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
