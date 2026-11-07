import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readKlarnaDealCandidates, readKlarnaDeal } from "../src/shared/klarna-deals.js";
import { readKlarnaOffers } from "../src/shared/klarna-price-match.js";
import { readOtherDealPage, fetchProductDealSource } from "../src/backend/product-deal-sources.js";
import { collectProductDeals } from "../src/backend/product-deals.js";
import { isSameDealProduct, rankProductDeals, type ProductDeal, type ProductDealsCatalog } from "../src/shared/product-deals.js";
import { readLdJsonScripts, selectProductLdJson } from "../src/shared/product-data.js";

const now = "2026-11-07T12:00:00Z";
const product = { id: "12345", name: "Sony WH-1000XM6 Black", url: "/pl/cl94/12345/Hodetelefoner/Sony-WH-1000XM6-Black/", condition: "NEW", lowestPrice: { amount: "2990.00", currency: "NOK" }, priceDrop: { oldPrice: { amount: "3990.00", currency: "NOK" } }, category: { name: "Hodetelefoner" } };
const rawOffer = { merchantId: "1", name: product.name, price: { amount: "2990.00", currency: "NOK" }, shippingCost: { amount: "49.00", currency: "NOK" }, availability: "AVAILABLE", stockStatus: "IN_STOCK", campaignMembership: null, url: "https://clk.klarna.com/no/gotostore/v1/abc" };
const offers = (rows: unknown[]) => ({ offers: rows, merchants: { "1": { name: "Butikk", url: "/ri/1/Butikk/" } } });
const candidate = readKlarnaDealCandidates({ products: [product] })[0]!;
const ld = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const flight = (value: unknown) => `<script>self.__next_f.push([1,${JSON.stringify(`0:${JSON.stringify(value)}\n`)}])</script>`;
const godUrl = "https://godpris.no/produkt/12345";
const godCandidate = { id: "12345", name: product.name, productUrl: godUrl, sourceRank: 1, advertisedPrice: 2990, priceDrop: 25 };
const godProduct = (rows: unknown[]) => ({ "@type": "Product", name: product.name, gtin: "4548736161153", offers: { "@type": "AggregateOffer", lowPrice: 1, priceCurrency: "NOK", offers: rows } });
const godOffer = { "@type": "Offer", seller: { name: "Butikk" }, price: 2990, priceCurrency: "NOK", availability: "InStock" };
const radarUrl = "https://prisradar.no/produkter/sony-wh-1000xm6-black";
const radar = { url: radarUrl, title: product.name, discount: { oldPrice: 3990 }, category: { title: "Hodetelefoner" }, offers: [{ title: product.name, shop: { title: "Butikk" }, price: 2990, availability: "in_stock", isUsed: false, isInactive: false }] };
const radarSchema = { "@type": "Product", name: product.name, url: radarUrl, offers: { "@type": "AggregateOffer", lowPrice: 1, priceCurrency: "NOK", itemCondition: "NewCondition" } };
const nextSchema = (value: unknown) => `<script>(self.__next_s=self.__next_s||[]).push(${JSON.stringify([0, { type: "application/ld+json", children: JSON.stringify(value) }])})</script>`;
const base: ProductDeal = { source: "prisjakt", sourceRank: 1, updatedAt: now, id: "12345", name: product.name, store: "Butikk", price: 2990, currency: "NOK", productUrl: "https://www.prisjakt.no/product.php?p=12345", category: "Hodetelefoner" };

