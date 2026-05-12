export type TextAnchor = 'top-left' | 'bottom-right' | 'center';

export type TextMaskOpts = {
  lines: string[];
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  width: number;
  height: number;
  anchor: TextAnchor;
  paddingX: number;
  paddingY: number;
  lineHeight?: number;
  textAlign?: 'left' | 'right' | 'center';
};

export type TextMask = {
  texture: WebGLTexture;
  width: number;
  height: number;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  alpha: Uint8Array;
  dispose: () => void;
};

export function buildTextMask(gl: WebGL2RenderingContext, opts: TextMaskOpts): TextMask {
  const {
    lines,
    fontFamily,
    fontWeight,
    fontSize,
    width,
    height,
    anchor,
    paddingX,
    paddingY,
    lineHeight = 1.0,
  } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');

  ctx.fillStyle = '#fff';
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  const lineGap = fontSize * lineHeight;
  const totalH = lineGap * lines.length;

  let xAnchor: number;
  let yStart: number;
  let align: CanvasTextAlign;

  if (anchor === 'top-left') {
    align = opts.textAlign ?? 'left';
    xAnchor = align === 'right' ? paddingX : paddingX;
    ctx.textBaseline = 'top';
    yStart = paddingY;
  } else if (anchor === 'bottom-right') {
    align = opts.textAlign ?? 'right';
    xAnchor = align === 'right' ? width - paddingX : width - paddingX;
    ctx.textBaseline = 'top';
    yStart = height - paddingY - totalH;
  } else {
    align = opts.textAlign ?? 'center';
    xAnchor = width / 2;
    ctx.textBaseline = 'top';
    yStart = (height - totalH) / 2;
  }

  ctx.textAlign = align;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], xAnchor, yStart + i * lineGap);
  }

  const img = ctx.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  let any = false;
  for (let i = 0; i < width * height; i++) {
    const a = img.data[i * 4 + 3];
    alpha[i] = a;
    if (a > 96) {
      any = true;
      const x = i % width;
      const y = (i / width) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  const texture = gl.createTexture();
  if (!texture) throw new Error('createTexture failed (textMask)');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, alpha);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    texture,
    width,
    height,
    bbox: any ? { x0, y0, x1, y1 } : null,
    alpha,
    dispose() {
      gl.deleteTexture(texture);
    },
  };
}

export function collectInterior(mask: TextMask, threshold = 110): { x: number; y: number }[] {
  if (!mask.bbox) return [];
  const out: { x: number; y: number }[] = [];
  const { alpha, width, bbox } = mask;
  for (let y = bbox.y0; y <= bbox.y1; y++) {
    for (let x = bbox.x0; x <= bbox.x1; x++) {
      if (alpha[y * width + x] > threshold) out.push({ x, y });
    }
  }
  return out;
}
