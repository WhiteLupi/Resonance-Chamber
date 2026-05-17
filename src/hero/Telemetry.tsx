import { useEffect, useState } from 'react';

const INTRO_DELAY_MS = 3400;

// Readout of the instrument. Each row a field that earns its line — no
// signal-bar decoration, no "creative dev" tautology. LISTENING / TUNED cross-
// stitch the "I hear motion" thesis from hero; STATUS · RECEIVING is the only
// actionable bit, gated by a pulsing accent dot so the panel reads as live.
const ROWS: Array<[string, string]> = [
  ['LISTENING', 'MOTION'],
  ['TUNED', 'BROWSER · 60HZ'],
  ['ORIGIN', 'POLAND'],
];

export function Telemetry() {
  const [introDone, setIntroDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setIntroDone(true), INTRO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Telemetry leaves earlier than the navbar and returns later — it's a
  // hero-only artifact, not a global persistent UI. Pure threshold (no
  // direction tracking): any scroll past 30px hides it; only a return to the
  // very top of the page brings it back. Hysteresis between 5 and 30 prevents
  // jitter on tiny scroll wobble.
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > 30) setHidden(true);
        else if (y <= 5) setHidden(false);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const cls = [
    'cockpit-telemetry',
    introDone && 'cockpit-telemetry--in',
    hidden && 'cockpit-telemetry--hidden',
  ].filter(Boolean).join(' ');

  return (
    <aside className={cls} aria-label="profile telemetry">
      <dl className="cockpit-telemetry__body">
        {ROWS.map(([k, v]) => (
          <div className="cockpit-telemetry__row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="cockpit-telemetry__row">
          <dt>STATUS</dt>
          <dd>
            <span className="cockpit-telemetry__dot" aria-hidden="true" />
            RECEIVING
          </dd>
        </div>
      </dl>
    </aside>
  );
}
