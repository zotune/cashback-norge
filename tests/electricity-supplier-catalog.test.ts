import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildElectricitySupplierCatalog, findElectricitySupplier, isElectricitySupplierCatalog, isFreshElectricitySupplierCatalog, ELECTRICITY_SUPPLIER_CATALOG_URL } from "../src/shared/electricity-supplier-catalog.js";
import { collectElectricitySupplierCatalog, fetchElectricitySupplierCatalog } from "../src/backend/electricity-supplier-catalog.js";

const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/forbrukerradet-electricity.json", import.meta.url), "utf8"));
const at = new Date().toISOString();
const logger = { info() {}, warn() {}, error() {} };

test("electricity supplier catalogue: derives every distinct domain from the source, not a merchant allowlist", () => {
  const rows = fixture();
  const catalog = buildElectricitySupplierCatalog(rows, at);
  assert.equal(catalog.suppliers.length, 5);
  assert.equal(findElectricitySupplier("https://cheapenergy.no/privat/cheap-spot-12/", catalog)?.name, "Cheap Energy Norge AS");
  assert.equal(findElectricitySupplier("https://www.agva.no/stromavtale/agva-light/", catalog)?.name, "Agva Kraft");
  assert.equal(findElectricitySupplier("https://www.vibb.no/strom", catalog)?.name, "Vibb AS");
  assert.equal(findElectricitySupplier("https://minside.cheapenergy.no/", catalog), undefined);
  assert.equal(findElectricitySupplier("https://cheapenergy.no.evil.example/", catalog), undefined);
  assert.equal(findElectricitySupplier("https://cheapenergy.no/bedrift/", catalog), undefined);
  assert.equal(findElectricitySupplier("https://cheapenergy.no/min-side/", catalog), undefined);
  const future = structuredClone(rows[0]);
  future.organization = { id: 123456, name: "Ny leverandør", pricelistUrl: "https://new-supplier.example/priser/" };
  assert.equal(findElectricitySupplier("https://new-supplier.example/", buildElectricitySupplierCatalog([...rows, future], at))?.id, 123456);
});

test("electricity supplier catalogue: excludes tracking-only, ambiguous, expired and malformed identity", () => {
  const row = fixture()[0];
  const missing = structuredClone(row);
  missing.organization = { id: 21, name: "Ukjent", pricelistUrl: null };
  missing.orderUrl = "https://ad-network.example/click?id=21";
  const conflict = structuredClone(row);
  conflict.organization = { id: 22, name: "Annen leverandør", pricelistUrl: row.organization.pricelistUrl };
  const expired = structuredClone(row);
  expired.expiredAt = "2020-01-01";
  expired.organization = { id: 23, name: "Gammel", pricelistUrl: "https://expired.example/" };
  const catalog = buildElectricitySupplierCatalog([...fixture(), missing, conflict, expired], at);
  assert.equal(catalog.suppliers.some((s) => s.hostname === "ad-network.example" || s.hostname === "expired.example" || s.hostname === "klarkraft.no"), false);
  assert.equal(isElectricitySupplierCatalog({ ...catalog, suppliers: [{ ...catalog.suppliers[0], hostname: "wrong.example" }] }), false);
  assert.equal(isFreshElectricitySupplierCatalog({ ...catalog, generatedAt: new Date(Date.now() - 15 * 86400000).toISOString() }), false);
  const verified = buildElectricitySupplierCatalog([...fixture(), missing], at, new Map([[21, "https://supplier.example/avtaler/"]]));
  assert.equal(verified.suppliers.find((s) => s.id === 21)?.evidence, "verified-offer-page");
});

