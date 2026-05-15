import { forwardRef } from 'react';

const LINES: { label: string; copy: string }[] = [
  {
    label: '[ FN_KASIA :: 00 ]',
    copy: 'Front-end developer. Browser animation.',
  },
  {
    label: '[ FN_KASIA :: 01 ]',
    copy: 'I hear motion. I tune an animation until the sound in my head resolves.',
  },
  {
    label: '[ FN_KASIA :: 02 ]',
    copy: "AI developer. The motion-craft decisions are mine; the code is the agent's.",
  },
];

/* Single bounding box around all three sentences (spec decision #4).
   The forwarded ref is the particle-collision rectangle source for Phase 3. */
export const Inscription = forwardRef<HTMLDivElement>(function Inscription(_, ref) {
  return (
    <div ref={ref} className="inscription">
      {LINES.map(line => (
        <p key={line.label} className="inscription__line">
          <span className="inscription__label">{line.label}</span>
          <span className="inscription__copy">{line.copy}</span>
        </p>
      ))}
    </div>
  );
});
