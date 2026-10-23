import { useCallback, useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import type { HeroScene } from './hero/glScene'
import { Hero } from './hero/Hero'
import { Navbar } from './hero/Navbar'
import { About } from './about/About'
import { Values } from './sections/Values'
import { Contact } from './sections/Contact'
import { Cursor } from './hero/Cursor'
import { ChargeIndicator } from './hero/ChargeIndicator'
import { SectionHeader } from './hero/SectionHeader'
import { Signature } from './hero/Signature'
import { prefersReducedMotion } from './motion'
import { createJourney } from './journey'
import { HeroVideo } from './hero/HeroVideo'
import { videoJourney } from './hero/videoJourney'
import { MOBILE_MAX_W } from './hero/gl/constants'

// Phones play the scene as recorded video: three.js stuttered on iOS. Decided
// once per load, like the layout the clips were recorded in.
const VIDEO_HERO = window.innerWidth <= MOBILE_MAX_W

// three.js ships in its own chunk, so the page paints before the engine loads.
// The download starts as this module runs, alongside React's first render
// instead of after it.
const loadHero = VIDEO_HERO ? null : import('./hero/glScene')

// Written per frame while charging, so only on its two readers: on <html> it
// restyled the whole page every frame and stuttered phones.
let chargeReaders: NodeListOf<HTMLElement> | null = null
const writeCharge = (c: number) => {
  chargeReaders ??= document.querySelectorAll<HTMLElement>('.hero-prompt, .charge-indicator')
  const v = c.toFixed(4)
  for (const el of chargeReaders) el.style.setProperty('--charge', v)
}

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HeroScene | null>(null)
  const [locked, setLocked] = useState(false)
  const [overCore, setOverCore] = useState(false)

  const lenisRef = useRef<Lenis | null>(null)
  const onVideoLock = useCallback(() => setLocked(true), [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !loadHero) return
    let cancelled = false
    let teardown = () => {}
    loadHero.then(({ startHero }) => {
      if (cancelled) return
      const scene = startHero(stage)
      sceneRef.current = scene
      const unsub = scene.onLock(() => setLocked(true))
      const unsubCharge = scene.onCharge(writeCharge)
      const unsubHover = scene.onHover(setOverCore)
      teardown = () => {
        sceneRef.current = null
        unsub()
        unsubCharge()
        unsubHover()
        scene.dispose()
      }
    })
    return () => {
      cancelled = true
      teardown()
    }
  }, [])

  // Lenis lifecycle — created stopped; the lock gate below decides when it
  // runs. Always begin at the hero: paired with scrollRestoration='manual'
  // (main.tsx), this guarantees the hold-ritual runs from the top on every
  // load — a refresh deeper in the page can't strand the visitor at a scroll
  // offset while the engine is still un-locked.
  useEffect(() => {
    window.scrollTo(0, 0)
    // Under reduced motion the browser's own scrolling is the right amount of
    // motion — no Lenis; the gate below still works (start() on null no-ops).
    if (prefersReducedMotion() || VIDEO_HERO) return
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
    }
  }, [])

  // Lock gate — the whole pre-lock input policy in one place. No scroll until
  // the engine is activated: overflow:hidden stops wheel/touch, and since
  // Chromium still lets keyboard scrolling (Space, PageDown, End…) move an
  // overflow-hidden viewport, the gate swallows those keys too. Holding Enter
  // anywhere charges the ritual — the keyboard's version of holding the ball
  // (links keep their Enter). On lock everything opens and Lenis takes over.
  useEffect(() => {
    if (locked) {
      document.body.style.overflow = ''
      lenisRef.current?.start()
      return
    }
    document.body.style.overflow = 'hidden'
    const SCROLL_KEYS = new Set([
      ' ', 'PageDown', 'PageUp', 'End', 'Home', 'ArrowDown', 'ArrowUp',
    ])
    const onKeyDown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) e.preventDefault()
      if (e.key !== 'Enter' || e.repeat) return
      if (document.activeElement instanceof HTMLAnchorElement) return
      sceneRef.current?.holdStart()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Enter') sceneRef.current?.holdEnd()
    }
    const onWindowBlur = () => sceneRef.current?.holdEnd()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [locked])

  // Scroll-driven scene state — hero→about progress and the travelling-seal
  // journey — in one rAF-coalesced pass. Lenis fires scroll densely; reading
  // layout at most once per frame keeps it off the WebGL loop's budget.
  useEffect(() => {
    const root = document.documentElement;

    const setProgress = (p: number) => {
      const clamped = Math.max(0, Math.min(1, p));
      // --p drives the question's rise and the manifesto's reveal in CSS.
      sceneRef.current?.setProgress(clamped);
      root.style.setProperty('--p', clamped.toFixed(4));
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

    const updateJourney = createJourney(locked, VIDEO_HERO)
    const computeJourney = () => {
      const target = VIDEO_HERO ? videoJourney : sceneRef.current
      if (target) updateJourney(target)
    }

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

    setProgress(0);
    computeProgress();
    computeJourney();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
    // Re-run on lock: the hero keyframe moves once the seal is awake.
  }, [locked]);

  return (
    <>
      {/* The page's h1, and the manifesto as plain prose: the visible one is
          split per letter for its glyph swaps and hidden from screen readers.
          Values and the close are real text in their sections. */}
      <header className="sr-only">
        <h1>Kasia Walter — What makes you feel alive?</h1>
        <p>
          To create art is to speak another language. You can't move a heart if
          yours stands still. Feelings matter. To taste, to love, to dream is to
          feel.
        </p>
      </header>
      {VIDEO_HERO
        ? <HeroVideo onCharge={writeCharge} onLock={onVideoLock} />
        : <div ref={stageRef} className="gl-stage" aria-hidden="true" />}
      <ChargeIndicator locked={locked} />
      <SectionHeader locked={locked} />
      <Signature locked={locked} />
      <main>
        <Hero locked={locked} touch={VIDEO_HERO} />
        <About />
        <Values />
        <Contact />
      </main>
      <Navbar locked={locked} />
      <Cursor locked={locked} overCore={overCore} />
    </>
  )
}

export default App
