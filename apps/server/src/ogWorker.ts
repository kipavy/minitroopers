import { parentPort } from "node:worker_threads";
import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import jpeg from "jpeg-js";

/** Rasterises a banner SVG and encodes it as JPEG (og.ts bannerJpeg), off the main thread. */
export interface Job {
  id: number;
  svg: string;
  opts: ResvgRenderOptions;
  quality: number;
}

parentPort!.on("message", (j: Job) => {
  try {
    const img = new Resvg(j.svg, j.opts).render();
    const data = jpeg.encode({ data: img.pixels, width: img.width, height: img.height }, j.quality).data;
    const out = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    parentPort!.postMessage({ id: j.id, data: out });
  } catch (e) {
    parentPort!.postMessage({ id: j.id, error: e instanceof Error ? e.message : String(e) });
  }
});
