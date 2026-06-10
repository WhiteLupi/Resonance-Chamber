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
  // cursor; CSS transition (0.16s) provides damping so no JS smoothing needed.
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    let nextMx = 0;
    let nextMy = 0;
    const flush = () => {
      raf = 0;
      root.style.setProperty('--mx', nextMx.toFixed(4));
      root.style.setProperty('--my', nextMy.toFixed(4));
    };
    const onMove = (e: MouseEvent) => {
      nextMx = (e.clientX / window.innerWidth) - 0.5;
      nextMy = (e.clientY / window.innerHeight) - 0.5;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      nextMx = 0;
      nextMy = 0;
      if (!raf) {
        root.style.setProperty('--mx', '0');
        root.style.setProperty('--my', '0');
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

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
      // About text emerges by OCCLUSION, not distortion: each line is clipped and
      // its copy rises up from below the mask (see .inscription__copy in
      // about.css). The letters stay whole — the dark simply uncovers them — so
      // there is no scroll-driven warp to drive here anymore.
    };

    // Transition spans HERO_SPAN screens of scroll (the .hero-section height in
    // index.css must match). p = 0 when about top is HERO_SPAN viewports below;
    // p = 1 when about top hits scroll top. Longer span = slower, flowing reveal.
    const HERO_SPAN = 2.4;
    const onScroll = () => {
      const about = document.getElementById('about');
      if (!about) return;
      const vh = window.innerHeight;
      const rect = about.getBoundingClientRect();
      const p = 1 - rect.top / (HERO_SPAN * vh);
      setProgress(p);
    };

    setProgress(0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Travelling seal (spec 2026-06-10): the route moves through the empty
  // spaces in each section. App interpolates section keyframes from scroll
  // position; glScene smooths the target per frame.
  useEffect(() => {
    type Key = { id: string; x: number; y: number; s: number; o: number; r: number };
    const KEYS: Key[] = [
      { id: 'hero', x: 50, y: 50, s: 1.00, o: 1.00, r: 0 },
      { id: 'about', x: 47, y: 38, s: 0.62, o: 0.50, r: 40 },
      { id: 'skills', x: 60, y: 52, s: 0.85, o: 0.38, r: 85 },
      { id: 'work', x: 30, y: 50, s: 1.05, o: 0.95, r: 130 },
      { id: 'contact', x: 52, y: 72, s: 0.52, o: 0.80, r: 170 },
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

    const onScroll = () => {
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
          scene.setJourney(secs[i].k);
          return;
        }
        const nr = next.el.getBoundingClientRect();
        if (r.top <= mid && nr.top > mid) {
          const t = ease(Math.min(1, Math.max(0, (mid - r.top) / (nr.top - r.top))));
          scene.setJourney({
            x: lerp(secs[i].k.x, next.k.x, t),
            y: lerp(secs[i].k.y, next.k.y, t),
            s: lerp(secs[i].k.s, next.k.s, t),
            o: lerp(secs[i].k.o, next.k.o, t),
            r: lerp(secs[i].k.r, next.k.r, t),
          });
          return;
        }
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <>
      <div ref={stageRef} className="gl-stage" aria-hidden="true" />
      {/* Organic warp — feTurbulence displaces the void edges (edge frame +
          ceiling) so the darkness eating the chamber reads as a ragged, alive
          boundary, not a straight cut. The about text is NOT warped: it emerges
          whole, by occlusion (mask + rise), never distorted. */}
      <svg className="defs-only" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id="void-warp" x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.011 0.018" numOctaves="4" seed="11" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="56" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div className={`edge-void${locked ? ' edge-void--in' : ''}`} aria-hidden="true" />
      {/* Darkness over the space above the navbar — "motion" slides up into it
          and vanishes (occlusion, intact), instead of passing through visibly. */}
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
      <Cursor />
    </>
  )
}

export default App
