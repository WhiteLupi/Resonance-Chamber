import { ShapeSvg, type ShapeKind } from '../hero/Cursor';

/* Marginalia — same cursor/navbar glyph lexicon, as a bibliographic trace
   flanking the inscription. Phase 1: static placement. Phase 5 adds the
   random 5-8s one-at-a-time fade (polyrhythm). */
const MARKS: { kind: ShapeKind; top: string; left?: string; right?: string }[] = [
  { kind: 'circle-half', top: '22%', left: '11%' },
  { kind: 'triangle', top: '58%', left: '8%' },
  { kind: 'square', top: '78%', left: '14%' },
  { kind: 'circle', top: '30%', right: '10%' },
  { kind: 'triangle-half', top: '66%', right: '13%' },
];

export function GlyphMargin() {
  return (
    <div className="about-glyph-margin" aria-hidden="true">
      {MARKS.map((m, i) => (
        <svg
          key={i}
          className="about-glyph"
          viewBox="0 0 30 30"
          style={{ top: m.top, left: m.left, right: m.right }}
        >
          <ShapeSvg kind={m.kind} />
        </svg>
      ))}
    </div>
  );
}
