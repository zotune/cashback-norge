import assert from "node:assert/strict";
import { test } from "node:test";
import { findIsthereanydealPriceMatch } from "../src/shared/isthereanydeal-price-match.js";

// ITAD gir EUR-baserte priser omregnet til NOK, også for butikker med egne kronepriser.
const infoUrl = "https://isthereanydeal.com/game/id:test/info/";
const shops = { "16": ["Epic Game Store", 1], "35": ["GOG", 1], "61": ["Steam", 0], "77": ["Muve", 1] };
const html = `<script>var g = ${JSON.stringify({ user: { id: "visitor", token: "token" }, shops })};
var page = ${JSON.stringify(["Game/Info", { game: { id: "game-id", slug: "mw4", title: "Modern Warfare 4" } }])};
var sentry = null;</script>`;
const deals = [
  { shop: 61, priceNew: [73750, "NOK"] },
  { shop: 16, priceNew: [73750, "NOK"] },
  { shop: 35, priceNew: [73750, "NOK"] },
  { shop: 77, priceNew: [79988, "NOK"] },
];

const requestJson = async (url: string) => {
  if (url.includes("augmentedsteam")) return { prices: { "app/1": { urls: { info: infoUrl } } } };
  if (url.includes("/api/game/info/")) return { deals };
  return undefined;
};
const requestText = async (url: string) => (url === infoUrl ? html : undefined);

test("bruker sidens Steam-pris og dropper ITADs omregnede NOK-butikker", async () => {
  const offer = await findIsthereanydealPriceMatch(
    { type: "get-price-match-for-product", url: "https://store.steampowered.com/app/1/", searchTerm: "", price: 949, currency: "NOK" },
    requestJson,
    requestText,
  );

  assert.equal(offer?.shopName, "Muve");
  assert.equal(offer?.matchedCurrentMerchant, true);
  assert.deepEqual(offer?.alternatives?.map((deal) => [deal.shopName, deal.amount]), [["Muve", 799.88], ["Steam", 949]]);
});

test("viser ikke Steam når sidens pris mangler", async () => {
  const offer = await findIsthereanydealPriceMatch(
    { type: "get-price-match-for-product", url: "https://store.steampowered.com/app/1/", searchTerm: "" },
    requestJson,
    requestText,
  );

  assert.deepEqual(offer?.alternatives?.map((deal) => deal.shopName), ["Muve"]);
});
