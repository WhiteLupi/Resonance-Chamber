// Section marker — a faint living-light inscription running UP the left
// margin (vertical spine), not a HUD tape across the top. Swaps content as
// the user scrolls: the active title slides out of the clip box, the next
// slides in. Drives off `--p`, in lockstep with the scroll animations.
//
// Treatment is "trace of light in living tissue", not carved stone: phosphor
// teal halo (same as the glyph swaps) and a slow breath, so it reads alive.
//
// Hidden pre-lock — appears only after the engine is activated, so the
// initial encounter shows nothing but the seal, the charge ring and the
// HOLD prompt.
type Props = { locked: boolean };

export function SectionHeader({ locked }: Props) {
  return (
    <div className={`section-header${locked ? ' section-header--in' : ''}`} aria-hidden="true">
      <div className="section-header__inner">
        <div className="section-header__slot section-header__slot--first">THE ENGINE</div>
        <div className="section-header__slot section-header__slot--second">THE SIGNAL</div>
      </div>
    </div>
  );
}
