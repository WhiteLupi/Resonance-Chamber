import { useEffect, useRef } from 'react'
import { startHero } from './hero/glScene'
import { Hero } from './hero/Hero'
import { About } from './about/About'
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
      <About />
      <Cursor />
    </>
  )
}

export default App
