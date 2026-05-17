// Singleton refs shared between App (writer) and About voices (readers).
// Avoids re-rendering React tree every scroll frame and every dwell tick.
//
// progressStore.value: scroll progress over About section, 0..1 (clamped).
// dwellStore.sec: seconds of continuous "settled" state (p > 0.95). Reset on
// p < 0.7. Driven by the RAF in useDwell.

export const progressStore = { value: 0 };
export const dwellStore = { sec: 0 };
