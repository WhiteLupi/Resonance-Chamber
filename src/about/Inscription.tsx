import { LetterSub } from './LetterSub';

const LINES: string[] = [
  'To create art is to speak another language.',
  "You can't move a heart if yours stands still.",
  'Feelings matter. To taste, to love, to dream is to feel.',
];

// Split per character for the glyph swaps, which a screen reader would spell
// out; the same words reach it as plain prose from the .sr-only header (App).
export function Inscription() {
  return (
    <div className="inscription" aria-hidden="true">
      {LINES.map((line, lineIdx) => (
        <p key={lineIdx} className="inscription__line" data-line={lineIdx}>
          <span className="inscription__copy">
            <LetterSub text={line} lineIdx={lineIdx} />
            {lineIdx === LINES.length - 1 && (
              <span className="inscription__caret">{'▌'}</span>
            )}
          </span>
        </p>
      ))}
    </div>
  );
}
