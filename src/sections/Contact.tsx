import { useInView } from './useInView';
import './sections.css';

// The close. The record lives on LinkedIn, so that is the first door; the
// letter comes after.
export function Contact() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="section truth-section" id="contact" aria-label="contact">
      <h2 className="section-eyebrow">— THE TRUTH</h2>
      <div ref={ref} className={`truth${inView ? ' is-in' : ''}`}>
        <h3 className="truth__headline">
          As words get cheaper,
          <br />
          truth gets priceless.
        </h3>
        <a
          className="truth__cta"
          href="https://www.linkedin.com/in/kasia-walter"
          target="_blank"
          rel="noreferrer"
        >
          Read the rest on LinkedIn <span aria-hidden="true">&rarr;</span>
        </a>
        <p className="truth__then">
          &hellip;then tell me your truth.{' '}
          <a className="truth__mail" href="mailto:kasia.walter.it@gmail.com">
            kasia.walter.it@gmail.com
          </a>
        </p>
      </div>
    </section>
  );
}
