import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { cachePrisjaktCopyImages, type PrisjaktDealsCatalog } from "../src/backend/prisjakt-deals.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0e8AAAAASUVORK5CYII=", "base64");
test("clipboard image assets retain binary bytes, deduplicate, reuse local files and omit invalid responses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prisjakt-copy-images-"));
  const requests: string[] = [];
  const warnings: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    response.writeHead(200, { "Content-Type": request.url === "/good" ? "image/png" : "text/html" }).end(request.url === "/good" ? png : "<html>unavailable</html>");
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
    assert.match(result.deals[0]!.copyImageUrl!, /^\/deal-images\/[a-f0-9]{32}\.png$/);
    assert.deepEqual(await readFile(join(directory, basename(result.deals[0]!.copyImageUrl!))), png);
    assert.match(warnings[0]!, /unexpected image format/);
    requests.length = 0;
    await cachePrisjaktCopyImages(result, input);
    assert.deepEqual(requests, ["/bad"]);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  }
});