test("Klarna daily offers require concrete stock, correct variant/currency, and distinguish unknown shipping", () => {
  assert.equal(readKlarnaDeal(candidate, offers([rawOffer]), now)?.price, 2990);
  assert.equal(readKlarnaDeal(candidate, offers([rawOffer]), now)?.shippingAmount, 49);
  for (const change of [{ stockStatus: "UNKNOWN" }, { availability: "UNAVAILABLE" }, { stockStatus: "OUT_OF_STOCK" }, { availability: "PREORDER" }, { name: "Sony WH-1000XM5 Black" }, { name: "Sony WH-1000XM6 White" }, { condition: "USED" }, { campaignMembership: { paid: true } }, { price: { amount: "0", currency: "NOK" } }, { price: { amount: "2990", currency: "SEK" } }]) {
    assert.equal(readKlarnaDeal(candidate, offers([{ ...rawOffer, ...change }]), now), undefined, JSON.stringify(change));
  }
  const unknownShipping = readKlarnaOffers(offers([{ ...rawOffer, shippingCost: undefined }]))[0]!;
  assert.equal(unknownShipping.shippingAmount, undefined);
  assert.equal(unknownShipping.sortAmount, 2990);
  assert.deepEqual(readKlarnaDealCandidates({ products: [{ ...product, condition: "USED" }, { ...product, outOfStock: true }, { ...product, lowestPrice: { currency: "SEK" } }] }), []);
  assert.throws(() => readKlarnaDealCandidates({ results: [] }), /products array/);
  assert.equal(readKlarnaDeal(candidate, offers([{ ...rawOffer, price: { amount: "4000", currency: "NOK" } }]), now), undefined);
});

test("Godpris uses concrete seller offers, never the aggregate minimum or unavailable advertised price", () => {
  const page = ld(godProduct([{ ...godOffer, price: 1, availability: "OutOfStock" }, godOffer]));
  assert.equal(readOtherDealPage("godpris", page, godCandidate, now)?.price, 2990);
  assert.equal(readOtherDealPage("godpris", ld(godProduct([{ ...godOffer, price: 3490 }])), godCandidate, now), undefined);
  for (const change of [{ availability: "PreOrder" }, { availability: "Unknown" }, { price: null }, { priceCurrency: "EUR" }, { itemCondition: "https://schema.org/UsedCondition" }]) {
    assert.equal(readOtherDealPage("godpris", ld(godProduct([{ ...godOffer, ...change }])), godCandidate, now), undefined);
  }
  assert.equal(readOtherDealPage("godpris", ld({ ...godProduct([]), offers: { lowPrice: 1, priceCurrency: "NOK" } }), godCandidate, now), undefined);
});

test("Prisradar parses Next JSON-LD safely and verifies concrete stock, variant, currency and shipping", () => {
  const schema = nextSchema(radarSchema);
  assert.equal(selectProductLdJson(readLdJsonScripts(schema))?.name, product.name);
  const read = (value = radar, metadata = radarSchema) => readOtherDealPage("prisradar", nextSchema(metadata) + flight(value), { id: "12345", name: product.name, productUrl: radarUrl, sourceRank: 1 }, now);
  assert.equal(read()?.price, 2990);
  assert.equal(read()?.shippingAmount, undefined);
  assert.equal(read({ ...radar, offers: [{ ...radar.offers[0]!, shippingPrice: 79 }] } as typeof radar)?.shippingAmount, 79);
  for (const change of [{ availability: "unknown" }, { availability: "preorder" }, { title: "Sony WH-1000XM6 White" }, { isUsed: true }, { isInactive: true }, { price: 0 }]) assert.equal(read({ ...radar, offers: [{ ...radar.offers[0]!, ...change }] }), undefined);
  assert.equal(read(radar, { ...radarSchema, offers: { ...radarSchema.offers, priceCurrency: "SEK" } }), undefined);
  assert.deepEqual(readLdJsonScripts('<script>(self.__next_s=self.__next_s||[]).push([0,{type:"application/ld+json",children:window.secret}])</script>'), []);
});

