import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The hero hold-ritual is the intended entry on every load. Disable the
// browser's scroll restoration so a refresh mid-page can't drop the visitor
// at a scrolled position with the engine still un-locked (a mismatched, "stuck"
// state). Set here — before render — so it takes effect before the browser
// would otherwise restore. App also scrollTo(0,0)s on mount as a backstop.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
