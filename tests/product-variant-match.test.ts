import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProductMatchAnchor, hasModelTierConflict, hasProductVariantConflict, hasSameManufacturerCode } from "../src/shared/product-match.js";
import { findKlarnaPriceMatch } from "../src/shared/klarna-price-match.js";

const page = 'Samsung 85" U7005F UHD 4K smart-TV (2025)';
const anchor = buildProductMatchAnchor({ type: "get-price-match-for-product", url: "https://www.komplett.no/product/1321568/", searchTerm: page });

test("«4K Ultra HD» is a resolution, not the model tier of «Galaxy S25 Ultra»", () => {
  assert.equal(hasModelTierConflict(page, 'Samsung U7005 85" 4K Ultra HD LED Smart TV (2025) - TU85U7005F'), false);
  assert.equal(hasModelTierConflict("Sony Bravia 7 4K Ultra-HD", "Sony Bravia 7 4K"), false);
  assert.equal(hasModelTierConflict("Samsung Galaxy S25 Ultra 256GB", "Samsung Galaxy S25 256GB"), true);
  assert.equal(hasModelTierConflict("Samsung Galaxy S25 Ultra 256GB", "Samsung Galaxy S25 Ultra 256 GB svart"), false);
});

test("a shared «4K» is no shared model: U7005F and Q8F differ, TU85U7005F is the same TV", () => {
  assert.equal(hasProductVariantConflict(anchor, "Samsung 85 Q8F 4K QLED Smart TV"), true);
  assert.equal(hasProductVariantConflict(anchor, 'Samsung U7005 85" 4K Ultra HD LED Smart TV (2025) - TU85U7005F'), false);
  assert.equal(hasProductVariantConflict(anchor, "Samsung TU85U7005F"), false);
  // Without real model numbers on one side, the spec token still counts as before.
  assert.equal(hasProductVariantConflict(buildProductMatchAnchor({ type: "get-price-match-for-product", url: "https://x.no/", searchTerm: "LG 4K skjerm 27 tommer" }), "LG 27 tommer 4K skjerm"), false);
});

test("the same manufacturer code must match exactly; a series or a longer regional code does not", () => {
  const verified = 'Samsung U7005 85" 4K Ultra HD LED Smart TV (2025) - TU85U7005F';
  assert.equal(hasSameManufacturerCode(verified, "Samsung TU85U7005F"), true);
  assert.equal(hasSameManufacturerCode(verified, "Samsung 85 Inch 4K LED TV TU85U7005HUXNA"), false);
  assert.equal(hasSameManufacturerCode(verified, "Samsung U7005 85"), false);
  assert.equal(hasSameManufacturerCode("Sony WH-1000XM5", "Sony WH-1000XM5 sort"), true);
});

test("Klarna: another source's verified name finds a short-titled product by its exact manufacturer code", async () => {
  const urls: string[] = [];
  const products = [
    { id: "1", name: "Samsung 85 Inch 4K LED TV TU85U7005HUXNA", url: "/no/shopping/pl/cl1/1/", lowestPrice: { currency: "NOK", amount: "9990.00" } },
    { id: "2", name: "Samsung TU85U7005F", url: "/no/shopping/pl/cl1/2/", lowestPrice: { currency: "NOK", amount: "8990.00" } },
  ];
  const requestJson = async (url: string) => {
    urls.push(url);
    if (url.includes("/suggest/")) return { products: decodeURIComponent(url).includes("TU85U7005F") ? products : [products[0], { id: "3", name: "Samsung 85 Q8F 4K QLED Smart TV", url: "/no/shopping/pl/cl1/3/", lowestPrice: { currency: "NOK", amount: "13990.00" } }] };
    return undefined;
  };
  const message = { type: "get-price-match-for-product" as const, url: "https://www.komplett.no/product/1321568/", searchTerm: page, productPageClue: true };
  await findKlarnaPriceMatch(message, requestJson, { anchorSearchTerms: ['Samsung U7005 85" 4K Ultra HD LED Smart TV (2025) - TU85U7005F'] });
  assert.ok(urls.some((url) => url.includes("/offers/NO/2?")), "the TU85U7005F product's offers are read");
  assert.ok(!urls.some((url) => /\/offers\/NO\/[13]\?/.test(url)), "neither the HUXNA nor the Q8F product is used");

  urls.length = 0;
  await findKlarnaPriceMatch(message, requestJson);
  assert.ok(!urls.some((url) => url.includes("/offers/")), "the page title alone matches neither other model");
});

test("a Tek.no test copied by another source takes Tek's current grade for the same article and model", async () => {
  const { refreshTekCritic } = await import("../src/shared/tek-reviews.js");
  const copy = { site: "Tek.no", score: 9, maxScore: 10, url: "https://www.tek.no/samletest/i/k0WQBX/robotstoevsuger-samletest-midrange", title: "Roborock QR 798" };
  const item = (id: string, name: string, value: number, articleId = "k0WQBX") => ({ id, name, slug: name.toLowerCase().replace(/\s+/g, "-"),
    latestReview: { rating: { value, conclusion: `${name} er stadig et godt produkt.`, pros: ["Lett å sette opp"], cons: ["Små vanntanker"] }, articleId, sectionName: "samletest", articleSlug: "robotstoevsuger-samletest-midrange", title: "Samletest av mellomklasse robotstøvsugere" } });
  const respond = (items: unknown[]) => async () => ({ data: { reviewedProducts: { items } } });
  const refreshed = await refreshTekCritic(copy, respond([item("1", "Roborock Qrevo 798", 8), item("2", "Roborock Qrevo Curv 2", 9)]));
  assert.deepEqual([refreshed.score, refreshed.pros, refreshed.cons], [8, ["Lett å sette opp"], ["Små vanntanker"]]);
  // Another article, another model number, or two candidates: the copy stays as it is.
  assert.equal((await refreshTekCritic(copy, respond([item("1", "Roborock Qrevo 798", 8, "OTHER")]))).score, 9);
  assert.equal((await refreshTekCritic(copy, respond([item("1", "Roborock Qrevo 598", 7)]))).score, 9);
  assert.equal((await refreshTekCritic(copy, respond([item("1", "Roborock Qrevo 798", 8), item("2", "Roborock QR 798", 6)]))).score, 9);
  // «Pro» is another product: the Qrevo 798 stays the only match.
  assert.equal((await refreshTekCritic(copy, respond([item("1", "Roborock Qrevo 798", 8), item("2", "Roborock QR 798 Pro", 6)]))).score, 8);
  assert.equal((await refreshTekCritic({ ...copy, site: "Elkjøp" }, async () => { throw new Error("no request"); })).score, 9);
});
