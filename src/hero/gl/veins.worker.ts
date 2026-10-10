import { buildFigure } from './veins-figure';
import { packFigure, transferablesOf } from './veins-pack';

self.onmessage = (e: MessageEvent<{ baseRadius: number }>) => {
  const buffers = packFigure(buildFigure(e.data.baseRadius));
  (self as unknown as Worker).postMessage(buffers, transferablesOf(buffers));
};
