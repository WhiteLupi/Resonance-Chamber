import { createProgram, getUniformLocations } from './shader';
import type { FullscreenQuad } from './quad';

const VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FS = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_field;
uniform float u_ringSpacing;
uniform float u_maxDist;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 f = texture(u_field, v_uv);
  float d = f.z;
  float inside = f.w;
  if (inside > 0.5) {
    fragColor = vec4(0.05, 0.45, 0.8, 0.45);
    return;
  }
  float t = clamp(d / u_maxDist, 0.0, 1.0);
  float ring = fract(d / u_ringSpacing);
  vec3 grad = mix(vec3(0.95, 0.25, 0.05), vec3(0.05, 0.15, 0.55), t);
  float a = mix(0.55, 0.05, t) * (0.55 + 0.45 * ring);
  fragColor = vec4(grad, a);
}
`;

export type FieldOverlay = {
  render: (field: WebGLTexture, ringSpacing: number, maxDist: number) => void;
  dispose: () => void;
};

export function createFieldOverlay(gl: WebGL2RenderingContext, quad: FullscreenQuad): FieldOverlay {
  const prog = createProgram(gl, VS, FS, 'field-overlay');
  const u = getUniformLocations(gl, prog, ['u_field', 'u_ringSpacing', 'u_maxDist'] as const);
  return {
    render(field, ringSpacing, maxDist) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.uniform1i(u.u_field, 0);
      gl.uniform1f(u.u_ringSpacing, ringSpacing);
      gl.uniform1f(u.u_maxDist, maxDist);
      quad.draw();
    },
    dispose() {
      gl.deleteProgram(prog);
    },
  };
}
