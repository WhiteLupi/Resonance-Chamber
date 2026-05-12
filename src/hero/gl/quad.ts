export type FullscreenQuad = {
  draw: () => void;
  dispose: () => void;
};

export function createFullscreenQuad(gl: WebGL2RenderingContext): FullscreenQuad {
  const vbo = gl.createBuffer();
  if (!vbo) throw new Error('createBuffer failed (fullscreen quad)');
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const vao = gl.createVertexArray();
  if (!vao) throw new Error('createVertexArray failed (fullscreen quad)');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return {
    draw() {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    },
  };
}
