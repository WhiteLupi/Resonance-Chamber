import type { DwellPhase } from './useDwell';
import { LetterSub } from './LetterSub';

const LINES: string[] = [
  'Frontend and motion engineer. I build the layer you feel before you read a word.',
  'I write the engines — WebGL, shaders, scroll choreography — and the React systems under them that hold when the product gets real.',
  'I direct AI agents the way I direct motion: explore wide, cut hard, keep authorship. The methodology is mine — I wrote it, and I review every diff.',
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
