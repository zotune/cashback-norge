import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { pruneOfferImages } from "../src/backend/offer-images.js";
import { cachePrisjaktCopyImages, type PrisjaktDealsCatalog } from "../src/backend/prisjakt-deals.js";

const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#50b848" } }).png().toBuffer();
test("daily image assets are resized, deduplicated, reused and pruned, with invalid responses omitted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prisjakt-copy-images-"));
  const deployDirectory = await mkdtemp(join(tmpdir(), "prisjakt-copy-deploy-"));
  let snapshot: Buffer | undefined;
  const requests: string[] = [];
  const warnings: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    response.writeHead(200, { "Content-Type": request.url === "/good" ? "image/png" : request.url === "/published" ? "image/webp" : "text/html" }).end(request.url === "/good" ? png : request.url === "/published" ? snapshot : "<html>unavailable</html>");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const catalog: PrisjaktDealsCatalog = { version: 1, generatedAt: "2026-11-07T12:00:00Z", source: "Prisjakt", deals: ["good", "good", "bad"].map((name, index) => ({
    id: String(index + 1), name, store: "Butikk", price: 100, currency: "NOK", rank: index + 1, productUrl: `https://www.prisjakt.no/product.php?p=${index + 1}`, imageUrl: `https://cdn.pji.nu/product/standard/800/${name}.png`,
  })) };
  const input = { generatedAt: catalog.generatedAt, logger: { info() {}, error() {}, warn: (message: string) => warnings.push(message) }, copyImageDirectory: directory,
    imageRequestUrl: (url: string) => `http://127.0.0.1:${address.port}/${url.includes("good") ? "good" : "bad"}` };
  try {
    const result = await cachePrisjaktCopyImages(catalog, input);
    assert.equal(requests.filter(path => path === "/good").length, 1);
    assert.equal(result.deals[0]?.copyImageUrl, result.deals[1]?.copyImageUrl);
    assert.equal(result.deals[2]?.copyImageUrl, undefined);
    assert.match(result.deals[0]!.copyImageUrl!, /^\/offer-images\/[a-f0-9]{32}\.webp$/);
    const file = join(directory, basename(result.deals[0]!.imageUrl!));
    const metadata = await sharp(await readFile(file)).metadata();
    assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 320);
    assert.ok((await readFile(file)).length < 128 * 1024);
    assert.match(warnings[0]!, /unexpected image format/);
    requests.length = 0;
    await cachePrisjaktCopyImages(result, input);
    assert.deepEqual(requests, []);
    snapshot = await readFile(file);
    const redeployed = await cachePrisjaktCopyImages(result, { ...input, copyImageDirectory: deployDirectory, imageRequestUrl: () => `http://127.0.0.1:${address.port}/published` });
    assert.deepEqual(await readFile(join(deployDirectory, basename(redeployed.deals[0]!.imageUrl!))), snapshot, "manual deploys preserve published WebP bytes without another lossy conversion");
    await pruneOfferImages([result.deals[0]!.imageUrl], directory);
    assert.ok(await readFile(file));
    await pruneOfferImages([], directory);
    await assert.rejects(readFile(file));
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); await rm(deployDirectory, { recursive: true, force: true });
  }
});
