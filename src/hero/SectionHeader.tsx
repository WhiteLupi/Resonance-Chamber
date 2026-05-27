// Global section header — single fixed element at the top of the viewport
// that swaps content as the user scrolls. Visually behaves like a tape
// rolling vertically: the active section title slides up out of the
// window, the next one slides up into place. Drives off `--p`, so it
// stays in lockstep with the rest of the scroll-driven animations.
//
// Replaces both the hero wall-relief ("§ 01 · INVOCATION" baked into
// the chamber) and the about inscription header ("§ 02 · TRANSMISSION"
// inside the inscription block) — one place, one truth.
export function SectionHeader() {
  return (
    <div className="section-header" aria-hidden="true">
      <div className="section-header__inner">
        <div className="section-header__slot section-header__slot--first">§ 01 · INVOCATION</div>
        <div className="section-header__slot section-header__slot--second">§ 02 · TRANSMISSION</div>
      </div>
    </div>
  );
}
