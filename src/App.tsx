import { useEffect, useRef } from 'react'
import { startHero, type HeroScene } from './hero/glScene'
import { Hero } from './hero/Hero'
import { About } from './about/About'
import { Cursor } from './hero/Cursor'
import { progressStore } from './about/dwellStore'

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HeroScene | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const scene = startHero(stage)
    sceneRef.current = scene
    return () => {
      sceneRef.current = null
      scene.dispose()
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement;

    const setProgress = (p: number) => {
      const clamped = Math.max(0, Math.min(1, p));
      progressStore.value = clamped;
      sceneRef.current?.setProgress(clamped);
      root.style.setProperty('--p', clamped.toFixed(4));
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
      <Hero />
      <About />
      <Cursor />
    </>
  )
}

export default App
