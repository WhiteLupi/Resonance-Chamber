import { useEffect, useRef, useState } from 'react';

// Reveal-on-scroll. Returns a ref to attach to the target and a boolean that
// flips true the first time the element crosses into view, then stays true
// (one-shot — sections "arrive" once and don't re-hide on scroll-up, matching
// the chamber's one-way reveal language). Threshold is generous so the
// stagger fires while the block is still rising into the viewport.
export function useInView<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);

  return { ref, inView };
}
