export type ParticleStateOpts = {
  gridSize: number;
  floatRender: boolean;
  initPos: Float32Array;
  initVel: Float32Array;
};

export type ParticleState = {
  gridSize: number;
  count: number;
  readPosTex: () => WebGLTexture;
  readVelTex: () => WebGLTexture;
  bindWriteFBO: () => void;
  swap: () => void;
  uploadInit: (pos: Float32Array, vel: Float32Array) => void;
  dispose: () => void;
};

export function createParticleState(
  gl: WebGL2RenderingContext,
  opts: ParticleStateOpts,
): ParticleState {
  const { gridSize, floatRender, initPos, initVel } = opts;
  const count = gridSize * gridSize;
  if (initPos.length !== count * 4 || initVel.length !== count * 4) {
    throw new Error(`init arrays must be length ${count * 4}`);
  }

  const internalFormat = floatRender ? gl.RGBA32F : gl.RGBA16F;

  const makeTexture = (initial: Float32Array): WebGLTexture => {
    const tex = gl.createTexture();
    if (!tex) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (floatRender) {
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gridSize, gridSize, 0, gl.RGBA, gl.FLOAT, initial);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gridSize, gridSize, 0, gl.RGBA, gl.FLOAT, initial);
    }
    return tex;
  };

  const posA = makeTexture(initPos);
  const posB = makeTexture(new Float32Array(count * 4));
  const velA = makeTexture(initVel);
  const velB = makeTexture(new Float32Array(count * 4));

  const makeFBO = (posTex: WebGLTexture, velTex: WebGLTexture): WebGLFramebuffer => {
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('createFramebuffer failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, posTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, velTex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`framebuffer incomplete: 0x${status.toString(16)}`);
    }
    return fbo;
  };

  const fboA = makeFBO(posA, velA);
  const fboB = makeFBO(posB, velB);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let readPos = posA;
  let readVel = velA;
  let writePos = posB;
  let writeVel = velB;
  let writeFBO = fboB;

  return {
    gridSize,
    count,
    readPosTex: () => readPos,
    readVelTex: () => readVel,
    bindWriteFBO() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, gridSize, gridSize);
    },
    swap() {
      const tmpPos = readPos; readPos = writePos; writePos = tmpPos;
      const tmpVel = readVel; readVel = writeVel; writeVel = tmpVel;
      writeFBO = writeFBO === fboB ? fboA : fboB;
    },
    uploadInit(pos, vel) {
      if (pos.length !== count * 4 || vel.length !== count * 4) {
        throw new Error(`uploadInit arrays must be length ${count * 4}`);
      }
      gl.bindTexture(gl.TEXTURE_2D, readPos);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridSize, gridSize, gl.RGBA, gl.FLOAT, pos);
      gl.bindTexture(gl.TEXTURE_2D, readVel);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gridSize, gridSize, gl.RGBA, gl.FLOAT, vel);
    },
    dispose() {
      gl.deleteTexture(posA);
      gl.deleteTexture(posB);
      gl.deleteTexture(velA);
      gl.deleteTexture(velB);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
    },
  };
}
