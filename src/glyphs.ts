// The site's shared glyph language — five geometric marks used everywhere a
// symbol is needed: the cursor's rotating shape, navbar link markers, contact
// nodes, and the About inscription's letter substitutions. ShapeSvg.tsx draws
// them; this module is the canonical list.

export const SHAPES = [
  'circle',
  'triangle',
  'square',
  'circle-half',
  'triangle-half',
] as const;

export type ShapeKind = (typeof SHAPES)[number];
