// One place to ask "did the visitor request calm?". JS-driven motion sources
// (Lenis smoothing, the GL scene's autonomous breathing, the ambient letter
// scheduler) gate on this; CSS animations are silenced by the global
// prefers-reduced-motion block in index.css. Interaction-driven feedback —
// charging, root growth, the scroll journey — stays: it moves only when the
// visitor moves.
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
