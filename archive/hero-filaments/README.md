# Hero roots — flowing filament field (archived)

Root-system variant for the GPU hero engine: ~2600 hairline filaments bundled
into 14 flowing strands, grown with charge, with an outward light wave on pulse.
Same shape as `createVeins` in `src/hero/gl/veins.ts` (update / applyVisibility /
setViewport / pulse / dispose).

To revive: move both files to `src/hero/gl/`, fix the imports, and swap
`createVeins` for `createFilaments` in `src/hero/glScene.ts`.
