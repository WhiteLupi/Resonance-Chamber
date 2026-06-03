import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import { startHero, type HeroScene } from './hero/glScene'
import { Hero } from './hero/Hero'
import { Navbar } from './hero/Navbar'
import { About } from './about/About'
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
    const onMove = (e: MouseEvent) => {
      const mx = (e.clientX / window.innerWidth) - 0.5;
      const my = (e.clientY / window.innerHeight) - 0.5;
      root.style.setProperty('--mx', mx.toFixed(4));
      root.style.setProperty('--my', my.toFixed(4));
    };
    const onLeave = () => {
      root.style.setProperty('--mx', '0');
      root.style.setProperty('--my', '0');
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
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
      // Ragged emergence: the about text warps only while it rises out of the
      // void (a bump over p≈0.78–0.96), then settles to scale 0 = clean/readable.
      const up = Math.max(0, Math.min(1, (clamped - 0.76) / 0.08));
      const down = Math.max(0, Math.min(1, (0.97 - clamped) / 0.07));
      document.getElementById('emerge-disp')?.setAttribute('scale', (Math.min(up, down) * 16).toFixed(1));
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

  return (
    <>
      <div ref={stageRef} className="gl-stage" aria-hidden="true" />
      {/* Organic warp — feTurbulence displaces the rising "motion" so its edges
          (and the darkness eating it) read as a ragged, alive boundary, not a
          straight cut. */}
      <svg className="defs-only" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id="void-warp" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.009 0.015" numOctaves="3" seed="11" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="34" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* gentler warp for the about text — its scale is driven by scroll so it
              ruffles only WHILE the words emerge from the void, then settles clean */}
          <filter id="emerge-warp" x="-20%" y="-25%" width="140%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="2" seed="4" result="enoise" />
            <feDisplacementMap id="emerge-disp" in="SourceGraphic" in2="enoise" scale="0" xChannelSelector="R" yChannelSelector="G" />
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
      <Navbar locked={locked} />
      <Cursor />
    </>
  )
}

export default App
