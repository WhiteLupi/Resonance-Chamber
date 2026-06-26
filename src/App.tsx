import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import { startHero, type HeroScene } from './hero/glScene'
import { Hero } from './hero/Hero'
import { Navbar } from './hero/Navbar'
import { About } from './about/About'
import { Skills } from './sections/Skills'
import { Work } from './sections/Work'
import { Contact } from './sections/Contact'
import { Cursor } from './hero/Cursor'
import { Atmosphere } from './hero/Atmosphere'
import { ChargeIndicator } from './hero/ChargeIndicator'
import { SectionHeader } from './hero/SectionHeader'
import { Signature } from './hero/Signature'
import { progressStore } from './about/dwellStore'

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HeroScene | null>(null)
  const [locked, setLocked] = useState(false)

  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const scene = startHero(stage)
    sceneRef.current = scene
    const unsub = scene.onLock(() => setLocked(true))
    const root = document.documentElement
    const unsubCharge = scene.onCharge((c) => {
      root.style.setProperty('--charge', c.toFixed(4))
    })
    return () => {
      sceneRef.current = null
      unsub()
      unsubCharge()
      scene.dispose()
    }
  }, [])

  // Lock gate — scroll is disabled until the engine is activated. Once
  // locked we resume Lenis smooth scroll and restore body overflow. This
  // forces the user to engage with the seal before progressing — no
  // silent walk-past of the central interaction.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    // Always begin at the hero. Paired with history.scrollRestoration='manual'
    // (main.tsx), this guarantees the hold-ritual runs from the top on every
    // load — a refresh deeper in the page can't strand the visitor at a scroll
    // offset while the engine is still un-locked.
    window.scrollTo(0, 0)
    // Glide: longer duration + a touch less wheel travel per notch so the
    // transition reads as a flowing scrub, not a couple of jumpy notches.
    const lenis = new Lenis({
      anchors: true,
      duration: 1.5,
      wheelMultiplier: 0.85,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
    })
    lenis.stop()
    lenisRef.current = lenis
    let raf = 0
    const tick = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
      lenisRef.current = null
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    if (!locked) return
    document.body.style.overflow = ''
    lenisRef.current?.start()
  }, [locked])

  // Mouse parallax — sets --mx / --my (-0.5 .. 0.5) on document root. The
  // inscription wrap reads these via CSS `translate` to drift opposite the
  // cursor. We smooth and quantize here so rapid mousemove bursts do not restart
  // CSS transitions every frame while the GL scene is also rotating.
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    let targetMx = 0;
    let targetMy = 0;
    let curMx = 0;
    let curMy = 0;
    let lastMx = 0;
    let lastMy = 0;
    const flush = () => {
      curMx += (targetMx - curMx) * 0.12;
      curMy += (targetMy - curMy) * 0.12;
      if (Math.abs(curMx - lastMx) > 0.003 || Math.abs(curMy - lastMy) > 0.003) {
        lastMx = curMx;
        lastMy = curMy;
        root.style.setProperty('--mx', curMx.toFixed(3));
        root.style.setProperty('--my', curMy.toFixed(3));
      }
      if (Math.abs(targetMx - curMx) > 0.004 || Math.abs(targetMy - curMy) > 0.004) {
        raf = requestAnimationFrame(flush);
      } else {
        raf = 0;
      }
    };
    const onMove = (e: MouseEvent) => {
      targetMx = (e.clientX / window.innerWidth) - 0.5;
      targetMy = (e.clientY / window.innerHeight) - 0.5;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      targetMx = 0;
      targetMy = 0;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Scroll-driven scene state — hero→about progress AND the travelling-seal
  // journey — computed in ONE rAF-coalesced pass. These used to be two separate
  // window 'scroll' listeners, each doing synchronous layout reads (the journey
  // one re-ran querySelectorAll + getBoundingClientRect over every text block on
  // EVERY scroll event). Lenis fires scroll densely, so that was many forced
  // reflows per frame contending with the WebGL loop — the stutter felt while
  // the seal rotates from about→work. Now scroll just flags a frame; we read
  // layout at most once per rAF, and the text-block list is cached (refreshed on
  // resize) instead of re-queried each time.
  useEffect(() => {
    const root = document.documentElement;

    const setProgress = (p: number) => {
      const clamped = Math.max(0, Math.min(1, p));
      progressStore.value = clamped;
      // Vault-dark is the default room now — the seal lives in it from frame
      // one, no hero→about transition. --dim stays pinned at 1 so every
      // element that keys off it (fg, accent, hairlines) reads as vault-state
      // immediately. --p still tracks scroll for the about-content reveal
      // (inscription hairline, noise/vignette fade).
      sceneRef.current?.setProgress(clamped);
      root.style.setProperty('--p', clamped.toFixed(4));
      root.style.setProperty('--dim', '1');
    };

    // Transition spans HERO_SPAN screens of scroll (the .hero-section height in
    // index.css must match). p = 0 when about top is HERO_SPAN viewports below;
    // p = 1 when about top hits scroll top. Longer span = slower, flowing reveal.
    const HERO_SPAN = 2.4;
    const computeProgress = () => {
      const about = document.getElementById('about');
      if (!about) return;
      const vh = window.innerHeight;
      const rect = about.getBoundingClientRect();
      const p = 1 - rect.top / (HERO_SPAN * vh);
      setProgress(p);
    };

    // Travelling seal (spec 2026-06-10): the route moves through the empty
    // spaces in each section. App interpolates section keyframes from scroll
    // position; glScene smooths the target per frame.
    type Key = { id: string; x: number; y: number; s: number; o: number; r: number };
    const KEYS: Key[] = [
      { id: 'hero', x: 50, y: 50, s: 1.00, o: 1.00, r: 0 },
      { id: 'about', x: 61, y: 42, s: 0.66, o: 0.50, r: 40 },
      { id: 'skills', x: 60, y: 52, s: 0.85, o: 0.38, r: 85 },
      { id: 'work', x: 30, y: 50, s: 1.05, o: 0.95, r: 130 },
      // Contact: the seal settles in the open air above the closing line —
      // large and present for the farewell, not shrunk into the footer.
      { id: 'contact', x: 52, y: 42, s: 0.88, o: 0.85, r: 170 },
    ];
    const KEYS_MOBILE: Key[] = [
      { id: 'hero', x: 50, y: 50, s: 1.00, o: 1.00, r: 0 },
      { id: 'about', x: 50, y: 24, s: 0.62, o: 0.10, r: 40 },
      { id: 'skills', x: 115, y: 42, s: 0.72, o: 0.02, r: 85 },
      { id: 'work', x: 50, y: 18, s: 0.65, o: 0.65, r: 130 },
      { id: 'contact', x: 90, y: 85, s: 0.32, o: 0.04, r: 170 },
    ];
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    // The keyframe `o` is the brightness when the seal sits UNDER text; in
    // open space it stays at full glow. Measured live against the text blocks
    // on screen, so dimming only happens where the core would wash copy out —
    // not on the empty stretches of the route.
    const TEXT_BLOCKS =
      '.inscription, .practice-aside, .craft-band__name, .craft-band__desc, ' +
      '.craft-band__tags, .work-info, .channel-headline, .channel-panel, .section-eyebrow';
    // Cached node list — these sections mount once and never unmount (the in-view
    // class toggles in place), so re-querying the DOM tree every frame was pure
    // waste. Refresh on resize, where layout can actually change.
    let textBlocks: Element[] = [];
    const refreshTextBlocks = () => {
      textBlocks = Array.from(document.querySelectorAll(TEXT_BLOCKS));
    };
    const dimNearText = (x: number, y: number, s: number, baseO: number) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = (x / 100) * vw;
      const cy = (y / 100) * vh;
      // Bright zone ≈ core + halo + dense root cluster, scales with the dolly.
      const radius = s * vh * 0.3;
      let overlap = 0;
      for (const el of textBlocks) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -40 || r.top > vh + 40 || r.width === 0) continue;
        const dx = Math.max(r.left - cx, 0, cx - r.right);
        const dy = Math.max(r.top - cy, 0, cy - r.bottom);
        overlap = Math.max(overlap, 1 - Math.min(1, Math.hypot(dx, dy) / radius));
        if (overlap >= 1) break;
      }
      return 1 - (1 - baseO) * overlap;
    };

    const computeJourney = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      const mobile = window.innerWidth <= 760;
      const activeKeys = mobile ? KEYS_MOBILE : KEYS;
      const mid = window.innerHeight * (mobile ? 0.12 : 0.5);
      const secs = activeKeys
        .map((k) => ({ k, el: document.getElementById(k.id) }))
        .filter((s): s is { k: Key; el: HTMLElement } => s.el !== null);
      for (let i = 0; i < secs.length; i++) {
        const r = secs[i].el.getBoundingClientRect();
        const next = secs[i + 1];
        if (!next) {
          const k = secs[i].k;
          scene.setJourney(mobile ? k : { ...k, o: dimNearText(k.x, k.y, k.s, k.o) });
          return;
        }
        const nr = next.el.getBoundingClientRect();
        if (r.top <= mid && nr.top > mid) {
          const t = ease(Math.min(1, Math.max(0, (mid - r.top) / (nr.top - r.top))));
          const x = lerp(secs[i].k.x, next.k.x, t);
          const y = lerp(secs[i].k.y, next.k.y, t);
          const s = lerp(secs[i].k.s, next.k.s, t);
          const o = lerp(secs[i].k.o, next.k.o, t);
          scene.setJourney({
            x, y, s,
            o: mobile ? o : dimNearText(x, y, s, o),
            r: lerp(secs[i].k.r, next.k.r, t),
          });
          return;
        }
      }
    };

    // One frame, one batch of layout reads — for both progress and journey.
    let raf = 0;
    const frame = () => {
      raf = 0;
      computeProgress();
      computeJourney();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      refreshTextBlocks();
      schedule();
    };

    refreshTextBlocks();
    setProgress(0);
    computeProgress();
    computeJourney();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      <div ref={stageRef} className="gl-stage" aria-hidden="true" />
      <div className={`edge-void${locked ? ' edge-void--in' : ''}`} aria-hidden="true">
        <span className="edge-void__edge edge-void__edge--top" />
        <span className="edge-void__edge edge-void__edge--bottom" />
        <span className="edge-void__edge edge-void__edge--left" />
        <span className="edge-void__edge edge-void__edge--right" />
      </div>
      {/* Darkness over the space above the navbar — "motion" slides up into it
          and vanishes by occlusion, intact. The ragged lower edge is a baked
          alpha texture, not a live SVG filter. */}
      <div className={`void-ceiling${locked ? ' void-ceiling--in' : ''}`} aria-hidden="true" />
      <Atmosphere />
      <ChargeIndicator locked={locked} />
      <SectionHeader locked={locked} />
      <Signature locked={locked} />
      <Hero locked={locked} />
      <About />
      <Skills />
      <Work />
      <Contact />
      <Navbar locked={locked} />
      <Cursor locked={locked} />
    </>
  )
}

export default App
