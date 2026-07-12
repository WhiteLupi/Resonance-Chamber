import type { DwellPhase } from './useDwell';
import { LetterSub } from './LetterSub';

const LINES: string[] = [
  'Frontend and motion engineer. I build the layer you feel before you read a word.',
  'Something is wrong and nobody can name it yet. That is the moment I am for — I go under the surface and fix the structure, not the symptom.',
  'AI moved the bottleneck from typing to judgement. Judgement is the part I am good at.',
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
