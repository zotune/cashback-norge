import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readNextFlightData, readPrisjaktDeals } from "../src/shared/prisjakt-deals.js";

// Product cards from prisjakt.no/tema/dagens-tilbud (2026-11-07), split over two Next.js
// chunks; the 4th–6th are altered copies (used, out of stock, no price), the 7th repeats the 1st.
const html = readFileSync(new URL("./fixtures/prisjakt-deals.html", import.meta.url), "utf8");

test("Prisjakt deals are read from the page's Next.js data, with shop pre-price and Prisjakt's price drop kept apart", () => {
  const deals = readPrisjaktDeals(html);
  assert.deepEqual(deals.map((deal) => deal.id), ["6228159", "16151405", "16515669"]);
  const [jacket, roborock, printer] = deals;
  assert.equal(jacket!.name, "Arcteryx Beta Jacket (Men's)");
  assert.equal(jacket!.price, 3599);
  assert.equal(jacket!.currency, "NOK");
  assert.equal(jacket!.originalPrice, 4499);
  assert.equal(jacket!.priceDrop, 14);
  assert.equal(jacket!.store, "vpg");
  assert.equal(jacket!.category, "Jakker");
  assert.match(jacket!.productUrl, /^https:\/\/www\.prisjakt\.no\/product\.php\?p=6228159/);
  assert.match(jacket!.offerUrl!, /^https:\/\/www\.prisjakt\.no\/go-to-shop\//);
  assert.match(jacket!.imageUrl!, /^https:\/\//);
  assert.equal(roborock!.priceDrop, 40);
  // No pre-price from the shop: only Prisjakt's drop.
  assert.equal(printer!.originalPrice, undefined);
  assert.equal(printer!.priceDrop, 11);
});

test("Prisjakt deals fail loudly when the page format changes", () => {
  assert.throws(() => readPrisjaktDeals("<html>Just a moment...</html>"), /no Next\.js page data/);
  assert.throws(() => readPrisjaktDeals('<script>self.__next_f.push([1,"[\\"$\\",\\"div\\",null,{}]"])</script>'), /no product cards/);
  assert.match(readNextFlightData(html), /productCardData/);
});

test("Prisjakt deals crawl a bounded number of pages, keep the order once per product, and fall back to the published catalogue", async () => {
  const { createServer } = await import("node:http");
  const { collectPrisjaktDeals, fetchPrisjaktDeals } = await import("../src/backend/prisjakt-deals.js");
  const logger = { info() {}, warn() {}, error() {} };
  const requests: string[] = [];
  let mode: "ok" | "challenge" = "ok";
  const previous = { version: 1, generatedAt: "2026-11-05T12:00:00.000Z", source: "Prisjakt", deals: [{ id: "1", name: "Old", price: 10, productUrl: "https://www.prisjakt.no/product.php?p=1", store: "x", currency: "NOK", rank: 1 }] };
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    requests.push(url.pathname + url.search);
    if (url.pathname === "/previous.json") return response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(previous));
    if (mode === "challenge") return response.writeHead(403, { "Content-Type": "text/html" }).end("<html>Just a moment...</html>");
    response.writeHead(200, { "Content-Type": "text/html" }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const catalog = await fetchPrisjaktDeals({ generatedAt: "2026-11-07T12:00:00.000Z", logger, pageUrl: `${base}/tema/dagens-tilbud`, maxPages: 3, navigationTimeoutSecs: 5 });
    // Three pages with the same products: each product once, ranked in page order.
    assert.deepEqual(catalog.deals.map((deal) => [deal.id, deal.rank]), [["6228159", 1], ["16151405", 2], ["16515669", 3]]);
    assert.deepEqual(requests.filter((path) => path.startsWith("/tema")).sort(), ["/tema/dagens-tilbud", "/tema/dagens-tilbud?page=2", "/tema/dagens-tilbud?page=3"]);

    mode = "challenge";
    requests.length = 0;
    const warnings: string[] = [];
    const fallback = await collectPrisjaktDeals({
      generatedAt: "2026-11-07T12:00:00.000Z", logger: { ...logger, warn: (message: string) => { warnings.push(message); } },
      pageUrl: `${base}/tema/dagens-tilbud`, previousUrl: `${base}/previous.json`, maxPages: 2, navigationTimeoutSecs: 5,
    });
    assert.deepEqual(fallback?.deals.map((deal) => deal.name), ["Old"]);
    assert.ok(warnings.some((message) => /first page failed: page 1 http:\/\/127\.0\.0\.1:\d+\/tema\/dagens-tilbud \(HTTP 403\)/.test(message)));
    // HTTP 403 is not retried.
    assert.equal(requests.filter((path) => path === "/tema/dagens-tilbud").length, 1);

    const tooOld = await collectPrisjaktDeals({ generatedAt: "2026-11-30T12:00:00.000Z", logger, pageUrl: `${base}/tema/dagens-tilbud`, previousUrl: `${base}/previous.json`, maxPages: 1, navigationTimeoutSecs: 5 });
    assert.equal(tooOld, undefined);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Prisjakt's narrow categories are grouped into broad chips", async () => {
  const { getPrisjaktDealGroup } = await import("../src/shared/prisjakt-deals.js");
  assert.equal(getPrisjaktDealGroup("Vaskemaskin"), "Hvitevarer");
  assert.equal(getPrisjaktDealGroup("Prosessorer (CPU)"), "Data og gaming");
  assert.equal(getPrisjaktDealGroup("Foodprosessorer & kjøkkenmaskiner"), "Kjøkken");
  assert.equal(getPrisjaktDealGroup("Dørklokker"), "Hjem og hage");
  assert.equal(getPrisjaktDealGroup("Klokker og armbåndsur"), "Klær og sko");
  assert.equal(getPrisjaktDealGroup("Stormkjøkken"), "Sport og friluft");
  assert.equal(getPrisjaktDealGroup("Julekalendere"), "Jul");
  assert.equal(getPrisjaktDealGroup("Hundemat"), "Annet");
  assert.equal(getPrisjaktDealGroup(undefined), "Annet");
});

function cardPage(overrides: Record<string, unknown> = {}, currency: string | undefined = "NOK"): string {
  const card = { data: {
    offer: { condition: "new", stockStatus: "in_stock", price: 100, originalPrice: 150, storeName: "Butikk", ...overrides },
    product: { id: 123, name: "Produkt", productLink: "/product.php?p=123", priceDrop: 12 },
  } };
  const flight = JSON.stringify({ productCardData: card });
  return `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script><script type="application/ld+json">${JSON.stringify({ "@type": "Offer", ...(currency ? { priceCurrency: currency } : {}) })}</script>`;
}

test("Prisjakt deals reject unavailable, paid-member, invalid-price and conflicting-currency offers", () => {
  for (const override of [
    { condition: "used" }, { condition: "refurbished" },
    { stockStatus: "preorder" }, { stockStatus: "out_of_stock" }, { stockStatus: null },
    { membershipRequiresCompensation: true }, { price: null }, { price: 0 }, { price: -10 }, { price: "100" },
    { priceCurrency: "SEK" },
  ]) assert.deepEqual(readPrisjaktDeals(cardPage(override)), [], JSON.stringify(override));
  assert.throws(() => readPrisjaktDeals(cardPage({}, "")), /currency/);
  assert.throws(() => readPrisjaktDeals(cardPage({}, "SEK")), /currency/);
  const [deal] = readPrisjaktDeals(cardPage({ priceExpiresAt: "$D2026-11-15T21:59:00.000Z", originalPrice: 50 }));
  assert.equal(deal?.validTo, "2026-11-15T21:59:00.000Z");
  assert.equal(deal?.originalPrice, undefined);
  assert.equal(deal?.priceDrop, 12);
});

test("Prisjakt crawler bounds retries for HTTP 429/5xx, broken connections and timeouts", async () => {
  const { createServer } = await import("node:http");
  const { fetchPrisjaktDeals } = await import("../src/backend/prisjakt-deals.js");
  const logger = { info() {}, warn() {}, error() {} };
  const requests = new Map<string, number>();
  const server = createServer((request, response) => {
    const path = request.url!;
    const attempt = (requests.get(path) ?? 0) + 1;
    requests.set(path, attempt);
    if (path.startsWith("/429") && attempt < 3) return response.writeHead(429, { "Content-Type": "text/html" }).end("limited");
    if (path.startsWith("/500") && attempt < 3) return response.writeHead(503, { "Content-Type": "text/html" }).end("unavailable");
    if (path.startsWith("/broken")) return request.socket.destroy();
    if (path.startsWith("/timeout")) return;
    response.writeHead(200, { "Content-Type": "text/html" }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of ["/429", "/500"]) {
      const result = await fetchPrisjaktDeals({ generatedAt: "2026-11-07T12:00:00Z", logger, pageUrl: `${base}${path}`, maxPages: 1, navigationTimeoutSecs: 1 });
      assert.equal(result.deals.length, 3);
      assert.equal(requests.get(path), 3);
    }
    for (const path of ["/broken", "/timeout"]) {
      await assert.rejects(fetchPrisjaktDeals({ generatedAt: "2026-11-07T12:00:00Z", logger, pageUrl: `${base}${path}`, maxPages: 1, navigationTimeoutSecs: 0.2 }), /first page failed.*page 1 http/);
      assert.equal(requests.get(path), 3);
    }
    requests.clear();
    await fetchPrisjaktDeals({ generatedAt: "2026-11-07T12:00:00Z", logger, pageUrl: `${base}/pages?sort=popular`, maxPages: 999 });
    assert.equal(requests.size, 10);
    assert.ok([...requests.keys()].every((path) => path.includes("sort=popular")));
    assert.ok(requests.has("/pages?sort=popular&page=10"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
