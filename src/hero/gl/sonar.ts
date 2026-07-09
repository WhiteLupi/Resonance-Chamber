import * as THREE from 'three';
import { ACCENT } from './constants';

// Sonar rings — periodic outward pulses from the seal, signalling the
// engine is broadcasting. Wide screens have lots of horizontal space and
// these radial rings carry energy across it, giving the composition a
// rhythmic heartbeat instead of a static centerpiece.

// Pool sized generously so rapid clicks don't force a visible recycle. If
// the user does manage to fill the pool, we recycle the LEAST VISIBLE ring
// (lowest current opacity) instead of the oldest by time — the user
// notices ring-resets least when the swapped ring was already fading out.
const RING_COUNT = 10;
// Longer travel + bigger max scale so pulses reach viewport edges and
// beyond — they dissolve into the walls of the room.
const RING_DURATION = 9.0;
const RING_MIN_SCALE = 0.5;
const RING_MAX_SCALE = 13.0;

type Ring = {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  active: boolean;
  startT: number;
};

export function createSonarRings(enabled: boolean, parent: THREE.Object3D) {
  let ringTex: THREE.CanvasTexture | null = null;
  const rings: Ring[] = [];

  if (enabled) {
    const ac = new THREE.Color(ACCENT);
    const acR = (ac.r * 255) | 0, acG = (ac.g * 255) | 0, acB = (ac.b * 255) | 0;
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = ringCanvas.height = 256;
    const rctx = ringCanvas.getContext('2d')!;
    // Build an additive ring texture: transparent center, thin bright ring at
    // the edge, soft outer falloff.
    const rGrad = rctx.createRadialGradient(128, 128, 80, 128, 128, 128);
    rGrad.addColorStop(0,    `rgba(0,0,0,0)`);
    rGrad.addColorStop(0.70, `rgba(0,0,0,0)`);
    rGrad.addColorStop(0.86, `rgba(${acR},${acG},${acB},0.30)`);
    rGrad.addColorStop(0.94, `rgba(${acR},${acG},${acB},0.80)`);
    rGrad.addColorStop(0.98, `rgba(${acR},${acG},${acB},0.35)`);
    rGrad.addColorStop(1,    `rgba(0,0,0,0)`);
    rctx.fillStyle = rGrad;
    rctx.fillRect(0, 0, 256, 256);
    ringTex = new THREE.CanvasTexture(ringCanvas);

    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({
        map: ringTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(RING_MIN_SCALE);
      parent.add(sprite);
      rings.push({ sprite, mat, active: false, startT: 0 });
    }
  }

  // Fire one ring outward. Recycle by LOWEST current opacity instead of by
  // age — the ring that disappears is the least visible one, so resets are
  // not perceptible. Called on mousedown and once on engine lock; not on a
  // timer.
  const trigger = (now: number) => {
    if (!enabled) return;
    let target = rings.find(r => !r.active);
    if (!target) {
      target = rings.reduce((a, b) => a.mat.opacity < b.mat.opacity ? a : b);
    }
    target.active = true;
    target.startT = now;
  };

  // Each pulse is a discrete event (mousedown / lock), not a metronome. Idle
  // rings sit at opacity 0; active rings expand outward and fade over
  // RING_DURATION seconds, then return to idle.
  const update = (t: number, breath: number, opacityMul: number) => {
    for (const r of rings) {
      if (!r.active) {
        r.mat.opacity = 0;
        continue;
      }
      const local = (t - r.startT) / RING_DURATION;
      if (local >= 1) {
        r.active = false;
        r.mat.opacity = 0;
        continue;
      }
      const scale = RING_MIN_SCALE + local * (RING_MAX_SCALE - RING_MIN_SCALE);
      r.sprite.scale.setScalar(scale * breath);
      // Heartbeat ease — rises fast (peak around 8%), then long lingering
      // tail (pow 0.7 = slow drift to 0 instead of a steep drop near end).
      // The pulse "dissolves into the walls" rather than blinking out.
      const rise = Math.min(1, local / 0.08);
      const fall = Math.pow(1 - Math.max(0, (local - 0.08) / 0.92), 0.7);
      r.mat.opacity = rise * fall * 0.55 * opacityMul;
    }
  };

  const dispose = () => {
    for (const r of rings) r.mat.dispose();
    ringTex?.dispose();
  };

  return { trigger, update, dispose };
}
