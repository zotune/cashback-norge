import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import type { Logger } from "./logger.js";

const MODEL_VERSION = "u2netp-1";
const ownImage = /^\/offer-images\/[a-f0-9]{32}\.webp$/;

/** Only product photos, after the bounded download/resize stage. Original images
 * remain usable if the model, its transport, or a particular mask fails. Outputs
 * share the ordinary image budget and are pruned with the current catalogues. */
export async function removeProductBackgrounds(paths: string[], options: {
  logger: Logger; directory?: string; python?: string; script?: string; timeoutMs?: number;
}): Promise<Map<string, string>> {
  const directory = options.directory ?? resolve("site/offer-images");
  const result = new Map<string, string>();
  const pending: Array<{ source: string; input: string; output: string; path: string }> = [];
  const temporary = await mkdtemp(resolve(tmpdir(), "cbn-cutouts-"));
  try {
    for (const source of [...new Set(paths)].filter(path => ownImage.test(path)).slice(0, 1000)) {
      const input = resolve(directory, basename(source));
      const bytes = await readFile(input).catch(() => undefined);
      if (!bytes) continue;
      // Published transparent snapshots can be reused byte for byte on deploy.
      const stats = await sharp(bytes).stats();
      if (stats.channels.length === 4 && stats.channels[3]!.min < 250) { result.set(source, source); continue; }
      const path = `/offer-images/${createHash("sha256").update(`${MODEL_VERSION}:${source}`).digest("hex").slice(0, 32)}.webp`;
      const existing = await readFile(resolve(directory, basename(path))).catch(() => undefined);
      if (existing && await validCutout(existing)) { result.set(source, path); continue; }
      pending.push({ source, input, output: resolve(temporary, basename(path)), path });
    }
    if (!pending.length) return result;
    const manifest = resolve(temporary, "images.json");
    await writeFile(manifest, JSON.stringify(pending));
    await new Promise<void>((accept, reject) => {
      const child = spawn(options.python ?? process.env.CBN_BACKGROUND_PYTHON ?? "python3", [options.script ?? resolve("scripts/background-removal/remove.py"), manifest], {
        env: { ...process.env, OMP_NUM_THREADS: "1" }, stdio: ["ignore", "pipe", "pipe"], timeout: options.timeoutMs ?? 8 * 60_000,
      });
      let diagnostic = "";
      child.stdout.on("data", () => {});
      child.stderr.on("data", chunk => { diagnostic = (diagnostic + String(chunk)).slice(-1200); });
      child.on("error", reject);
      child.on("close", (code, signal) => code === 0 ? accept() : reject(new Error(`worker ${signal ?? code}: ${diagnostic.trim()}`)));
    }).catch(error => options.logger.warn(`Product backgrounds: ${error instanceof Error ? error.message : String(error)}`));
    let bytes = 0;
    for (const item of pending) {
      const output = await readFile(item.output).catch(() => undefined);
      if (!output || bytes + output.length > 32 * 1024 * 1024 || !await validCutout(output)) continue;
      bytes += output.length;
      await writeFile(resolve(directory, basename(item.path)), output);
      result.set(item.source, item.path);
    }
    options.logger.info(`Product backgrounds: ${result.size}/${paths.length} transparent snapshots; other photos kept intact`);
    return result;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function validCutout(buffer: Buffer): Promise<boolean> {
  if (buffer.length > 128 * 1024) return false;
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 320 * 320 }).metadata();
    if (metadata.format !== "webp" || !metadata.hasAlpha || !metadata.width || !metadata.height || metadata.width > 320 || metadata.height > 320) return false;
    const stats = await sharp(buffer).stats();
    return stats.channels[3]!.min < 250 && stats.channels[3]!.max > 128;
  } catch { return false; }
}