test("combined ranking is deterministic, favours source agreement and keeps variants/code conflicts separate", () => {
  const klarna = { ...base, source: "klarna" as const, id: "kl", productUrl: "https://www.klarna.com/no/shopping/pl/12345/", price: 2890 };
  assert.equal(isSameDealProduct(base, klarna), true);
  assert.equal(isSameDealProduct(base, { ...klarna, name: "Sony WH-1000XM6 White" }), false);
  assert.equal(isSameDealProduct({ ...base, name: "Valentino Donna Born In Roma edp 30ml", category: "Parfymer" }, { ...klarna, name: "Valentino Born in Roma Donna EdP 30ml", category: "Parfymer" }), true);
  assert.equal(isSameDealProduct({ ...base, name: "Roborock Qrevo Edge 2 Pro", category: "Robotstøvsugere" }, { ...klarna, name: "Roborock Qrevo Edge 2 Pro Robotstøvsuger", category: "Robotstøvsugere" }), true);
  assert.equal(isSameDealProduct({ ...base, name: "Roborock Qrevo Edge 2 Pro", category: "Robotstøvsugere" }, { ...klarna, name: "Roborock Qrevo S Pro robotstøvsuger, svart", category: "Robotstøvsugere" }), false);
  assert.equal(isSameDealProduct({ ...base, codes: ["4006381333931"] }, { ...klarna, codes: ["5901234123457"] }), false);
  assert.equal(isSameDealProduct({ ...base, productUrl: `${base.productUrl}&a-color=Black` }, klarna), false);
  const ranked = rankProductDeals([base, klarna, { ...base, id: "other", name: "Sony WH-1000XM5 Black", sourceRank: 2 }], now);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]?.sources.length, 2);
  assert.equal(ranked[0]?.price, 2890);
  assert.equal(ranked[0]?.rank, 1);
  assert.deepEqual(rankProductDeals([klarna, base, { ...base, id: "other", name: "Sony WH-1000XM5 Black", sourceRank: 2 }], now), ranked);
  assert.deepEqual(rankProductDeals([{ ...base, updatedAt: "2026-10-01T00:00:00Z" }], now), []);
});

test("bounded Crawlee source failures retry, preserve fallback timestamps, and let other sources finish", async () => {
  const hits = new Map<string, number>();
  const warnings: string[] = [];
  const server = createServer((req, res) => {
    const target = new URL(new URL(req.url!, "http://localhost").searchParams.get("url")!);
    hits.set(target.pathname, (hits.get(target.pathname) ?? 0) + 1);
    if (target.hostname === "www.klarna.com") { res.writeHead(503).end("unavailable"); return; }
    res.setHeader("Content-Type", "text/html");
    if (target.pathname === "/tilbud") res.end(`<div class="search-item-wrapper"><h3><a href="${godUrl}" title="${product.name}">${product.name}</a></h3><a data-price="2990"></a><div class="app-offer-badge"><span aria-hidden="true">25%</span></div></div>`);
    else if (target.pathname === "/beste-tilbud") res.end(`<a href="${new URL(radarUrl).pathname}">${product.name}</a>`);
    else if (target.hostname === "godpris.no") res.end(ld(godProduct([godOffer])));
    else res.end(nextSchema(radarSchema) + flight(radar));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const directory = await mkdtemp(join(tmpdir(), "cbn-feed-test-"));
  const old = { ...base, source: "klarna" as const, productUrl: "https://www.klarna.com/no/shopping/pl/12345/", updatedAt: "2026-11-05T12:00:00Z" };
  const previous: ProductDealsCatalog = { version: 1, generatedAt: old.updatedAt, sources: [], deals: rankProductDeals([old], old.updatedAt) };
  try {
    const result = await collectProductDeals({ generatedAt: now, previous, logger: { info() {}, error() {}, warn: value => warnings.push(value) }, imageDirectory: directory,
      sourceOptions: { maxProducts: 1, maxPages: 1, timeoutSecs: 1, requestUrl: url => `http://127.0.0.1:${address.port}/?url=${encodeURIComponent(url)}` },
    });
    assert.equal(result.sources.find(source => source.source === "klarna")?.reused, true);
    assert.equal(result.sources.find(source => source.source === "klarna")?.updatedAt, old.updatedAt);
    assert.ok(result.sources.some(source => source.source === "godpris" && !source.reused));
    assert.ok(result.sources.some(source => source.source === "prisradar" && !source.reused));
    assert.equal(hits.get("/no/api/deals-edge-rest/public/search/deals/products/v3/NO"), 3);
    assert.ok(warnings.some(value => value.includes("503") && value.includes("klarna")));
    assert.equal(result.deals[0]?.sources.length, 3);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
