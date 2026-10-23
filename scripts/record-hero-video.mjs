// Records the phone hero clips from the live scene, frame by frame on a virtual
// clock, so the video matches the 3D version exactly and no frame is dropped.
//
//   npm run build && npx vite preview --port 4173 &
//   PW=/path/to/playwright-core/index.mjs node scripts/record-hero-video.mjs
//
// Writes public/hero/{poster.jpg,grow.mp4,loop.mp4} and prints the hold and
// lock times that src/hero/HeroVideo.tsx needs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(process.env.PW ?? 'playwright-core');

// ?hero-3d keeps the live scene at phone width instead of these very clips.
const URL = process.env.URL ?? 'http://localhost:4173/?hero-3d';
const FPS = 30;
const LEAD_S = 0.2;
const SETTLE_S = 3.0;
const LOOP_S = 8.0;
const SEAM_S = 1.0;
const OUT = 'public/hero';
const FRAMES = '.hero-frames';

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

// The scene reads time only through performance.now and rAF; owning both makes
// every frame exactly 1/FPS apart regardless of how long capture takes.
await page.addInitScript((fps) => {
  let now = 0;
  let nextId = 1;
  let queue = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { queue.set(nextId, cb); return nextId++; };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  window.__step = () => {
    now += 1000 / fps;
    const run = queue;
    queue = new Map();
    for (const cb of run.values()) cb(now);
    return document.querySelector('canvas').toDataURL('image/png');
  };
  window.__locked = () => !!document.querySelector('.hero-section--revealed');
}, FPS);

await page.goto(URL);
// Real time for shader compile and the veins worker.
await page.waitForTimeout(3000);

let frame = 0;
const shoot = async () => {
  const data = await page.evaluate(() => window.__step());
  writeFileSync(join(FRAMES, `f${String(frame).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
  frame += 1;
};

for (let i = 0; i < LEAD_S * FPS; i++) await shoot();
await page.mouse.move(195, 422);
await page.mouse.down();
while (!(await page.evaluate(() => window.__locked()))) await shoot();
const lockFrame = frame;
await page.mouse.up();
for (let i = 0; i < SETTLE_S * FPS; i++) await shoot();
const growFrames = frame;
for (let i = 0; i < LOOP_S * FPS; i++) await shoot();
await browser.close();

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];
const seq = (start) => ['-framerate', String(FPS), '-start_number', String(start), '-i', join(FRAMES, 'f%04d.png')];
const seam = SEAM_S * FPS;

ff(['-i', join(FRAMES, 'f0000.png'), '-q:v', '3', join(OUT, 'poster.jpg')]);
ff([...seq(0), '-frames:v', String(growFrames), ...x264, join(OUT, 'grow.mp4')]);
// The loop opens on the frame after grow's last and fades its tail into grow's
// final second, so grow → loop and loop → loop are both seamless.
ff([
  ...seq(growFrames),
  ...seq(growFrames - seam),
  '-filter_complex',
  `[0]trim=end_frame=${LOOP_S * FPS},setpts=PTS-STARTPTS[a];` +
  `[1]trim=end_frame=${seam},setpts=PTS-STARTPTS[b];` +
  `[a][b]xfade=transition=fade:duration=${SEAM_S}:offset=${LOOP_S - SEAM_S}`,
  ...x264, join(OUT, 'loop.mp4'),
]);
rmSync(FRAMES, { recursive: true, force: true });

console.log(`HOLD_AT_S = ${LEAD_S}; LOCK_AT_S = ${(lockFrame / FPS).toFixed(3)}; grow ${(growFrames / FPS).toFixed(2)} s`);
