import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import { startHero, type HeroScene } from './hero/glScene'
import { Hero } from './hero/Hero'
import { Navbar } from './hero/Navbar'
import { About } from './about/About'
import { Cursor } from './hero/Cursor'
import { Atmosphere } from './hero/Atmosphere'
import { ChargeIndicator } from './hero/ChargeIndicator'
import { progressStore } from './about/dwellStore'

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HeroScene | null>(null)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const scene = startHero(stage)
    sceneRef.current = scene
    const unsub = scene.onLock(() => setLocked(true))
    // Charge feedback — write seal's accumulating energy to a CSS var so the
    // ChargeIndicator's radial arc fills as the user holds the seal. Same
    // mechanism could drive cursor or other UI hints later.
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

  // Lenis owns wheel/touch and lerps document scrollTop. Native scroll events
  // still fire as Lenis animates, so the progress handler below stays correct.
  // `anchors: true` routes navbar #about/#skills/#contact clicks through the
  // same smoothing instead of jumping. Sticky positioning in about-stage keeps
  // working because Lenis animates window scroll, not an internal container.
  useEffect(() => {
    const lenis = new Lenis({ anchors: true })
    let raf = 0
    const tick = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])

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
    };

    const onScroll = () => {
      const about = document.getElementById('about');
      if (!about) return;
      const vh = window.innerHeight;
      // p = 0 when about top is one viewport below scroll top; p = 1 when about top hits scroll top.
      const rect = about.getBoundingClientRect();
      const p = 1 - rect.top / vh;
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
      <Atmosphere />
      <ChargeIndicator locked={locked} />
      <Hero locked={locked} />
      <About />
      <Navbar />
      <Cursor />
    </>
  )
}

export default App
