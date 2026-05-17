import { createProgram, getUniformLocations } from './shader';
import type { ParticleState } from './state';

const VS = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_posTex;
uniform sampler2D u_velTex;
uniform vec2 u_resolution;
uniform float u_pointSize;
uniform float u_time;
uniform float u_fadeIn;
uniform float u_scrollProgress; // 0 at hero, 1 at about. Drives the scroll-out fade.
uniform int u_gridSize;

out float v_alpha;
out float v_kind;   // 0 = ambient, 1 = primary, 2 = signature
out float v_shade;  // per-particle brightness 0..1 (only used for primary)

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

void main() {
  int idx = gl_VertexID;
  int gx = idx % u_gridSize;
  int gy = idx / u_gridSize;
  vec4 pos = texelFetch(u_posTex, ivec2(gx, gy), 0);
  vec4 vel = texelFetch(u_velTex, ivec2(gx, gy), 0);

  float spawnTime = vel.x;
  float hasTarget = spawnTime >= -0.5 ? 1.0 : 0.0;
  float groupId = vel.z;
  float age = u_time - spawnTime;
  float fadeIn = clamp(age / u_fadeIn, 0.0, 1.0);

  v_kind = hasTarget < 0.5 ? 0.0 : (groupId < 0.5 ? 1.0 : 2.0);
  v_shade = hash11(float(idx) * 0.137);

  // Scroll-driven fade. Ambient leaves first (0.0→0.4), slogan+signature
  // fade in the middle (0.4→0.85).
  float ambientFade  = 1.0 - smoothstep(0.0, 0.4,  u_scrollProgress);
  float directedFade = 1.0 - smoothstep(0.4, 0.85, u_scrollProgress);
  float scrollFade = v_kind < 0.5 ? ambientFade : directedFade;

  v_alpha = (age < 0.0 ? 0.0 : fadeIn) * scrollFade;

  vec2 ndc = (pos.xy / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);

  // primary slightly smaller to keep grain feel; signature solid; ambient between.
  float sizeMul = v_kind < 0.5 ? 0.85 : (v_kind < 1.5 ? 0.92 : 1.0);
  gl_PointSize = u_pointSize * sizeMul;
}
`;

const FS = /* glsl */ `#version 300 es
precision highp float;

in float v_alpha;
in float v_kind;
in float v_shade;
out vec4 fragColor;

void main() {
  if (v_alpha <= 0.001) discard;
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float edge = smoothstep(0.25, 0.18, r2);

  // single dark fill across all groups — clean ancient-stone particles, no CRT grain.
  float baseAlpha =
    v_kind < 0.5 ? 0.45 :
    v_kind < 1.5 ? 0.9 :
                   0.92;

  fragColor = vec4(0.078, 0.078, 0.078, edge * baseAlpha * v_alpha);
}
`;

export type ParticleRenderer = {
  render: (
    state: ParticleState,
    time: number,
    resolution: { w: number; h: number; dpr: number },
    fadeIn: number,
    scrollProgress: number,
  ) => void;
  dispose: () => void;
};

export function createParticleRenderer(gl: WebGL2RenderingContext): ParticleRenderer {
  const prog = createProgram(gl, VS, FS, 'particle-render');
  const u = getUniformLocations(gl, prog, [
    'u_posTex',
    'u_velTex',
    'u_resolution',
    'u_pointSize',
    'u_time',
    'u_fadeIn',
    'u_scrollProgress',
    'u_gridSize',
  ] as const);
  const vao = gl.createVertexArray();

  return {
    render(state, time, { w, h, dpr }, fadeIn, scrollProgress) {
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.readPosTex());
      gl.uniform1i(u.u_posTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, state.readVelTex());
      gl.uniform1i(u.u_velTex, 1);

      gl.uniform2f(u.u_resolution, w, h);
      gl.uniform1f(u.u_pointSize, Math.max(2, 2.2 * dpr));
      gl.uniform1f(u.u_time, time);
      gl.uniform1f(u.u_fadeIn, fadeIn);
      gl.uniform1f(u.u_scrollProgress, scrollProgress);
      gl.uniform1i(u.u_gridSize, state.gridSize);

      gl.drawArrays(gl.POINTS, 0, state.count);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    },
  };
}
