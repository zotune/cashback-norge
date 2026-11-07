import assert from "node:assert/strict";
import { test } from "node:test";
import { readPrisjaktDealDetails, readPrisjaktAllTimeHistory } from "../src/shared/prisjakt-deal-details.js";
import { createDealMerchantLookup } from "../src/shared/deal-merchants.js";
import type { CashbackOffer } from "../src/shared/cashback.js";
import { getDealLowPrice, type PrisjaktDeal } from "../src/shared/prisjakt-deals.js";

const now = "2026-11-07T14:00:00Z";
const deal: PrisjaktDeal = { id: "123", name: "Robotstøvsuger", store: "Skousen", storeId: 10, shopOfferId: "abc", price: 5990, currency: "NOK", productUrl: "https://www.prisjakt.no/product.php?p=123" };
const event = (date: string, price: number, overrides = {}) => ({ date, price, active: true, isMembershipPrice: false, isPaidMembership: false, ...overrides });
const history = { productId: 123, variantIds: [], marketConfig: { currency: "NOK" }, initialData: { priceHistory: {
  oldestHistoryItem: "2026-01-01T00:00:00Z", newestHistoryItem: now,
  historyItems: [event("2026-08-01T00:00:00Z", 499000), event("2026-09-01T00:00:00Z", 699000), event("2026-10-01T00:00:00Z", 1000, { isPaidMembership: true }), event("2026-11-01T00:00:00Z", 599000)],
} } };
const row = { productId: 123, variantId: 456, shopId: 10, shopOfferId: "abc", price: { amount: 5990, currency: "NOK" }, condition: "New", stockStatus: "InStock", isPaidMembership: false,
  shopLogoUrl: "https://cdn.pji.nu/g/ftg_logos/10.png", priceValidUntil: "$D2026-11-15T21:59:00Z" };
const page = (...values: unknown[]) => `<script>self.__next_f.push([1,${JSON.stringify(values.map((v, i) => `${i}:${JSON.stringify(v)}\n`).join(""))}])</script>`;

test("Prisjakt history keeps the starting price, decodes øre, skips paid membership, and binds the concrete store row", () => {
  const result = readPrisjaktDealDetails(page(history, row, { ...history, productId: 999 }), deal, now);
  assert.equal(result.lowestPrice90Days, 4990);
  assert.equal(result.historyScope, "product");
  assert.equal(result.validTo, "2026-11-15T21:59:00.000Z");
  assert.equal(result.storeLogoUrl, row.shopLogoUrl);
  const wrong = readPrisjaktDealDetails(page(history, { ...row, shopOfferId: "wrong" }), deal, now);
  assert.equal(wrong.storeLogoUrl, undefined);
  assert.equal(wrong.validTo, undefined);
});

test("history for a specific colour/size requires that variant, rather than the product-wide minimum", () => {
  const variant = { ...deal, productUrl: `${deal.productUrl}&a-116257=White` };
  assert.equal(readPrisjaktDealDetails(page(history, row), variant, now).lowestPrice90Days, undefined);
  assert.equal(readPrisjaktDealDetails(page({ ...history, variantIds: [456] }, row), variant, now).lowestPrice90Days, 4990);
  assert.equal(readPrisjaktDealDetails(page({ ...history, variantIds: [789] }, row), variant, now).lowestPrice90Days, undefined);
});

test("history remains unknown for partial coverage, another currency, stale data, missing starting price or malformed data", () => {
  for (const override of [
    { oldestHistoryItem: "2026-10-01T00:00:00Z" }, { newestHistoryItem: "2026-10-01T00:00:00Z" },
    { historyItems: [event("2026-11-01T00:00:00Z", 10000)] },
    { historyItems: [event("2026-08-01T00:00:00Z", 0)] },
  ]) {
    const chart = { ...history, initialData: { priceHistory: { ...history.initialData.priceHistory, ...override } } };
    assert.equal(readPrisjaktDealDetails(page(chart, row), deal, now).lowestPrice90Days, undefined);
  }
  assert.equal(readPrisjaktDealDetails(page({ ...history, marketConfig: { currency: "SEK" } }), deal, now).lowestPrice90Days, undefined);
  assert.deepEqual(readPrisjaktDealDetails("<html>Just a moment</html>", deal, now), {});
});

