// Global fixed signature — sits at the bottom of the viewport across all
// sections, same way SectionHeader sits at the top. Doesn't scroll out
// or fade — it's the chamber's authorship plate, persistent.
export function Signature() {
  return (
    <div className="signature" aria-hidden="true">— K · WALTER</div>
  );
}
