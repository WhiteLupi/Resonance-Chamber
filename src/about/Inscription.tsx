import type { DwellPhase } from './useDwell';
import { LetterSub } from './LetterSub';

const LINES: string[] = [
  'To create art is to speak another language.',
  "You can't move a heart if yours stands still.",
  'Feelings matter. To taste, to love, to dream is to feel.',
];

type Props = { phase: DwellPhase };

export function Inscription({ phase }: Props) {
  return (
    <div className="inscription">
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
}