test("deal merchants reuse unambiguous verified domains and leave ambiguous names unknown", () => {
  const offer = (merchantName: string, domains: string[]): CashbackOffer => ({ merchantName, domains, provider: "klarna", reward: "1 %", sourceUrl: "https://example.com/", activationUrl: "https://example.com/", terms: "", updatedAt: now });
  const lookup = createDealMerchantLookup({ offers: [offer("Skousen Hvitevarer", ["skousen.no"]), offer("Butikk", ["a.no"]), offer("Butikk", ["b.no"])] });
  assert.equal(lookup("Skousen"), "skousen.no");
  assert.equal(lookup("Skousen.no"), "skousen.no");
  assert.equal(lookup("Butikk"), undefined);
  assert.equal(lookup("https://logo-cdn.no/skousen.png"), undefined);
  assert.equal(lookup("Ukjent"), undefined);
});

test("detail crawler stops at its product bound and a failed detail does not discard the offers", async () => {
  const { createServer } = await import("node:http");
  const { enrichPrisjaktDeals } = await import("../src/backend/prisjakt-deals.js");
  const requests: string[] = [];
  const warnings: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url!);
    if (req.url === "/history.json") {
      let body = ""; req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => { assert.equal(JSON.parse(body).timeRange, "ALL"); res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ priceHistory: { ...history.initialData.priceHistory, historyItems: [event("2026-01-01T00:00:00Z", 1000000), ...history.initialData.priceHistory.historyItems] } })); });
      return;
    }
    res.writeHead(req.url === "/123" ? 200 : 403, { "Content-Type": "text/html" }).end(req.url === "/123" ? page(history, row) : "Not available");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const result = await enrichPrisjaktDeals({ version: 1, generatedAt: now, source: "Prisjakt", deals: [deal, { ...deal, id: "124" }, { ...deal, id: "125" }].map((d, i) => ({ ...d, rank: i + 1 })) }, {
      generatedAt: now, logger: { info() {}, error() {}, warn: message => warnings.push(message) },
      historyUrl: `http://127.0.0.1:${address.port}/history.json`, maxDetailProducts: 2, productPageUrl: d => `http://127.0.0.1:${address.port}/${d.id}`,
    });
    assert.equal(result.deals.length, 3);
    assert.equal(result.deals[0]?.lowestPrice90Days, 4990);
    assert.equal(result.deals[1]?.lowestPrice90Days, undefined);
    assert.deepEqual(requests.filter((path) => path !== "/history.json"), ["/123", "/124"]);
    assert.equal(requests.filter((path) => path === "/history.json").length, 1);
    assert.equal(result.deals[0]?.lowestPriceEver, 4990);
    assert.match(warnings[0]!, /Prisjakt details.*124.*403/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test("all-time minimum uses the ALL response, including prices outside 90 days, with complete coverage", () => {
  const value = { priceHistory: { ...history.initialData.priceHistory, historyItems: [event("2026-01-01T00:00:00Z", 100000), ...history.initialData.priceHistory.historyItems] } };
  const result = readPrisjaktAllTimeHistory(value, [], now);
  assert.equal(result.lowestPriceEver, 1000);
  assert.equal(result.historyStartedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(readPrisjaktAllTimeHistory({ priceHistory: history.initialData.priceHistory }, [], now).lowestPriceEver, undefined);
  assert.throws(() => readPrisjaktAllTimeHistory({}, [], now), /missing priceHistory/);
});


test("current verified prices count towards the low, with a meaningful distance from it", () => {
  assert.deepEqual(getDealLowPrice(6999, 8159), { lowestPrice: 6999, abovePercent: 0 });
  assert.deepEqual(getDealLowPrice(6000, 4000), { lowestPrice: 4000, abovePercent: 50 });
  assert.equal(getDealLowPrice(100, undefined), undefined);
  assert.equal(getDealLowPrice(100, 0), undefined);
});
