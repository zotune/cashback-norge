import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { GetPriceMatchForProductMessage } from "../src/shared/extension-messages.js";
import {
  buildEtilbudsavisQueries,
  findEtilbudsavisPriceMatch,
  readEtilbudsavisOffers,
  selectEtilbudsavisMatches,
} from "../src/shared/etilbudsavis-price-match.js";

// Svar fra squid-api.tjek.com/v2/offers/search (hentet 2026-11-07, forkortet), per søkeord.
const fixture = (): Record<string, unknown[]> => JSON.parse(readFileSync(new URL("./fixtures/etilbudsavis-offers.json", import.meta.url), "utf8"));
const NOW = Date.parse("2026-11-06T12:00:00Z");
const message = (overrides: Partial<GetPriceMatchForProductMessage>): GetPriceMatchForProductMessage => ({
  type: "get-price-match-for-product", url: "https://joker.no/produkter/mills-kaviar", searchTerm: "", ...overrides,
} as GetPriceMatchForProductMessage);

function transport(calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const query = new URL(url).searchParams.get("query") ?? "";
    const key = Object.keys(fixture()).find((name) => name.toLowerCase() === query.toLowerCase());
    return key !== undefined ? fixture()[key] : [];
  };
}

test("eTilbudsavis queries use the brand and first product word, then the brand alone", () => {
  assert.deepEqual(buildEtilbudsavisQueries(message({ searchTerm: "Kjøp Friele Frokost Filtermalt 250 g - MENY", productBrand: "Friele" })), ["Friele Frokost", "Friele"]);
  assert.deepEqual(buildEtilbudsavisQueries(message({ searchTerm: "Mills Kaviar Tube 185g", productBrand: "Mills" })), ["Mills Kaviar", "Mills"]);
  assert.deepEqual(buildEtilbudsavisQueries(message({ searchTerm: "Kaviar original 185 g" })), ["Kaviar original"]);
});

test("eTilbudsavis matches the same product and pack size in the current flyer, with price, pre-price and image", async () => {
  const calls: string[] = [];
  const offer = await findEtilbudsavisPriceMatch(message({ searchTerm: "Mills Kaviar Tube 185 g", productBrand: "Mills", packageAmount: 185, packageUnit: "g" }), transport(calls), NOW);
  assert.equal(offer?.source, "etilbudsavis");
  assert.equal(offer?.productName, "Mills Kaviar Tube");
  assert.equal(offer?.shopName, "Coop Prix");
  assert.equal(offer?.amount, 30);
  assert.equal(offer?.currency, "NOK");
  assert.equal(offer?.matchedExactProduct, true);
  assert.match(offer!.imageUrl!, /^https:\/\/image-transformer-api\.tjek\.com\//);
  assert.equal(offer?.alternatives?.[0]?.platform, "Førpris 37,90 kr, t.o.m. 8. nov");
  assert.match(offer!.details!, /gyldig 26\. okt–8\. nov/);
  assert.match(offer!.productUrl, /^https:\/\/etilbudsavis\.no\/soek\//);
  // The first query already found it; the brand-only fallback is not requested.
  assert.equal(calls.length, 1);
});

test("eTilbudsavis accepts a brand assortment only with a matching pack size, and never as an exact match", async () => {
  const offer = await findEtilbudsavisPriceMatch(message({ url: "https://oda.com/no/products/1-grandiosa", searchTerm: "Grandiosa Original 575 g", productBrand: "Grandiosa", packageAmount: 575, packageUnit: "g" }), transport(), NOW);
  assert.equal(offer?.shopName, "Nærbutikken");
  assert.equal(offer?.amount, 59.9);
  assert.equal(offer?.matchedExactProduct, false);
  assert.match(offer!.alternatives![0]!.platform!, /^Gjelder et utvalg/);
  // Swedish/Finnish flyers (SEK/EUR) are never mixed in.
  assert.ok(offer!.alternatives!.every((alternative) => alternative.currency === "NOK"));
  // Outside the assortment's 430–575 g range.
  assert.equal(await findEtilbudsavisPriceMatch(message({ url: "https://oda.com/no/products/1-grandiosa", searchTerm: "Grandiosa Original 750 g", productBrand: "Grandiosa", packageAmount: 750, packageUnit: "g" }), transport(), NOW), undefined);
});

test("eTilbudsavis rejects other variants, other sizes, expired flyers and non-grocery pages", async () => {
  // Friele Frokost is not in the flyer (Mørkbrent/Bryggen 500 g and Instant are).
  assert.equal(await findEtilbudsavisPriceMatch(message({ searchTerm: "Friele Frokost Filtermalt 250 g", productBrand: "Friele", packageAmount: 250, packageUnit: "g" }), transport(), NOW), undefined);
  // Tine Lettmelk 1 l vs. 1,75 l in the flyer.
  assert.equal(await findEtilbudsavisPriceMatch(message({ searchTerm: "Tine Lettmelk 1 l", productBrand: "Tine", packageAmount: 1000, packageUnit: "ml" }), transport(), NOW), undefined);
  // The kaviar offer has expired by 9 November.
  assert.equal(await findEtilbudsavisPriceMatch(message({ searchTerm: "Mills Kaviar Tube 185 g", productBrand: "Mills", packageAmount: 185, packageUnit: "g" }), transport(), Date.parse("2026-11-09T12:00:00Z")), undefined);
  assert.equal(await findEtilbudsavisPriceMatch(message({ url: "https://www.komplett.no/product/1", searchTerm: "Mills Kaviar Tube 185 g", productBrand: "Mills", packageAmount: 185, packageUnit: "g" }), transport(), NOW), undefined);
  // Neither brand nor pack size: the title alone is too weak.
  assert.equal(await findEtilbudsavisPriceMatch(message({ searchTerm: "Kaviar tube" }), transport(), NOW), undefined);
});

test("eTilbudsavis offers without price, NOK or validity are dropped; transport errors are reported", async () => {
  const [kaviar] = fixture()["Mills kaviar"] as Array<Record<string, unknown>>;
  const broken = [
    { ...kaviar, pricing: { price: null, currency: "NOK" } },
    { ...kaviar, pricing: { price: 30, currency: "SEK" } },
    { ...kaviar, run_till: undefined },
  ];
  assert.equal(readEtilbudsavisOffers(broken).length, 0);
  assert.throws(() => readEtilbudsavisOffers({ error: "rate limited" }), /eTilbudsavis: uventet svar/);
  assert.equal(selectEtilbudsavisMatches(readEtilbudsavisOffers(fixture()["Mills kaviar"]), message({ searchTerm: "Mills Kaviar Tube 185 g", productBrand: "Mills", packageAmount: 185, packageUnit: "g" }), NOW).length, 1);
  await assert.rejects(
    findEtilbudsavisPriceMatch(message({ searchTerm: "Mills Kaviar Tube 185 g", productBrand: "Mills", packageAmount: 185, packageUnit: "g" }), async () => undefined, NOW),
    /eTilbudsavis: ingen svar fra https:\/\/squid-api\.tjek\.com\/v2\/offers\/search for «Mills Kaviar»/,
  );
});
