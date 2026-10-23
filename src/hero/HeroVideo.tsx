import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../motion';

// Recorded from the live scene by scripts/record-hero-video.mjs, which prints
// the moment the engine locks inside grow.mp4.
const LOCK_AT_S = 2.033;

type Props = {
  onCharge: (charge: number) => void;
  onLock: () => void;
};

// The phone hero: the 3D scene as recorded clips. A touch (or Enter) plays the
// growth; the charge ring follows the clip up to the lock, and the clip's last
// frame hands over to a loop that opens on the very next frame.
export function HeroVideo({ onCharge, onLock }: Props) {
  const growRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const grow = growRef.current;
    const loop = loopRef.current;
    if (!grow || !loop) return;
    let started = false;
    let raf = 0;

    const follow = () => {
      const charge = Math.min(1, grow.currentTime / LOCK_AT_S);
      onCharge(charge);
      if (charge >= 1) {
        onLock();
        return;
      }
      raf = requestAnimationFrame(follow);
    };
    const start = () => {
      if (started) return;
      started = true;
      grow.play().catch(() => {});
      // Fetched only once wanted, and started inside the gesture so iOS lets
      // it play later without one.
      loop.load();
      loop.play().then(() => loop.pause(), () => {});
      raf = requestAnimationFrame(follow);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(document.activeElement instanceof HTMLAnchorElement)) start();
    };
    const onEnded = () => {
      onLock();
      if (prefersReducedMotion()) return;
      loop.currentTime = 0;
      loop.play().then(() => {
        loop.style.opacity = '1';
        grow.style.opacity = '0';
      }, () => {});
    };

    window.addEventListener('pointerdown', start, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    grow.addEventListener('ended', onEnded);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', onKeyDown);
      grow.removeEventListener('ended', onEnded);
    };
  }, [onCharge, onLock]);

  return (
    <div className="hero-video" aria-hidden="true">
      <video ref={growRef} src="/hero/grow.mp4" poster="/hero/poster.jpg" muted playsInline preload="auto" />
      <video ref={loopRef} src="/hero/loop.mp4" muted playsInline loop preload="none" style={{ opacity: 0 }} />
    </div>
  );
}
