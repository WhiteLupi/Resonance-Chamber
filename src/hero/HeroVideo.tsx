import { useEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '../motion';

// Printed by scripts/record-hero-video.mjs: where the hold starts inside
// grow.mp4 and where the engine locks.
const HOLD_AT_S = 0.2;
const LOCK_AT_S = 2.033;
// A clip that never plays or stalls must not strand the page locked.
const STALL_MS = (LOCK_AT_S + 2.5) * 1000;

type Props = {
  /** filled with the wake action, for the lock gate's Enter and the prompt */
  wakeRef: RefObject<(() => void) | null>;
  onCharge: (charge: number) => void;
  onLock: () => void;
};

// The phone hero: the 3D scene as recorded clips. A touch plays the growth;
// the charge ring follows the clip up to the lock, and the clip's last frame
// hands over to a loop that opens on the very next frame.
export function HeroVideo({ wakeRef, onCharge, onLock }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const growRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const grow = growRef.current;
    const loop = loopRef.current;
    if (!stage || !grow || !loop) return;
    let started = false;
    let looping = false;
    let raf = 0;
    let stall = 0;

    const follow = () => {
      const charge = Math.min(1, Math.max(0, (grow.currentTime - HOLD_AT_S) / (LOCK_AT_S - HOLD_AT_S)));
      onCharge(charge);
      if (charge >= 1) {
        onLock();
        return;
      }
      raf = requestAnimationFrame(follow);
    };
    const wake = () => {
      if (started) return;
      started = true;
      stall = window.setTimeout(onLock, STALL_MS);
      grow.play().catch(onLock);
      // Fetched only once wanted, and started inside the gesture so iOS lets
      // it play later without one.
      loop.load();
      loop.play().then(() => { if (!looping) loop.pause(); }, () => {});
      raf = requestAnimationFrame(follow);
    };
    const onEnded = () => {
      if (prefersReducedMotion()) return;
      looping = true;
      loop.currentTime = 0;
      loop.play().then(() => stage.classList.add('hero-video--looping'), () => {});
    };

    wakeRef.current = wake;
    window.addEventListener('pointerdown', wake, { passive: true });
    grow.addEventListener('ended', onEnded);
    return () => {
      wakeRef.current = null;
      cancelAnimationFrame(raf);
      clearTimeout(stall);
      window.removeEventListener('pointerdown', wake);
      grow.removeEventListener('ended', onEnded);
    };
  }, [wakeRef, onCharge, onLock]);

  return (
    <div ref={stageRef} className="hero-video" aria-hidden="true">
      <video ref={growRef} src="/hero/grow.mp4" poster="/hero/poster.jpg" muted playsInline preload="auto" />
      <video ref={loopRef} className="hero-video__loop" src="/hero/loop.mp4" muted playsInline loop preload="none" />
    </div>
  );
}
