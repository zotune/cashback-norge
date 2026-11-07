import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { collectGroceryOffers, fetchGroceryOffers, GROCERY_CHAINS } from "../src/backend/grocery-offers.js";

// Real Tjek offers (squid-api.tjek.com, 2026-11-07) reused as each chain's flyer.
const offers = (JSON.parse(readFileSync(new URL("./fixtures/etilbudsavis-offers.json", import.meta.url), "utf8")) as Record<string, Array<Record<string, unknown>>>)["Friele"]!;
const logger = { info() {}, warn() {}, error() {} };

async function withApi(
  run: (base: string, requests: string[]) => Promise<void>,
  options: { dealersStatus?: number; offerPages?: number; previous?: unknown } = {},
) {
  const requests: string[] = [];
  const dealers = [
    ...GROCERY_CHAINS.map((name, index) => ({ id: `d${index}`, name, country: { id: "NO" } })),
    { id: "se1", name: "REMA 1000", country: { id: "SE" } },
    { id: "x1", name: "Biltema", country: { id: "NO" } },
  ];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    requests.push(`${url.pathname}?${url.searchParams.get("dealer_ids") ?? ""}:${url.searchParams.get("offset")}`);
    const send = (status: number, body: unknown) => response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    if (url.pathname === "/previous.json") return send(options.previous === undefined ? 404 : 200, options.previous ?? {});
    assert.equal(url.searchParams.get("r_lat"), "59.9139");
    if (url.pathname === "/v2/dealers") return options.dealersStatus !== undefined ? send(options.dealersStatus, { error: "x" }) : send(200, dealers);
    if (url.pathname === "/v2/offers") {
      const dealer = url.searchParams.get("dealer_ids")!;
      const offset = Number(url.searchParams.get("offset"));
      // d0 always returns full pages, to prove paging stops at the limit.
      if (dealer === "d0") return send(200, Array.from({ length: 100 }, (_value, index) => ({ ...offers[0], id: `d0-${offset}-${index}` })));
      return send(200, offers.map((offer) => ({ ...offer, id: `${dealer}-${String(offer.id)}` })));
    }
    send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("grocery offers read Norwegian allowlisted chains with bounded pages", async () => {
  await withApi(async (base, requests) => {
    const catalog = await fetchGroceryOffers({ generatedAt: "2026-11-06T12:00:00.000Z", logger, apiBase: `${base}/v2`, navigationTimeoutSecs: 5 });
    assert.equal(catalog.chains.length, GROCERY_CHAINS.length);
    assert.ok(!catalog.offers.some((offer) => offer.id.startsWith("se1") || offer.id.startsWith("x1")));
    // Five full pages for d0, then it stops.
    assert.equal(requests.filter((entry) => entry.startsWith("/v2/offers?d0:")).length, 5);
    assert.equal(catalog.offers.filter((offer) => offer.chain === "REMA 1000").length, 500);
    const kiwi = catalog.offers.find((offer) => offer.chain === "KIWI");
    assert.equal(kiwi?.currency ?? "NOK", "NOK");
    assert.match(kiwi!.imageUrl!, /^https:\/\//);
    assert.equal(catalog.location, "Oslo");
  });
});

test("grocery offers fall back to the published catalogue's running offers, and report the failure", async () => {
  const previous = {
    version: 1, generatedAt: "2026-11-04T12:00:00.000Z", source: "Tjek", location: "Oslo", chains: ["KIWI"],
    offers: [
      { id: "a", chain: "KIWI", heading: "Running", description: "", dealer: "KIWI", amount: 10, validFrom: "2026-11-01T00:00:00Z", validTo: "2026-11-08T22:59:59Z" },
      { id: "b", chain: "KIWI", heading: "Expired", description: "", dealer: "KIWI", amount: 10, validFrom: "2026-10-25T00:00:00Z", validTo: "2026-11-01T22:59:59Z" },
    ],
  };
  await withApi(async (base) => {
    const warnings: string[] = [];
    const catalog = await collectGroceryOffers({
      generatedAt: "2026-11-06T12:00:00.000Z", logger: { ...logger, warn: (message: string) => { warnings.push(message); } },
      apiBase: `${base}/v2`, previousUrl: `${base}/previous.json`, navigationTimeoutSecs: 5,
    });
    assert.deepEqual(catalog?.offers.map((offer) => offer.heading), ["Running"]);
    assert.ok(warnings.some((message) => /dealer list failed: dealers http:\/\/127\.0\.0\.1:\d+\/v2\/dealers\?.*\((?:HTTP )?503\b/.test(message)));
  }, { dealersStatus: 503, previous });

  // No previous catalogue: nothing is published rather than an empty page.
  await withApi(async (base) => {
    const errors: string[] = [];
    const catalog = await collectGroceryOffers({ generatedAt: "2026-11-06T12:00:00.000Z", logger: { ...logger, error: (message: string) => { errors.push(message); } }, apiBase: `${base}/v2`, previousUrl: `${base}/previous.json`, navigationTimeoutSecs: 5 });
    assert.equal(catalog, undefined);
    assert.ok(errors.some((message) => /no usable previous grocery offers catalogue/.test(message)));
  }, { dealersStatus: 403 });
});
