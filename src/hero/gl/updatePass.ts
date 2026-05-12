import { createProgram, getUniformLocations } from './shader';
import type { FullscreenQuad } from './quad';
import type { ParticleState } from './state';

const VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FS = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_posTex;
uniform sampler2D u_velTex;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dt;
uniform float u_windSpeed;
uniform float u_curlAmp;
uniform float u_curlAmpBg;
uniform float u_curlScale;
uniform float u_curlTimeScale;
uniform float u_approachDuration;
uniform float u_settleBreath;
uniform float u_spawnOffsetX;
uniform float u_waveAmp;
uniform int u_gridSize;

layout(location=0) out vec4 outPos;
layout(location=1) out vec4 outVel;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 curl2D(vec2 p) {
  const float eps = 0.6;
  float ny1 = valueNoise(p + vec2(0.0, eps));
  float ny0 = valueNoise(p + vec2(0.0, -eps));
  float nx1 = valueNoise(p + vec2(eps, 0.0));
  float nx0 = valueNoise(p + vec2(-eps, 0.0));
  return vec2(ny1 - ny0, -(nx1 - nx0)) / (2.0 * eps);
}

// Group 0 (primary, top-left): three entry channels from bottom/bottom-left/left,
//                                control center-right → bulge right
// Group 1 (signature, bottom-right): three entry channels from top/top-right/right,
//                                     control center-left → bulge left
void groupTrajectory(int group, vec2 cellHash, vec2 target, out vec2 startPos, out vec2 controlPos) {
  float hX = hash21(cellHash);
  float hY = hash21(cellHash * 1.7 + 3.7);
  float hC = hash21(cellHash * 0.91 + 11.3);
  float channel = hash21(cellHash * 2.3 + 7.7);

  if (group == 0) {
    if (channel < 0.40) {
      // bottom edge — wide horizontal span
      startPos = vec2(
        mix(0.05, 0.70, hX) * u_resolution.x,
        u_resolution.y + 80.0 + hY * 380.0
      );
    } else if (channel < 0.75) {
      // bottom-left diagonal — pushed further out
      startPos = vec2(
        u_resolution.x * mix(-0.10, 0.15, hX) - u_spawnOffsetX * 0.4,
        u_resolution.y * mix(0.70, 1.20, hY) + 100.0
      );
    } else {
      // left edge — lower half
      startPos = vec2(
        -60.0 - hX * u_spawnOffsetX,
        mix(0.55, 1.00, hY) * u_resolution.y
      );
    }
    controlPos = vec2(
      mix(0.55, 0.88, hC) * u_resolution.x,
      mix(0.25, 0.60, hY) * u_resolution.y
    );
  } else {
    if (channel < 0.40) {
      startPos = vec2(
        mix(0.30, 0.95, hX) * u_resolution.x,
        -80.0 - hY * 380.0
      );
    } else if (channel < 0.75) {
      startPos = vec2(
        u_resolution.x * mix(0.85, 1.10, hX) + u_spawnOffsetX * 0.4,
        -160.0 - hY * 280.0
      );
    } else {
      startPos = vec2(
        u_resolution.x + 60.0 + hX * u_spawnOffsetX,
        mix(-40.0, 0.35 * u_resolution.y, hY)
      );
    }
    controlPos = vec2(
      mix(0.12, 0.42, hC) * u_resolution.x,
      mix(0.40, 0.75, hY) * u_resolution.y
    );
  }
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 pos = texelFetch(u_posTex, cell, 0);
  vec4 vel = texelFetch(u_velTex, cell, 0);

  vec2 target = pos.zw;
  float spawnTime = vel.x;
  int group = int(vel.z + 0.5);
  bool isDirected = spawnTime >= -0.5;

  vec2 cellHash = vec2(cell) * 0.137;
  float age = u_time - spawnTime;
  vec2 newPos = pos.xy;

  if (isDirected) {
    vec2 startPos, controlPos;
    groupTrajectory(group, cellHash, target, startPos, controlPos);

    if (age < 0.0) {
      newPos = startPos;
    } else {
      float t = clamp(age / u_approachDuration, 0.0, 1.0);
      // both groups: ease-in-out (lazy start, fast middle, slow landing)
      float ease = t * t * (3.0 - 2.0 * t);

      // quadratic Bezier
      float oneMinusE = 1.0 - ease;
      vec2 basePos = oneMinusE * oneMinusE * startPos
                   + 2.0 * oneMinusE * ease * controlPos
                   + ease * ease * target;

      // perpendicular sine oscillation — bell envelope (peak mid-flight)
      // applies to both groups now
      vec2 dirToTarget = normalize(target - startPos + vec2(0.0001));
      vec2 perp = vec2(-dirToTarget.y, dirToTarget.x);
      float wavePhase = hash21(cellHash * 1.3 + 5.1) * 6.2831853;
      float bell = 4.0 * ease * (1.0 - ease);
      float wave = sin(ease * 9.42 + wavePhase) * u_waveAmp * bell;
      basePos += perp * wave;

      // curl perturbation, fades to zero as particle approaches target
      vec2 curl = curl2D(basePos * u_curlScale + vec2(u_time * u_curlTimeScale, u_time * u_curlTimeScale * 0.7));
      float curlMag = (1.0 - t) * (1.0 - t) * u_curlAmp;
      basePos += curl * curlMag;

      if (t >= 1.0) {
        if (group == 0) {
          // primary (Rubik Glitch): continuous drift + sharp double-pulse glitch
          float idHash2 = hash21(cellHash * 1.7 + 4.3);
          float dirT = u_time * 0.28 + idHash2 * 6.2831853;
          vec2 driftDir = vec2(cos(dirT), sin(dirT));
          vec2 drift = driftDir * u_settleBreath * 0.06;

          float cyclePeriod = 7.0;
          float gPhase = mod(u_time, cyclePeriod) / cyclePeriod;
          float p1 = step(0.0, gPhase) - step(0.007, gPhase);
          float p2 = step(0.014, gPhase) - step(0.019, gPhase);
          float glitchPulse = p1 + p2;

          float row = floor(target.y / 16.0);
          float seed = floor(u_time * 14.0);
          float rowHash = hash21(vec2(row * 0.83, seed));
          float horizShift = (rowHash - 0.5) * u_settleBreath * 1.3;
          float perJitter = (hash21(cellHash + vec2(seed)) - 0.5) * 0.18 * u_settleBreath;

          basePos = target + drift + vec2(horizShift + perJitter, 0.0) * glitchPulse;
        } else {
          // signature (Bungee): completely static — no drift, no glitch
          basePos = target;
        }
      }
      newPos = basePos;
    }
  } else {
    // ambient dust — minimal motion, brownian-ish
    vec2 curl = curl2D(pos.xy * u_curlScale + vec2(u_time * u_curlTimeScale * 0.5, u_time * 0.11));
    float personalGust = 0.6 + 0.6 * hash21(cellHash);
    vec2 v = vec2(-u_windSpeed * personalGust, 0.0) + curl * u_curlAmpBg;
    newPos = pos.xy + v * u_dt;
    if (newPos.x < -20.0 || newPos.y < -40.0 || newPos.y > u_resolution.y + 40.0) {
      vec2 r = hash22(vec2(cell) + vec2(u_time * 37.13, u_time * 71.7));
      newPos.x = u_resolution.x + 20.0 + r.x * 80.0;
      newPos.y = r.y * u_resolution.y;
    }
  }

  outPos = vec4(newPos, target);
  outVel = vel;
}
`;

export type UpdateParams = {
  dt: number;
  time: number;
  resolution: { w: number; h: number };
  windSpeed: number;
  curlAmp: number;
  curlAmpBg: number;
  curlScale: number;
  curlTimeScale: number;
  approachDuration: number;
  settleBreath: number;
  spawnOffsetX: number;
  waveAmp: number;
};

export type UpdatePass = {
  run: (params: UpdateParams) => void;
  dispose: () => void;
};

export function createUpdatePass(
  gl: WebGL2RenderingContext,
  state: ParticleState,
  quad: FullscreenQuad,
): UpdatePass {
  const prog = createProgram(gl, VS, FS, 'particle-update');
  const u = getUniformLocations(gl, prog, [
    'u_posTex',
    'u_velTex',
    'u_resolution',
    'u_time',
    'u_dt',
    'u_windSpeed',
    'u_curlAmp',
    'u_curlAmpBg',
    'u_curlScale',
    'u_curlTimeScale',
    'u_approachDuration',
    'u_settleBreath',
    'u_spawnOffsetX',
    'u_waveAmp',
    'u_gridSize',
  ] as const);

  return {
    run(p) {
      gl.disable(gl.BLEND);
      state.bindWriteFBO();
      gl.useProgram(prog);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.readPosTex());
      gl.uniform1i(u.u_posTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, state.readVelTex());
      gl.uniform1i(u.u_velTex, 1);

      gl.uniform2f(u.u_resolution, p.resolution.w, p.resolution.h);
      gl.uniform1f(u.u_time, p.time);
      gl.uniform1f(u.u_dt, p.dt);
      gl.uniform1f(u.u_windSpeed, p.windSpeed);
      gl.uniform1f(u.u_curlAmp, p.curlAmp);
      gl.uniform1f(u.u_curlAmpBg, p.curlAmpBg);
      gl.uniform1f(u.u_curlScale, p.curlScale);
      gl.uniform1f(u.u_curlTimeScale, p.curlTimeScale);
      gl.uniform1f(u.u_approachDuration, p.approachDuration);
      gl.uniform1f(u.u_settleBreath, p.settleBreath);
      gl.uniform1f(u.u_spawnOffsetX, p.spawnOffsetX);
      gl.uniform1f(u.u_waveAmp, p.waveAmp);
      gl.uniform1i(u.u_gridSize, state.gridSize);

      quad.draw();

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      state.swap();
    },
    dispose() {
      gl.deleteProgram(prog);
    },
  };
}
