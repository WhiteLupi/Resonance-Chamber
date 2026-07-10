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

// Facebook, Google and friends staple a click-id onto every link a visitor
// follows out of their app (?fbclid=IwY2xjawS9…). Nothing here reads them, and
// the canonical tag already collapses them for crawlers — but the address bar
// is part of the composition. Scrub in place: replaceState, never a reload.
const CLICK_IDS = [
  'fbclid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid',
  'ttclid', 'twclid', 'yclid', 'igshid', 'li_fat_id', 'mc_cid', 'mc_eid',
]
const entryUrl = new URL(window.location.href)
if (CLICK_IDS.some((id) => entryUrl.searchParams.has(id))) {
  CLICK_IDS.forEach((id) => entryUrl.searchParams.delete(id))
  history.replaceState(history.state, '', entryUrl.pathname + entryUrl.search + entryUrl.hash)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
