import { useEffect, useRef } from 'react'
import { startHero } from './hero/glScene'
import { Hero } from './hero/Hero'
import { Cursor } from './hero/Cursor'

function App() {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    return startHero(stage)
  }, [])

  return (
    <>
      <div ref={stageRef} className="gl-stage" aria-hidden="true" />
      <Hero />
      <section className="placeholder-section" id="about" aria-label="about">
        <span className="placeholder-section__label">ABOUT — coming next</span>
      </section>
      <Cursor />
    </>
  )
}

export default App
