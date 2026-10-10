# Resonance Chamber

The source of [kasiawalter.it](https://kasiawalter.it): one interactive piece about what I value in making things.
Hold the core to wake it, then scroll through it.

React 19, TypeScript, Vite, three.js, Lenis.

## How it works

- **Veins as a shader.** The vein figure is one static ribbon mesh, built in a Web Worker. Growth, sway, breathing and light waves are all done in the vertex and fragment shaders. Per frame the CPU only updates a handful of uniforms.
- **A journey, not sections.** As you scroll, the seal moves through keyframes for position, scale, rotation, glow and colour (`src/journey.ts`). It travels by moving the camera, so near and far veins move at different speeds (parallax).
- **Click energy.** After the lock each click adds energy that fades over time. It brightens the core and the veins and speeds up the light waves.
- **Frame guard.** It learns the display's refresh rate and lowers the render resolution step by step if frames keep missing it.
- **Readable without JavaScript.** The page text is in the first HTML response as real DOM, for search engines, readers and LLM fetchers. Once the app mounts, React replaces it.
- **Reduced motion and keyboard.** With reduced motion there is no smooth scrolling and no ambient animation. Holding Enter charges the core the same way as holding the pointer.

`?hero-profile=1` publishes frame, CPU and GPU timings on `window.__heroPerf`.

## Structure

- `src/hero/`: the WebGL scene (`glScene.ts`, `gl/*`), the hold ritual, the navbar and the cursor
- `src/about/`: the manifesto and the letter-to-sign swaps
- `src/sections/`: what I keep, and the closing
- `archive/`: an earlier vein variant, kept so it can be brought back

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build && npm run preview   # judge performance on this, not on dev
```
