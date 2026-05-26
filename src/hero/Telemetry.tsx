import { useEffect, useState } from 'react';

type TelemetryProps = {
  revealed: boolean;
};

// Readout of the instrument. Each row a field that earns its line — no
// signal-bar decoration, no "creative dev" tautology. LISTENING / TUNED cross-
// stitch the "I hear motion" thesis from hero; STATUS · RECEIVING is the only
// actionable bit, gated by a pulsing accent dot so the panel reads as live.
const ROWS: Array<[string, string]> = [
  ['LISTENING', 'MOTION'],
  ['TUNED', 'BROWSER · 60HZ'],
  ['ORIGIN', 'POLAND'],
];

// Telemetry now belongs to the about section ("inside the engine"). Hidden in
// hero, slides in once the user scrolls into about. Hidden state inverts the
// old behavior — readout shows when y > 60, hides when y <= 20.
export function Telemetry({ revealed }: TelemetryProps) {
  const [hidden, setHidden] = useState(true);

  // Inverted threshold from old behavior — telemetry is the readout you see
  // ONCE INSIDE the engine (in about), not from frame one. Slides in past
  // y=60, slides back out below y=20. Hysteresis prevents jitter at the seam.
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > 60) setHidden(false);
        else if (y <= 20) setHidden(true);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const cls = [
    'cockpit-telemetry',
    revealed && 'cockpit-telemetry--in',
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
