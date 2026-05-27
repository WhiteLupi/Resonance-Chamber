// Global section header — single fixed element at the top of the viewport
// that swaps content as the user scrolls. Visually behaves like a tape
// rolling vertically: the active section title slides up out of the
// window, the next one slides up into place. Drives off `--p`, so it
// stays in lockstep with the rest of the scroll-driven animations.
//
// Hidden pre-lock — appears only after the engine is activated, so the
// initial encounter shows nothing but the seal, the charge ring and the
// HOLD prompt.
type Props = { locked: boolean };

export function SectionHeader({ locked }: Props) {
  return (
    <div className={`section-header${locked ? ' section-header--in' : ''}`} aria-hidden="true">
      <div className="section-header__inner">
        <div className="section-header__slot section-header__slot--first">§ 01 · INVOCATION</div>
        <div className="section-header__slot section-header__slot--second">§ 02 · TRANSMISSION</div>
      </div>
    </div>
  );
}
