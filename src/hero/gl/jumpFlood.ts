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

const INIT_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_mask;
uniform vec2 u_size;
in vec2 v_uv;
out vec4 outField;
void main() {
  float m = texture(u_mask, vec2(v_uv.x, 1.0 - v_uv.y)).r;
  vec2 pix = v_uv * u_size;
  if (m > 0.45) {
    outField = vec4(pix, 0.0, 1.0);
  } else {
    outField = vec4(-1.0, -1.0, 1.0e9, 0.0);
  }
}
`;

const STEP_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform vec2 u_size;
uniform float u_offset;
in vec2 v_uv;
out vec4 outField;

void main() {
  vec2 pix = v_uv * u_size;
  vec4 best = texture(u_field, v_uv);
  vec2 texel = 1.0 / u_size;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec2 sampleUV = v_uv + vec2(float(dx), float(dy)) * u_offset * texel;
      if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) continue;
      vec4 s = texture(u_field, sampleUV);
      if (s.x < 0.0) continue;
      float d = distance(s.xy, pix);
      if (d < best.z) {
        best = vec4(s.xy, d, s.w);
      }
    }
  }
  if (best.x >= 0.0) {
    best.w = best.z < 0.5 ? 1.0 : 0.0;
  }
  outField = best;
}
`;

export type AttractorField = {
  texture: WebGLTexture;
  width: number;
  height: number;
  dispose: () => void;
};

export type JumpFloodBuilder = {
  build: (mask: WebGLTexture, w: number, h: number) => AttractorField;
  dispose: () => void;
};

export function createJumpFloodBuilder(
  gl: WebGL2RenderingContext,
  quad: FullscreenQuad,
  floatRender: boolean,
): JumpFloodBuilder {
  const initProg = createProgram(gl, VS, INIT_FS, 'jfa-init');
  const stepProg = createProgram(gl, VS, STEP_FS, 'jfa-step');
  const initU = getUniformLocations(gl, initProg, ['u_mask', 'u_size'] as const);
  const stepU = getUniformLocations(gl, stepProg, ['u_field', 'u_size', 'u_offset'] as const);

  const internalFormat = floatRender ? gl.RGBA32F : gl.RGBA16F;
  const dataType = floatRender ? gl.FLOAT : gl.HALF_FLOAT;

  const makeTex = (w: number, h: number): WebGLTexture => {
    const t = gl.createTexture();
    if (!t) throw new Error('createTexture failed (jfa)');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, gl.RGBA, dataType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  const makeFBO = (tex: WebGLTexture): WebGLFramebuffer => {
    const f = gl.createFramebuffer();
    if (!f) throw new Error('createFramebuffer failed (jfa)');
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  };

  return {
    build(mask, w, h) {
      const texA = makeTex(w, h);
      const texB = makeTex(w, h);
      const fboA = makeFBO(texA);
      const fboB = makeFBO(texB);

      gl.disable(gl.BLEND);
      gl.viewport(0, 0, w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      gl.useProgram(initProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.uniform1i(initU.u_mask, 0);
      gl.uniform2f(initU.u_size, w, h);
      quad.draw();

      let readTex = texA;
      let writeFBO = fboB;
      let writeTex = texB;
      let readFBO = fboA;

      const maxDim = Math.max(w, h);
      let offset = 1;
      while (offset * 2 < maxDim) offset *= 2;

      gl.useProgram(stepProg);
      gl.uniform2f(stepU.u_size, w, h);

      while (offset >= 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(stepU.u_field, 0);
        gl.uniform1f(stepU.u_offset, offset);
        quad.draw();

        const tmpTex = readTex; readTex = writeTex; writeTex = tmpTex;
        const tmpFBO = readFBO; readFBO = writeFBO; writeFBO = tmpFBO;
        offset = Math.floor(offset / 2);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.deleteFramebuffer(writeFBO);
      gl.deleteTexture(writeTex);

      return {
        texture: readTex,
        width: w,
        height: h,
        dispose() {
          gl.deleteTexture(readTex);
          gl.deleteFramebuffer(readFBO);
        },
      };
    },
    dispose() {
      gl.deleteProgram(initProg);
      gl.deleteProgram(stepProg);
    },
  };
}
