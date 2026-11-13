import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShopPageConfig } from "../src/backend/providers/rabatta.js";

// Live markup since November 2026: /no/shops/$webshopId, no config object.
function shopPage(id: string, heading: string, canonicalId = id, linkId = id): string {
  return `<html><head><title>${heading} | Rabatta</title>
    <link rel="canonical" href="https://rabatta.app/no/shops/${canonicalId}"/></head><body>
    <h1>${heading}</h1>
    <a class="_6fkcm1b" href="https://r.rabatta.app/webshop/v1?webshopId=${linkId}&amp;surface=website">Gå til nettbutikken</a>
    <script>"/{-$locale}/_marketing/shops/$webshopId":$R[13]={preloads:[]}</script></body></html>`;
}

test("Rabatta reads the webshop id from the numeric shop route", () => {
  assert.deepEqual(parseShopPageConfig(shopPage("1095", "Desenio rabattkode 2026"), "1095"), {
    displayName: "Desenio", slug: "1095", webshopId: 1095,
  });
  assert.deepEqual(parseShopPageConfig(shopPage("57", "ARKET-rabattkode 2026"), "57")?.displayName, "ARKET");
  assert.deepEqual(parseShopPageConfig(shopPage("42", "aim&#x27;n rabattkode 2026"), "42")?.displayName, "aim'n");
});

test("Rabatta rejects a numeric route the page does not confirm", () => {
  assert.equal(parseShopPageConfig(shopPage("1095", "Desenio rabattkode", "2000"), "1095"), undefined);
  assert.equal(parseShopPageConfig(shopPage("1095", "Desenio rabattkode", "1095", "2000"), "1095"), undefined);
  assert.equal(parseShopPageConfig(shopPage("desenio", "Desenio rabattkode"), "desenio"), undefined);
});

test("the older config payload still wins when present", () => {
  const html = `<script>x={config:{webshopId:77,displayName:"Old Name",webshopName:"old"}}</script>`;
  assert.deepEqual(parseShopPageConfig(html, "old"), { displayName: "Old Name", slug: "old", webshopId: 77 });
});
