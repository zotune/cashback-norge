import assert from "node:assert/strict";
import { test } from "node:test";
import { findGodprisPriceMatch } from "../src/shared/godpris-price-match.js";
import { isGodprisProductForOfferUrls } from "../src/shared/godpris-price-match.js";
import { findPrisradarPriceMatch, isPrisradarProductForOfferUrls } from "../src/shared/prisradar-price-match.js";
import { hasTcgProductVariantConflict, readTcgProductKind } from "../src/shared/tcg-product-match.js";
import { buildProductMatchAnchor, hasPercentageVariantConflict, hasProductVariantConflict } from "../src/shared/product-match.js";
import { readComparisonProductLdJson, readNextProductData, readStructuredProductCodes, readProductLanguage } from "../src/shared/product-data.js";
import type { GetPriceMatchForProductMessage } from "../src/shared/extension-messages.js";

const url = "https://godpris.no/produkt/12345";
const message: GetPriceMatchForProductMessage = { type: "get-price-match-for-product", url,
  searchTerm: "Pokémon Future Aurora Elite Trainer Box", productPageClue: true };
const seller = (extra = {}) => ({ "@type": "Offer", seller: { name: "Kortbutikk" }, price: 1048,
  priceCurrency: "NOK", availability: "InStock", url: "https://shop.example/item", ...extra });
function schema(offers: unknown[]) {
  return `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Future Aurora Elite Trainer Box",
    brand: { name: "Pokémon" }, offers: { "@type": "AggregateOffer", lowPrice: 1, offers } })}</script>`;
}

test("current Godpris JSON-LD provides concrete seller prices on direct and searched product pages", async () => {
  let searches = 0;
  const json = async () => { searches += 1; return { results: [{ id: 12345, title: message.searchTerm }] }; };
  const text = async () => schema([seller({ price: 999, availability: "OutOfStock" }), seller(), seller({ price: 1199, seller: { name: "Annen butikk" } })]);
  const result = await findGodprisPriceMatch(message, json, text);
  assert.equal(searches, 0);
  assert.equal(result?.amount, 1048);
  assert.equal(result?.matchedExactProduct, true);
  assert.equal(result?.productUrl, url);
  assert.equal(result?.offerUrl, "https://shop.example/item");
  assert.deepEqual(result?.alternatives?.map((offer) => offer.amount), [1048, 1199]);
  assert.equal(result?.alternatives?.[0]?.shippingPrice, "Frakt ukjent");
  assert.equal((await findGodprisPriceMatch({ ...message, url: "https://shop.example/item" }, json, text))?.amount, 1048);
  assert.equal(searches, 1);
});

test("Godpris does not turn aggregate lows, preorders, unknown stock or currency into offers", async () => {
  for (const extra of [
    { availability: "PreOrder" }, { availability: "Unknown" }, { availability: undefined },
    { isPreorder: true }, { is_preorder: true }, { priceCurrency: "SEK" }, { priceCurrency: undefined },
    { price: null }, { price: 0 }, { price: "1048 trailing" }, { itemCondition: "https://schema.org/UsedCondition" },
  ]) assert.equal(await findGodprisPriceMatch(message, async () => undefined, async () => schema([seller(extra)])), undefined);
  assert.equal(await findGodprisPriceMatch(message, async () => undefined, async () => schema([])), undefined);
  assert.equal(await findGodprisPriceMatch(message, async () => undefined, async () => schema([seller()]).replaceAll("Elite Trainer Box", "Booster Pack")), undefined);
});

test("the older Godpris Inertia payload is still supported", async () => {
  const page = { props: { product: { id: 12345, title: message.searchTerm }, prices: [{ price: 1099, shop: { title: "Eldre butikk" }, availability: "in_stock" }] } };
  const html = `<div id="app" data-page="${JSON.stringify(page).replaceAll('"', "&quot;")}"></div>`;
  assert.equal((await findGodprisPriceMatch(message, async () => undefined, async () => html))?.amount, 1099);
});

