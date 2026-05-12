export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
  label: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error(`createShader failed (${label})`);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? 'unknown';
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed (${label}):\n${log}\n--- source ---\n${numberLines(src)}`);
  }
  return sh;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  label: string,
  transformFeedbackVaryings?: { names: string[]; mode: number },
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, `${label}.vs`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, `${label}.fs`);
  const prog = gl.createProgram();
  if (!prog) throw new Error(`createProgram failed (${label})`);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (transformFeedbackVaryings) {
    gl.transformFeedbackVaryings(prog, transformFeedbackVaryings.names, transformFeedbackVaryings.mode);
  }
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? 'unknown';
    gl.deleteProgram(prog);
    throw new Error(`Program link failed (${label}):\n${log}`);
  }
  return prog;
}

export function getUniformLocations<T extends string>(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  names: readonly T[],
): Record<T, WebGLUniformLocation | null> {
  const out = {} as Record<T, WebGLUniformLocation | null>;
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

function numberLines(src: string): string {
  return src
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(3, ' ')} | ${line}`)
    .join('\n');
}
