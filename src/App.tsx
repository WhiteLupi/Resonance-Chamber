import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import type { HeroScene } from './hero/glScene'
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
import { prefersReducedMotion } from './motion'

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HeroScene | null>(null)
  const [locked, setLocked] = useState(false)
  const [overCore, setOverCore] = useState(false)

  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    // three.js ships in its own chunk, so the page paints before the engine loads.
    // Any path other than / picks a comparison engine (/v2, /a, /b, /c).
    const variant = window.location.pathname.replace(/^\/+|\/+$/g, '')
    const engine = variant
      ? import('./hero/v2/engines').then((m) => m.engineFor(variant))
      : import('./hero/glScene').then((m) => m.startHero)
    let cancelled = false
    let teardown = () => {}
    engine.then((startHero) => {
      if (cancelled) return
      const scene = startHero(stage)
      sceneRef.current = scene
      const unsub = scene.onLock(() => setLocked(true))
      const root = document.documentElement
      const unsubCharge = scene.onCharge((c) => {
        root.style.setProperty('--charge', c.toFixed(4))
      })
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
    if (prefersReducedMotion()) return
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
    // `hold` keeps the seal parked on a key through the first fraction of its
    // outgoing segment — the transition to the NEXT key begins only after
    // that much of the scroll span has passed. Hero uses it for the ritual;
    // work uses it so the seal stays docked left while the case copy is
    // still on screen instead of drifting toward contact from the first
    // scrolled pixel.
    type Key = { id: string; x: number; y: number; s: number; o: number; r: number; hold?: number };
    const KEYS: Key[] = [
      { id: 'hero', x: 50, y: 50, s: 1.00, o: 1.00, r: 0, hold: 0.45 },
      { id: 'about', x: 61, y: 42, s: 0.66, o: 0.50, r: 40 },
      { id: 'skills', x: 60, y: 52, s: 0.85, o: 0.38, r: 85 },
      { id: 'work', x: 30, y: 50, s: 1.05, o: 0.95, r: 130, hold: 0.55 },
      // Contact: the seal settles in the open air above the closing line —
      // large and present for the farewell, not shrunk into the footer.
      { id: 'contact', x: 52, y: 42, s: 0.88, o: 0.85, r: 170 },
    ];
    // The mobile route is a vertical spine — every keyframe sits at x:50. A
    // phone viewport has no side room: any lateral keyframe (the old skills
    // x:115 exit) turns into a visible side-to-side swim between sections.
    // The seal breathes along the centre axis instead: scale, height, glow.
    const KEYS_MOBILE: Key[] = [
      { id: 'hero', x: 50, y: 50, s: 1.00, o: 1.00, r: 0, hold: 0.45 },
      { id: 'about', x: 50, y: 24, s: 0.62, o: 0.10, r: 40 },
      { id: 'skills', x: 50, y: 42, s: 0.72, o: 0.02, r: 85 },
      { id: 'work', x: 50, y: 18, s: 0.65, o: 0.65, r: 130 },
      // The journey ENDS centred above the closing block — on a phone the old
      // exit toward the bottom-right corner read as the seal escaping sideways
      // instead of settling for the farewell.
      { id: 'contact', x: 50, y: 30, s: 0.55, o: 0.60, r: 170 },
    ];
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    // The keyframe `o` is the seal's brightness per section. Legibility over copy
    // comes from the dark pools behind the text, so the seal need not dodge it.
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
          scene.setJourney(secs[i].k);
          return;
        }
        const nr = next.el.getBoundingClientRect();
        if (r.top <= mid && nr.top > mid) {
          let raw = Math.min(1, Math.max(0, (mid - r.top) / (nr.top - r.top)));
          // Mobile has no "hold to charge" indicator and the seal is only a
          // faint backdrop behind the text — so a keyframe hold or a per-segment
          // ease reads as the scroll STICKING, not as intent. On mobile the seal
          // tracks scroll 1:1 (no hold, linear) for uniform motion; desktop keeps
          // the ritual holds and the eased settle between keys.
          const hold = mobile ? 0 : (secs[i].k.hold ?? 0);
          if (hold > 0) {
            raw = Math.max(0, (raw - hold) / (1 - hold));
          }
          const t = mobile ? raw : ease(raw);
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
  }, []);

  return (
    <>
      {/* Machine-readable identity (see .sr-only). The visual layer stays poetic
          and, in About, split per-character for animation; this carries the same
          content as plain prose so search + AI agents can actually read it. */}
      <header className="sr-only">
        <h1>Kasia Walter — Frontend &amp; Motion Engineer</h1>
        <p>
          Frontend and motion engineer. I build the layer you feel before you
          read a word. Something is wrong and nobody can name it yet — that is
          the moment I am for; I go under the surface and fix the structure, not
          the symptom. AI moved the bottleneck from typing to judgement, and
          judgement is the part I am good at.
        </p>
        <p>
          Selected work:{' '}
          <a href="https://www.cuewigs.com" tabIndex={-1}>cuewigs</a> — I wrote
          the frontend: the GSAP implementation, the responsive system, the
          performance. Awwwards Developer Award, February 2024, which Awwwards
          gives to the developer, plus Site of the Day the same month. This site
          — a real-time engine written from scratch in Three.js and
          TypeScript, sharing a render loop with a React app.
        </p>
        <p>
          Four years of production web at Pirxey / Widelab: web developer first,
          motion-led sites in GSAP; React developer since 2024, product apps and
          design systems in code. React, TypeScript, Next.js, Redux Toolkit, RTK
          Query, React Hook Form, Zod, Storybook. Open to frontend and motion
          engineering roles; EU remote, based in Poland.
        </p>
        <p>
          {/* tabIndex -1: these exist for machines; the same links are real,
              visible tab stops in the Contact section. Keeping them out of the
              tab order means the first Tab lands on the HOLD button instead of
              an invisible focus ring. */}
          Contact:{' '}
          <a href="mailto:kasia.walter.it@gmail.com" tabIndex={-1}>kasia.walter.it@gmail.com</a>
          {' · '}
          <a href="https://www.linkedin.com/in/kasia-walter" tabIndex={-1}>LinkedIn</a>
        </p>
      </header>
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
      <main>
        <Hero locked={locked} />
        <About />
        <Skills />
        <Work />
        <Contact />
      </main>
      <Navbar locked={locked} />
      <Cursor locked={locked} overCore={overCore} />
    </>
  )
}

export default App
