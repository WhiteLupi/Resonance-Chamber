import { forwardRef } from 'react';
import type { DwellPhase } from './useDwell';
import { LetterSub } from './LetterSub';

const LINES: string[] = [
  'I hear motion.',
  'Most days I tune browser animation until the sound in my head resolves. The rest is React apps, when the brief is quieter.',
  'I work a layer above the code — AI does the typing, the taste is mine.',
];

type Props = { phase: DwellPhase };

export const Inscription = forwardRef<HTMLDivElement, Props>(function Inscription({ phase }, ref) {
  return (
    <div ref={ref} className="inscription">
      {LINES.map((line, lineIdx) => (
        <p key={lineIdx} className="inscription__line" data-line={lineIdx}>
          <span className="inscription__copy">
            <LetterSub text={line} lineIdx={lineIdx} active={phase.v2} />
            {lineIdx === LINES.length - 1 && (
              <span className="inscription__caret" aria-hidden="true">{'▌'}</span>
            )}
          </span>
        </p>
      ))}
    </div>
  );
});
