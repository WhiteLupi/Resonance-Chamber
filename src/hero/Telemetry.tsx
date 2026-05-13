import { useEffect, useState } from 'react';

const INTRO_DELAY_MS = 3400;

const ROWS: Array<[string, string]> = [
  ['ROLE', 'CREATIVE DEV'],
  ['STACK', 'REACT · GL'],
  ['LOC', 'PL · WRO'],
];

export function Telemetry() {
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setIntroDone(true), INTRO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <aside
      className={`cockpit-telemetry${introDone ? ' cockpit-telemetry--in' : ''}`}
      aria-label="profile telemetry"
    >
      <div className="cockpit-telemetry__header">
        <span className="cockpit-telemetry__bracket">[</span>
        <span>PROFILE</span>
        <span className="cockpit-telemetry__bracket">]</span>
      </div>
      <dl className="cockpit-telemetry__body">
        {ROWS.map(([k, v]) => (
          <div className="cockpit-telemetry__row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="cockpit-telemetry__row cockpit-telemetry__row--sig">
          <dt>SIG</dt>
          <dd className="cockpit-telemetry__bars" aria-hidden="true">
            <span className="cockpit-telemetry__bar cockpit-telemetry__bar--on" />
            <span className="cockpit-telemetry__bar cockpit-telemetry__bar--on" />
            <span className="cockpit-telemetry__bar cockpit-telemetry__bar--on" />
            <span className="cockpit-telemetry__bar" />
            <span className="cockpit-telemetry__bar" />
          </dd>
        </div>
      </dl>
    </aside>
  );
}
