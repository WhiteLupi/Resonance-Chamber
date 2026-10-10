// Diegetic charge indicator — radial arc circling the seal. Background ring
// is the dim "potential" outline (always faintly visible pre-lock, hinting
// that the seal is interactive). The fill arc rises clockwise as charge
// climbs from 0 to 1 (held via mouse/touch). Once the engine locks the
// indicator dissolves — its work is done.

const RADIUS = 138;
const CIRC = 2 * Math.PI * RADIUS;

type Props = { locked: boolean };

export function ChargeIndicator({ locked }: Props) {
  return (
    <div
      className={`charge-indicator${locked ? ' charge-indicator--locked' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="-160 -160 320 320" width="320" height="320">
        <circle
          r={RADIUS}
          className="charge-indicator__base"
        />
        <circle
          r={RADIUS}
          className="charge-indicator__fill"
          strokeDasharray={CIRC}
          style={{ strokeDashoffset: `calc(${CIRC} * (1 - var(--charge, 0)))` }}
        />
      </svg>
    </div>
  );
}