test("electricity supplier catalogue: a newer cached catalogue survives older bundles, older downloads and offline restarts", async () => {
  const newest = buildElectricitySupplierCatalog(fixture(), new Date(Date.now() + 60_000).toISOString());
  newest.suppliers.push({ id: 99999, name: "Ny strøm", hostname: "new-power.example", supplierUrl: "https://new-power.example/priser/", evidence: "reported-pricelist" });
  let stored: unknown = newest;
  const cache = { read: async () => stored, write: async (value: unknown) => { stored = value; } };
  const freshRuntime = async (key: string) => import(new URL(`../src/shared/electricity-suppliers.ts?isolation=${key}`, import.meta.url).href);
  const first = await freshRuntime("first");
  let calls = 0;
  await first.loadElectricitySuppliers(async (url: string, init: RequestInit) => {
    calls++; assert.equal(url, ELECTRICITY_SUPPLIER_CATALOG_URL); assert.equal(init.credentials, "omit");
    return { ...newest, generatedAt: new Date(Date.now() - 3600000).toISOString(), suppliers: newest.suppliers.slice(0, 1) };
  }, cache);
  assert.equal(first.getElectricitySupplier("https://new-power.example/")?.name, "Ny strøm");
  assert.deepEqual(stored, newest);
  await first.loadElectricitySuppliers(async () => { calls++; throw new Error("should remain cached"); }, cache);
  assert.equal(calls, 1);
  const restarted = await freshRuntime("restart");
  assert.equal(restarted.getElectricitySupplier("https://new-power.example/"), undefined);
  await restarted.loadElectricitySuppliers(async () => { throw new Error("offline"); }, cache);
  assert.equal(restarted.getElectricitySupplier("https://new-power.example/")?.name, "Ny strøm");
  assert.deepEqual(stored, newest);
});

async function withSource(respond: (count: number) => unknown | number | "drop", run: (url: string, count: () => number) => Promise<void>) {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.headers.cookie, undefined);
    const value = respond(requests);
    if (value === "drop") { request.socket.destroy(); return; }
    if (typeof value === "number") { response.writeHead(value).end("unavailable"); return; }
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(value));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try { await run(`http://127.0.0.1:${address.port}/products`, () => requests); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("electricity supplier crawler: retries a dropped connection and keeps requests bounded", async () => {
  await withSource((n) => n === 1 ? "drop" : fixture(), async (sourceUrl, count) => {
    const catalog = await fetchElectricitySupplierCatalog({ generatedAt: at, sourceUrl });
    assert.equal(catalog.suppliers.length, 5);
    assert.equal(count(), 2);
  });
  await withSource(() => 503, async (sourceUrl, count) => {
    await assert.rejects(fetchElectricitySupplierCatalog({ generatedAt: at, sourceUrl }), /503/);
    assert.equal(count(), 3);
  });
});

test("electricity supplier crawler: stops on blocking/rate limits; fallback preserves its timestamp for at most 14 days", async () => {
  for (const status of [403, 429]) await withSource(() => status, async (sourceUrl, count) => {
    await assert.rejects(fetchElectricitySupplierCatalog({ generatedAt: at, sourceUrl }), new RegExp(String(status)));
    assert.equal(count(), 1);
  });
  const dir = await mkdtemp(join(tmpdir(), "cbn-electricity-test-"));
  const previousPath = join(dir, "suppliers.json");
  const previous = buildElectricitySupplierCatalog(fixture(), new Date(Date.now() - 7 * 86400000).toISOString());
  try {
    await writeFile(previousPath, JSON.stringify(previous));
    await withSource(() => 403, async (sourceUrl) => {
      assert.deepEqual(await collectElectricitySupplierCatalog({ generatedAt: at, sourceUrl, previousPath, logger }), previous);
      assert.equal(JSON.parse(await readFile(previousPath, "utf8")).generatedAt, previous.generatedAt);
      previous.generatedAt = new Date(Date.now() - 15 * 86400000).toISOString();
      await writeFile(previousPath, JSON.stringify(previous));
      assert.equal(await collectElectricitySupplierCatalog({ generatedAt: at, sourceUrl, previousPath, logger }), undefined);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
