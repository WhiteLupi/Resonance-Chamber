// Chamber atmosphere: two crossed light shafts + sparse teal-tinted dust
// floating in depth. Fixed inset 0 so the air keeps living past the hero
// section into about (it's one chamber, not two rooms). CSS-only — if it
// reads too flat we lift it into the Three.js scene later.
const DUST = [
  { left: '12%', top: '28%', size: 2.5, delay: '0s' },
  { left: '18%', top: '62%', size: 3, delay: '-2s' },
  { left: '26%', top: '38%', size: 2, delay: '-4s' },
  { left: '36%', top: '14%', size: 2, delay: '-7s' },
  { left: '8%',  top: '78%', size: 2.5, delay: '-10s' },
  { left: '92%', top: '50%', size: 2, delay: '-9s' },
  { left: '86%', top: '32%', size: 2.5, delay: '-1s' },
  { left: '80%', top: '64%', size: 3, delay: '-6s' },
  { left: '74%', top: '18%', size: 2, delay: '-3s' },
  { left: '64%', top: '84%', size: 2.5, delay: '-5s' },
];

export function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <div className="atmosphere__shaft atmosphere__shaft--l" />
      <div className="atmosphere__shaft atmosphere__shaft--r" />
      {DUST.map((d, i) => (
        <span
          key={i}
          className="atmosphere__dust"
          style={{
            left: d.left,
            top: d.top,
            width: `${d.size}px`,
            height: `${d.size}px`,
            animationDelay: d.delay,
          }}
        />
      ))}
    </div>
  );
}
