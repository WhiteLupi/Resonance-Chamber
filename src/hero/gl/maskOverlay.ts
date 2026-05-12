import { createProgram, getUniformLocations } from './shader';
import type { FullscreenQuad } from './quad';

const VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FS = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_mask;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float m = texture(u_mask, v_uv).r;
  fragColor = vec4(u_color.rgb, u_color.a * m);
}
`;

export type MaskOverlay = {
  render: (mask: WebGLTexture, color: [number, number, number, number]) => void;
  dispose: () => void;
};

export function createMaskOverlay(gl: WebGL2RenderingContext, quad: FullscreenQuad): MaskOverlay {
  const prog = createProgram(gl, VS, FS, 'mask-overlay');
  const u = getUniformLocations(gl, prog, ['u_mask', 'u_color'] as const);
  return {
    render(mask, color) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.uniform1i(u.u_mask, 0);
      gl.uniform4f(u.u_color, color[0], color[1], color[2], color[3]);
      quad.draw();
    },
    dispose() {
      gl.deleteProgram(prog);
    },
  };
}
