import { Hero } from './hero/Hero'
import { Cursor } from './hero/Cursor'
import { useSnapScroll } from './hero/useSnapScroll'

function App() {
  useSnapScroll();

  return (
    <>
      <Hero />
      <section className="placeholder-section" id="about" aria-label="about">
        <span className="placeholder-section__label">ABOUT — coming next</span>
      </section>
      <Cursor />
    </>
  )
}

export default App
