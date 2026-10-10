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
              Awwwards gives that one to the developer. Site of the Day and FWA
              Site of the Day the same month.
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
              A real-time engine sharing a render loop with a React app: Three.js
              and TypeScript &mdash; a core, veins, a sonar pulse, and a charge
              mechanic that gates the page. Custom GLSL: the veins grow, sway and
              carry light on the GPU in a single draw call, written from scratch.
            </p>
            <p className="work-copy">
              It holds on a mid-range phone because I made it hold. The figure
              grows in a worker, lines antialias in their shaders, and resolution
              steps down only when frames really miss the refresh. Scroll work
              is rAF-coalesced and layout is read once a frame, so the DOM never
              fights the render loop for the budget.
            </p>
            <p className="work-copy">
              It also degrades: reduced motion stills the engine and the page
              still reads. I designed it myself by directing AI tools
              through exploration, then built it with agents against a method
              and a review I wrote myself.
            </p>
            <ul className="work-chips">
              <li>three.js</li>
              <li>webgl</li>
              <li>typescript</li>
              <li>perf engineering</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
