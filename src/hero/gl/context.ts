export type GLContext = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  floatRender: boolean;
  halfFloatRender: boolean;
};

export class WebGL2NotSupportedError extends Error {
  constructor() {
    super('WebGL2 not supported');
    this.name = 'WebGL2NotSupportedError';
  }
}

export class FloatRenderNotSupportedError extends Error {
  constructor() {
    super('Float render targets not supported');
    this.name = 'FloatRenderNotSupportedError';
  }
}

export function createGLContext(host: HTMLElement): GLContext {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%';
  host.appendChild(canvas);

  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) {
    canvas.remove();
    throw new WebGL2NotSupportedError();
  }

  const floatRender = !!gl.getExtension('EXT_color_buffer_float');
  const halfFloatRender = floatRender || !!gl.getExtension('EXT_color_buffer_half_float');
  if (!halfFloatRender) {
    canvas.remove();
    throw new FloatRenderNotSupportedError();
  }

  gl.getExtension('OES_texture_float_linear');
  gl.getExtension('OES_texture_half_float_linear');

  return { canvas, gl, floatRender, halfFloatRender };
}

export type CanvasSize = { w: number; h: number; dpr: number };

export function sizeCanvas(ctx: GLContext, host: HTMLElement): CanvasSize {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = host.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  ctx.gl.viewport(0, 0, w, h);
  return { w, h, dpr };
}
