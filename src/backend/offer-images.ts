// Daily, bounded image snapshots for the static offer pages. Only the current
// catalogues are published; images never enter Git or an accumulating CI cache.
import { Configuration, HttpCrawler, MemoryStorage, Request } from "crawlee";
import { createHash } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import type { Logger } from "./logger.js";

export type OfferImageInput = { url: string; size?: number };
export type OfferImageOptions = {
  logger: Logger;
  directory?: string;
  requestUrl?: (url: string) => string;
  navigationTimeoutSecs?: number;
};
const MAX_IMAGES = 2000;
const MAX_IMAGE_BYTES = 128 * 1024;
const MAX_BATCH_BYTES = 32 * 1024 * 1024;
const hosts = new Set(["cdn.pji.nu", "media.pji.nu", "image-transformer-api.tjek.com"]);
const localPath = /^\/(?:offer-images\/[a-f0-9]{32}\.webp|deal-images\/[a-f0-9]{32}\.(?:png|jpe?g|webp))$/;
export const imageKey = ({ url, size = 320 }: OfferImageInput) => `${size}:${url}`;

export async function cacheOfferImages(inputs: OfferImageInput[], options: OfferImageOptions): Promise<Map<string, string>> {
  const directory = options.directory ?? resolve("site/offer-images");
  await mkdir(directory, { recursive: true });
  const result = new Map<string, string>();
  const requests: Request[] = [];
  let bytes = 0;
  const seen = new Set<string>();
  for (const input of inputs) {
    const key = imageKey(input);
    if (seen.has(key)) continue;
    if (seen.size >= MAX_IMAGES) break;
    seen.add(key);
    let url: URL;
    try { url = new URL(input.url, "https://cashbacknorge.no"); } catch { continue; }
    if (url.protocol !== "https:" || !(hosts.has(url.hostname) || (url.hostname === "cashbacknorge.no" && localPath.test(url.pathname)))) continue;
    const snapshot = url.hostname === "cashbacknorge.no" && url.pathname.startsWith("/offer-images/");
    const path = snapshot
      ? url.pathname : `/offer-images/${createHash("sha256").update(key).digest("hex").slice(0, 32)}.webp`;
    try {
      const info = await stat(resolve(directory, basename(path)));
      if (info.size > 0 && info.size <= MAX_IMAGE_BYTES && bytes + info.size <= MAX_BATCH_BYTES) { bytes += info.size; result.set(key, path); continue; }
    } catch { /* Download the current snapshot below. */ }
    requests.push(new Request({ url: options.requestUrl?.(url.href) ?? url.href, uniqueKey: key, userData: { key, path, snapshot, size: Math.min(320, input.size ?? 320) } }));
  }
  const configuration = new Configuration();
  configuration.useStorageClient(new MemoryStorage({ persistStorage: false }));
  const crawler = new HttpCrawler({
    maxConcurrency: 4, maxRequestRetries: 2, useSessionPool: false, ignoreSslErrors: false,
    navigationTimeoutSecs: options.navigationTimeoutSecs ?? 30, requestHandlerTimeoutSecs: 30,
    additionalMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    async requestHandler({ request, body, response }) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      if (!String(response.headers["content-type"]).startsWith("image/") || buffer.length > 5 * 1024 * 1024) {
        request.noRetry = true; throw new Error("unexpected image format/size");
      }
      let output: Buffer;
      try {
        if (request.userData.snapshot) {
          const metadata = await sharp(buffer, { limitInputPixels: 20_000_000 }).metadata();
          if (metadata.format !== "webp" || !metadata.width || !metadata.height || metadata.width > 320 || metadata.height > 320) throw new Error("invalid snapshot");
          output = buffer;
        } else output = await sharp(buffer, { limitInputPixels: 20_000_000 }).rotate().resize({ width: request.userData.size, height: request.userData.size, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
      } catch { request.noRetry = true; throw new Error("image could not be decoded"); }
      if (output.length > MAX_IMAGE_BYTES || bytes + output.length > MAX_BATCH_BYTES) { request.noRetry = true; throw new Error("image storage budget exceeded"); }
      bytes += output.length;
      await writeFile(resolve(directory, basename(request.userData.path)), output);
      result.set(request.userData.key, request.userData.path);
    },
    async failedRequestHandler({ request }, error) { options.logger.warn(`Offer image: ${request.url} (${error.message.slice(0, 200)})`); },
  }, configuration);
  if (requests.length) await crawler.run(requests);
  options.logger.info(`Offer images: ${result.size}/${seen.size} available, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
  return result;
}

export async function pruneOfferImages(paths: Array<string | undefined>, directory = resolve("site/offer-images")): Promise<void> {
  const keep = new Set(paths.filter((path): path is string => Boolean(path?.startsWith("/offer-images/"))).map(path => basename(path)));
  for (const file of await readdir(directory).catch(() => [])) {
    if (/^[a-f0-9]{32}\.webp$/.test(file) && !keep.has(file)) await unlink(resolve(directory, file));
  }
}
