// Global fixed signature — sits at the bottom of the viewport across all
// sections. Hidden pre-lock; appears post-lock as part of the chamber's
// framing (top: section header, bottom: signature plate).
type Props = { locked: boolean };

export function Signature({ locked }: Props) {
  return (
    <div className={`signature${locked ? ' signature--in' : ''}`} aria-hidden="true">— K · WALTER</div>
  );
}
