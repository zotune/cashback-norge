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