function flight(value: unknown): string {
  return `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(value)}\n`])})</script>`;
}
test("Prisradar metadata and codes come from the full record for the current URL, not Flight references or recommendations", () => {
  const productUrl = "https://prisradar.no/produkter/future-aurora-box";
  const product = { title: message.searchTerm, url: productUrl, ean: "0196214142138", brand: { title: "Pokémon" }, offers: [],
    attributes: { grouped: [{ values: [{ title: "Språk", value: "Engelsk" }] }] } };
  const html = flight({ recommendation: { ...product, title: "Wrong recommendation", url: "https://prisradar.no/produkter/other" } }) +
    flight({ product: { ...product, offers: "$5:product:offers" } }) + flight({ product });
  assert.deepEqual(readNextProductData(html, productUrl), product);
  const meta = readComparisonProductLdJson(html, productUrl);
  assert.equal(meta?.name, message.searchTerm);
  assert.deepEqual(readStructuredProductCodes(meta), ["0196214142138"]);
  assert.equal(readProductLanguage(meta, [String(meta?.name)]), "en");
  assert.equal(readComparisonProductLdJson(html, "https://evilprisradar.no/produkter/future-aurora-box"), undefined);
  assert.equal(readComparisonProductLdJson(html, "https://prisradar.no/kategorier/pokemon"), undefined);
  assert.equal(readNextProductData(html, "https://prisradar.no/produkter/missing"), undefined);
});

test("comparison identity checks require a valid retailer GTIN and the current source product ID", async () => {
  const urls = ["https://shop.example/product-0196214142138"];
  assert.equal(await isGodprisProductForOfferUrls(message, urls, async () => ({ results: [{ id: 12345, title: message.searchTerm }] })), true);
  assert.equal(await isGodprisProductForOfferUrls(message, urls, async () => ({ results: [{ id: 999, title: message.searchTerm }] })), false);
  const current = { ...message, url: "https://prisradar.no/produkter/future-aurora" };
  assert.equal(await isPrisradarProductForOfferUrls(current, urls, async () => ({ data: { suggestions: { products: [{ id: 1, slug: "future-aurora", title: message.searchTerm }] } } })), true);
  assert.equal(await isPrisradarProductForOfferUrls(current, urls, async () => ({ data: { suggestions: { products: [{ id: 2, slug: "different", title: message.searchTerm }] } } })), false);
  assert.equal(await isPrisradarProductForOfferUrls({ ...current, url: "https://evilprisradar.no/produkter/future-aurora" }, urls, async () => { throw Error("Must not request"); }), false);
  assert.equal(await isGodprisProductForOfferUrls(message, ["https://shop.example/product-0196214142139"], async () => { throw Error("Invalid GTIN must not request"); }), false);
});

test("TCG form aliases retain packaging, language and stadium distinctions", () => {
  assert.equal(readTcgProductKind("Pokémon Twilight Masquerade Elite Trainer Boks Kortspill fra Outland"), "etb");
  assert.equal(readTcgProductKind("Pokémon Annihilape ex Box"), "collection-box");
  assert.equal(readTcgProductKind("Pokémon Lumiose City Mini Tin with booster packs"), "mini-tin");
  assert.equal(hasTcgProductVariantConflict("Pokémon Paldean Fates Mini Tin Display", "Pokémon Paldean Fates Mini Tin"), true);
  assert.equal(hasTcgProductVariantConflict("Pokémon Paradox Rift Build & Battle Stadium", "Pokémon Paradox Rift Build & Battle"), true);
  assert.equal(hasTcgProductVariantConflict("Pokémon Silver Tempest Booster Box (ES)", "Pokémon Silver Tempest Booster Box English"), true);
  assert.equal(hasTcgProductVariantConflict("Pokémon First Partner Illustration Collection Series 1 Booster Pack", "Pokémon First Partner Illustration Collection Series 1"), true);
});

test("the shared full Next product record also feeds Prisradar offer extraction and excludes preorders", async () => {
  const productUrl = "https://prisradar.no/produkter/future-aurora";
  const html = flight({ product: { title: message.searchTerm, url: productUrl, offers: [
    { price: 990, shop: { title: "Forhåndsbestilling" }, availability: "pre_order" },
    { price: 1048, shop: { title: "På lager" }, availability: "in_stock" },
  ] } });
  const result = await findPrisradarPriceMatch({ ...message, url: productUrl }, async () => undefined, async () => html);
  assert.equal(result?.amount, 1048);
  assert.equal(result?.alternatives?.length, 1);
});

test("a percentage in both titles is a variant: fat, cocoa or alcohol content must match", () => {
  const anchor = { searchTerm: "Tine Lettmelk 1% fett 1,75 l" };
  // Godpris offered «TINE Lettmelk 0,5% 1,75l» on Oda's 1 % page.
  assert.equal(hasPercentageVariantConflict(anchor.searchTerm, "TINE Lettmelk 0,5% 1,75l"), true);
  assert.equal(hasProductVariantConflict(anchor, "TINE Lettmelk 0,5% 1,75l"), true);
  assert.equal(hasProductVariantConflict(anchor, "Tine Lettmelk 1% 1,75 l"), false);
  assert.equal(hasPercentageVariantConflict("Lindt Excellence 70 % kakao", "Lindt Excellence 85% Cocoa"), true);
  assert.equal(hasPercentageVariantConflict("Tine Lettmelk 0,5 %", "TINE LETTMELK 0,5% 1L"), false);
  // Only one side states a percentage: not decided here.
  assert.equal(hasPercentageVariantConflict("Tine Lettmelk 1,75 l", "TINE Lettmelk 0,5% 1,75l"), false);
});

test("the percentage variant is read from the page title when the product name lacks it (Oda)", () => {
  const anchor = buildProductMatchAnchor({
    type: "get-price-match-for-product", url: "https://oda.com/no/products/8143-tine-tine-lettmelk-1-fett/",
    searchTerm: "Tine Lettmelk", productTitleCandidates: ["Tine Lettmelk", "Tine Lettmelk - 1% fett, 1,75 l - Oda"],
  } as GetPriceMatchForProductMessage);
  assert.equal(anchor.variantText, "Tine Lettmelk - 1% fett, 1,75 l - Oda");
  assert.equal(hasProductVariantConflict(anchor, "TINE Lettmelk 0,5% 1,75l"), true);
  assert.equal(hasProductVariantConflict(anchor, "TINE Lettmelk 1,0% 1,75l"), false);
});
