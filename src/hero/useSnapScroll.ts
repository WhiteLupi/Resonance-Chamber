import { useEffect } from 'react';

/**
 * Intercepts wheel events on desktop and animates a smooth viewport-by-viewport scroll.
 * Touch devices retain native scrolling (no preventDefault on touch).
 */
export function useSnapScroll() {
  useEffect(() => {
    let locked = false;
    let timer: number | undefined;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 4) return;
      e.preventDefault();
      if (locked) return;

      const dir = e.deltaY > 0 ? 1 : -1;
      const target = Math.max(
        0,
        Math.min(
          window.scrollY + dir * window.innerHeight,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      );

      locked = true;
      window.scrollTo({ top: target, left: 0, behavior: 'smooth' });

      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        locked = false;
      }, 850);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.clearTimeout(timer);
    };
  }, []);
}
