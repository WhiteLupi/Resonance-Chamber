import type { ShapeKind } from './glyphs';

// Draws one glyph from the shared language (src/glyphs.ts) inside a 30×30
// viewBox; color comes from the parent via currentColor.
export function ShapeSvg({ kind }: { kind: ShapeKind }) {
  const stroke = 'currentColor';
  const sw = 1.4;

  switch (kind) {
    case 'circle':
      return (
        <>
          <circle cx="15" cy="15" r="13" stroke={stroke} strokeWidth={sw} fill="none" />
          <circle cx="15" cy="15" r="1.7" fill={stroke} />
        </>
      );
    case 'triangle':
      return (
        <>
          <polygon
            points="15,3 27,25 3,25"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="19" r="1.7" fill={stroke} />
        </>
      );
    case 'square':
      return (
        <>
          <rect
            x="3"
            y="3"
            width="24"
            height="24"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="15" r="1.7" fill={stroke} />
        </>
      );
    case 'circle-half':
      return (
        <>
          <path d="M15,2 A13,13 0 0,1 15,28 Z" fill={stroke} />
          <circle cx="15" cy="15" r="13" stroke={stroke} strokeWidth={sw} fill="none" />
        </>
      );
    case 'triangle-half':
      return (
        <>
          <polygon points="15,3 27,25 15,25" fill={stroke} />
          <polygon
            points="15,3 27,25 3,25"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
        </>
      );
  }
}
