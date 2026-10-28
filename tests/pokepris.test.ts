import assert from "node:assert/strict";
import { test } from "node:test";
import { findPokeprisPriceMatch, isPokeprisProductUrl } from "../src/shared/pokepris-price-match.js";
import { findPriceMatches } from "../src/shared/price-match.js";
import { hasProductVariantConflict, isValidGtin, readProductCodesFromUrl } from "../src/shared/product-match.js";
import { isKlarnaProductForOfferUrls, findKlarnaPriceMatch } from "../src/shared/klarna-price-match.js";
import { findPrisjaktPriceMatch } from "../src/shared/prisjakt-price-match.js";
import { excludeVerifiedPreorders, type VerifiedPriceMatchAvailability } from "../src/shared/price-match-availability.js";
import type { PriceMatchOffer } from "../src/shared/extension-messages.js";
import { findTypedLdJson, parseLdJson, readLdJsonScripts, readNextFlightValues, readProductOfferLanguage, selectProductLdJson } from "../src/shared/product-data.js";
import { formatPrice, readPriceAmount } from "../src/shared/price.js";
import { type GetPriceMatchForProductMessage, isGetPriceMatchForProductMessage } from "../src/shared/extension-messages.js";
import { PROVIDER_COLORS } from "../src/shared/provider-data.js";

const productUrl = "https://www.pokepris.no/produkt/3594";
const merchantUrl = "https://cards.example/products/prismatic-evolutions-etb";
const actionId = "40" + "a".repeat(40);
const message: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product", url: merchantUrl,
  searchTerm: "Pokémon Prismatic Evolutions Elite Trainer Box",
  productPageClue: true, price: 2499, currency: "NOK",
};

function offer(price: unknown, availability = "InStock", url = merchantUrl) {
  return { "@type": "Offer", price, priceCurrency: "NOK", availability: `https://schema.org/${availability}`,
    itemCondition: "https://schema.org/NewCondition", seller: { name: "Kortbutikk" }, url };
}

function page(options: { language?: string; name?: string; offers?: unknown[] } = {}) {
  return `<script type="application/ld+json">${JSON.stringify({ "@type": "Product",
    brand: { "@type": "Brand", name: "Pokémon" },
    name: options.name ?? "Prismatic Evolutions Elite Trainer Box",
    additionalProperty: [{ name: "Kortsett", value: "Prismatic Evolutions" }, { name: "Språk", value: options.language ?? "Engelsk" }],
    offers: { "@type": "AggregateOffer", lowPrice: 99, priceCurrency: "NOK",
      offers: options.offers ?? [offer(899, "OutOfStock"), offer(2199), offer(2499, "InStock", "https://other.example/item")] },
  })}</script>`;
}

function transport(productPage = page(), products: unknown[] = [{ id: 3594, name: "Prismatic Evolutions Elite Trainer Box" }]) {
  const requests: Array<{ url: string; init?: { method?: string; body?: string; headers?: Record<string, string> } }> = [];
  const request = async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    requests.push({ url, ...(init !== undefined ? { init } : {}) });
    if (url === productUrl) return productPage;
    if (init?.method === "POST") {
      assert.equal(init.headers?.["Next-Action"], actionId);
      return `0:{"a":"$@1"}\n1:${JSON.stringify({ products })}\n`;
    }
    if (url.endsWith(".js")) return `r=(0,t.createServerReference)("${actionId}",t.callServer,void 0,t.findSourceMapURL,"getProducts");`;
    return '<script src="/_next/static/chunks/current-deploy.js"></script>';
  };
  return { request, requests };
}

test("Pokepris uses the discovered search action and concrete in-stock offers, with the full price-list link", async () => {
  const { request, requests } = transport();
  const result = await findPokeprisPriceMatch(message, request);
  assert.equal(result?.source, "pokepris");
  assert.equal(result?.productUrl, productUrl);
  assert.equal(result?.offerUrl, merchantUrl);
  assert.equal(result?.amount, 2199);
  assert.equal(result?.matchedExactProduct, true);
  assert.deepEqual(result?.alternatives?.map((item) => item.amount), [2199, 2499]);
  assert.equal(result?.alternatives?.[0]?.shippingPrice, "Frakt ukjent");
  assert.match(result?.details ?? "", /Engelsk/);
  assert.match(result?.details ?? "", /hele prislisten/);
  const body = JSON.parse(requests.find((entry) => entry.init?.method === "POST")!.init!.body!);
  assert.equal(body[0].search, "Prismatic Evolutions Elite Trainer Box");
  assert.equal(body[0].inStockOnly, true);
  assert.equal(body[0].limit, 12);
});

test("direct Pokepris product pages use one request and also work through the full pipeline", async () => {
  const { request, requests } = transport();
  const result = await findPokeprisPriceMatch({ ...message, url: productUrl }, request);
  assert.equal(result?.amount, 2199);
  assert.equal(requests.length, 1);
  const matches = await findPriceMatches({ ...message, url: productUrl }, async () => undefined, async (url) => url === productUrl ? page() : undefined);
  assert.equal(matches.find((item) => item.source === "pokepris")?.productUrl, productUrl);
});

test("does not send unrelated products to Pokepris or accept wrong set, form or language", async () => {
  const { request, requests } = transport();
  assert.equal(await findPokeprisPriceMatch({ ...message, searchTerm: "Sony WH1000XM6" }, request), undefined);
  assert.equal(requests.length, 0);
  for (const html of [page({ language: "Japansk" }), page({ name: "Prismatic Evolutions Booster Pack" }), page({ name: "Journey Together Elite Trainer Box" })]) {
    assert.equal(await findPokeprisPriceMatch({ ...message, searchTerm: `${message.searchTerm} Engelsk` }, transport(html).request), undefined);
  }
});

test("rejects ambiguous language without an exact merchant URL and never infers stock or zero price", async () => {
  for (const offers of [[offer(0)], [offer(null)], [offer("2199 trailing text")], [offer(599, "PreOrder")], [offer(899, "OutOfStock")], [offer(2199, "Unknown")]]) {
    assert.equal(await findPokeprisPriceMatch(message, transport(page({ offers })).request), undefined);
  }
  const { request } = transport();
  assert.equal(await findPokeprisPriceMatch({ ...message, url: "https://unlisted.example/product" }, request), undefined);
  assert.equal(await findPokeprisPriceMatch({ ...message, url: `${merchantUrl}?variant=japanese` }, request), undefined);
  assert.ok(await findPokeprisPriceMatch({ ...message, url: "https://unlisted.example/product", searchTerm: `${message.searchTerm} Engelsk` }, request));
});

test("lookup and script discovery stay bounded; external scripts are never requested", async () => {
  const urls: string[] = [];
  await assert.rejects(findPokeprisPriceMatch(message, async (url) => {
    urls.push(url);
    if (url === "https://www.pokepris.no/") return '<script src="https://outside.example/evil.js"></script>' + Array.from({ length: 50 }, (_, index) => `<script src="/_next/static/chunks/${index}.js"></script>`).join("");
    return "no search action";
  }), /Pokepris.*search action/);
  assert.equal(urls.filter((url) => url.includes("/chunks/")).length, 16);
  assert.ok(urls.length <= 18);
  assert.ok(urls.every((url) => url.startsWith("https://www.pokepris.no/")));
  const fixture = transport(page({ offers: [] }), Array.from({ length: 15 }, (_, index) => ({ id: index + 1, name: "Prismatic Evolutions Elite Trainer Box" })));
  await findPokeprisPriceMatch(message, fixture.request);
  assert.equal(fixture.requests.filter((entry) => entry.url.includes("/produkt/")).length, 3);
});

test("transport errors retain their cause, malformed responses fail, and unrelated sources survive", async () => {
  await assert.rejects(findPokeprisPriceMatch(message, async () => { throw new Error("connection reset"); }), /connection reset/);
  const fixture = transport();
  await assert.rejects(findPokeprisPriceMatch(message, async (url, init) => init?.method === "POST" ? "unexpected format" : fixture.request(url, init)), /invalid getProducts response/);
  await assert.doesNotReject(findPriceMatches({ ...message, url: productUrl }, async () => undefined, async () => { throw new Error("HTTP 429"); }));
});

test("extension transport uses public structured set pages when Next actions are unavailable", async () => {
  const urls: string[] = [];
  const request = async (url: string) => {
    urls.push(url);
    if (url === productUrl) return page();
    if (url.endsWith("/sett/prismatic-evolutions")) return `<script type="application/ld+json">${JSON.stringify({ "@type": "ItemList", itemListElement: [{ item: { "@type": "Product", name: "Prismatic Evolutions Elite Trainer Box", url: productUrl } }] })}</script>`;
    if (url.endsWith("/sett")) return '<a href="/sett/prismatic-evolutions">Prismatic Evolutions</a><a href="/sett/journey-together">Journey Together</a>';
    return '<a href="/sett">Alle sett</a>';
  };
  const result = await findPokeprisPriceMatch(message, request, { useSearchApi: false });
  assert.equal(result?.productUrl, productUrl);
  assert.equal(result?.amount, 2199);
  assert.equal(urls.length, 4);
  assert.ok(urls.every((url) => !url.includes("/chunks/")));
});

test("TCG variant guards are shared and Pokepris branding is black and white", () => {
  for (const [first, second] of [
    ["Pokémon Prismatic Evolutions Booster Pack", "Pokémon Prismatic Evolutions Booster Box"],
    ["Pokémon Prismatic Evolutions ETB", "Pokémon Prismatic Evolutions Pokemon Center ETB"],
    ["Pokémon Prismatic Evolutions ETB Engelsk", "Pokémon Prismatic Evolutions ETB Japansk"],
  ]) assert.equal(hasProductVariantConflict({ searchTerm: first! }, second!), true);
  assert.equal(hasProductVariantConflict({ searchTerm: "Pokémon Prismatic Evolutions ETB" }, "Pokémon Prismatic Evolutions Elite Trainer Box"), false);
  assert.deepEqual(PROVIDER_COLORS.pokepris, { bg: "#000000", fg: "#ffffff", preserveInDark: true });
  assert.equal(isPokeprisProductUrl("https://pokepris.no.evil.example/produkt/3594"), false);
  assert.equal(isPokeprisProductUrl("https://pokepris.no/?q=etb"), false);
});

test("shared structured-data and price helpers preserve metadata and reject partial numbers", () => {
  const product = findTypedLdJson(parseLdJson('{"@graph":[{"@type":["Product"],"name":"Pok&#xE9;mon"}]}'), "Product");
  assert.equal(product?.name, "Pokémon");
  assert.equal(findTypedLdJson(readLdJsonScripts('<script type="application/ld+json">broken</script>' + page()), "Product")?.name, "Prismatic Evolutions Elite Trainer Box");
  for (const value of ["1 299,50", "1\u00a0299.50", 1299.5]) assert.equal(readPriceAmount(value), 1299.5);
  for (const value of [null, "", "1299 kr", "NaN", Infinity, -1, "1,2,3"]) assert.equal(readPriceAmount(value), undefined);
  assert.equal(readPriceAmount(0), 0);
  assert.match(formatPrice(1299.5, "NOK"), /1\s299,5\s*kr/);
});

function flight(value: unknown): string {
  return `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(value)}\n`])})</script>`;
}

test("public taxonomy lookup supports an unseen set and product ID without a curated product list", async () => {
  const name = "Future Aurora Elite Trainer Box";
  const target = "https://www.pokepris.no/produkt/987654321";
  const calls: string[] = [];
  const request = async (url: string) => {
    calls.push(url);
    if (url === target) return page({ name });
    if (url.endsWith("/sett/future-aurora")) return `<script type="application/ld+json">${JSON.stringify({ "@type": "ItemList", itemListElement: [{ item: { name, url: target } }] })}</script>`;
    return flight({ seriesWithSets: [{ sets: [{ name: "Future Aurora" }] }] });
  };
  const result = await findPokeprisPriceMatch({ ...message, searchTerm: `Pokémon ${name}` }, request, { useSearchApi: false });
  assert.equal(result?.productUrl, target);
  assert.deepEqual(calls, ["https://www.pokepris.no/", "https://www.pokepris.no/sett/future-aurora", target]);
});

test("a verified product can share preorder facts even when it has no in-stock offer", async () => {
  const facts: VerifiedPriceMatchAvailability[] = [];
  const html = page({ offers: [offer(990)] }) + flight({ lowestPrice: { product_url: merchantUrl, is_preorder: true } });
  const result = await findPokeprisPriceMatch(message, transport(html).request, { onVerifiedAvailability: (fact) => facts.push(fact) });
  assert.equal(result, undefined);
  assert.deepEqual(facts[0]?.preorders, [{ shopName: "Kortbutikk", amount: 990, currency: "NOK" }]);
  assert.equal(facts[0]?.productUrl, productUrl);
});

test("Japanese products use the public taxonomy, accept missing set metadata, and normalize JP/Japansk and box/display/boks", async () => {
  const target = "https://www.pokepris.no/produkt/3326";
  const merchant = "https://www.maxgaming.no/no/pokemon/pokemon-mega-dream-ex-booster-boks-japansk";
  const calls: string[] = [];
  const request = async (url: string) => {
    calls.push(url);
    if (url === target) return page({ name: "Mega Dream Ex Booster Box [JP]", language: "Japansk", offers: [offer(949, "OutOfStock"), offer(1249, "InStock", merchant)] })
      .replace('{"name":"Kortsett","value":"Prismatic Evolutions"},', "");
    if (url.endsWith("/sett/mega-dream-ex")) return `<script type="application/ld+json">${JSON.stringify({ "@type": "ItemList", itemListElement: [{ item: { name: "Mega Dream Ex Booster Box [JP]", url: target } }] })}</script>`;
    return flight(["$", "Component", null, { seriesWithSets: [{ series: "Other", sets: [{ name: "Mega Dream ex", count: 4 }] }] }]);
  };
  for (const title of ["Pokémon Mega Dream ex Booster Box (Japansk)", "Pokémon Mega Dream ex Boosterboks Japanese", "Pokémon TCG Mega Dream ex Booster Box Display"]) {
    const result = await findPokeprisPriceMatch({ ...message, url: merchant, searchTerm: title, productLanguage: "jp" }, request, { useSearchApi: false });
    assert.equal(result?.productUrl, target, title);
    assert.equal(result?.amount, 1249);
    assert.match(result?.details ?? "", /Japansk/);
    assert.equal(await findPokeprisPriceMatch({ ...message, url: merchant, searchTerm: title, productLanguage: "en" }, request, { useSearchApi: false }), undefined);
  }
  assert.ok(calls.includes("https://www.pokepris.no/sett/mega-dream-ex"));
  assert.ok(!calls.includes("https://www.pokepris.no/sett"));
});

test("a comparison page only derives language from offers for its exact product, and mixed languages remain unknown", () => {
  const html = flight(["$", "Offers", null, { offerRows: [
    { productId: 15845117, name: "Pokémon Mega Dream ex Booster Box (Japansk)" },
    { productId: 15845117, name: "Mega Dream ex Boosterboks JP" },
    { productId: 99, name: "Journey Together Booster Box English" },
  ] }]);
  assert.equal(readProductOfferLanguage(html, "15845117"), "jp");
  assert.equal(readProductOfferLanguage(html, "100"), undefined);
  assert.equal(readProductOfferLanguage(html.replace("Boosterboks JP", "Boosterboks English"), "15845117"), undefined);
  assert.deepEqual(readNextFlightValues('<script>self.__next_f.push([1,"1:{\\"ok\\":true}\\n"])</script>'), [{ ok: true }]);
  assert.equal(isGetPriceMatchForProductMessage({ ...message, productLanguage: "jp" }), true);
  assert.equal(isGetPriceMatchForProductMessage({ ...message, productLanguage: 5 }), false);
  assert.equal(hasProductVariantConflict({ searchTerm: "Pokémon Mega Dream ex Booster Box", productLanguage: "jp" }, "Pokémon Mega Dream ex Booster Box English"), true);
});

test("unknown language on a comparison page requires the retailer URL to resolve to the exact Prisjakt product ID", async () => {
  const fixture = transport();
  const comparisonMessage = { ...message, url: "https://www.prisjakt.no/product.php?p=15845117" };
  let calls = 0;
  const requestJson = async (_url: string, init?: { body?: string }) => {
    const request = JSON.parse(init?.body ?? "{}");
    if (request.operationName === "OfferList") return { data: { product: { offers: [] } } };
    calls += 1;
    assert.equal(request.operationName, "SearchProductsByOfferURL");
    assert.equal(request.variables.offerUrl, merchantUrl);
    return { data: { productsByOfferUrl: [{ id: 15845117, name: message.searchTerm, webUri: comparisonMessage.url }] } };
  };
  const result = await findPokeprisPriceMatch(comparisonMessage, fixture.request, { requestJson });
  assert.equal(result?.productUrl, productUrl);
  assert.equal(result?.matchedExactProduct, true);
  assert.equal(result?.matchedCurrentMerchant, false);
  assert.equal(calls, 1);
  const wrongId = await findPokeprisPriceMatch(comparisonMessage, fixture.request, { requestJson: async () => ({ data: { productsByOfferUrl: [{ id: 99, name: message.searchTerm, webUri: "https://www.prisjakt.no/product.php?p=99" }] } }) });
  assert.equal(wrongId, undefined);
});

test("a review widget's nameless Product cannot replace the real product during refresh", () => {
  const review = { "@type": "Product", "@id": "#product", aggregateRating: { ratingValue: 4.9 } };
  const product = { "@type": "Product", name: "Pokémon Mega Dream ex Booster Box (Japansk)", offers: { price: 1249 } };
  assert.equal(selectProductLdJson([review, product]), product);
  assert.equal(selectProductLdJson({ "@graph": [review, product] }), product);
  assert.equal(selectProductLdJson([review]), undefined);
});

test("explicit preorder data takes precedence over generic InStock JSON-LD", async () => {
  const html = page({ offers: [offer(1249), offer(1499, "InStock", "https://other.example/item")] }) +
    flight(["$", "Prices", null, { otherInStockPrices: [{ product_url: merchantUrl, in_stock: true, is_preorder: true }] }]);
  const result = await findPokeprisPriceMatch({ ...message, searchTerm: `${message.searchTerm} Engelsk` }, transport(html).request);
  assert.equal(result?.amount, 1499);
  assert.equal(result?.alternatives?.length, 1);
});

test("an older Charizard collection cannot match Mega Charizard X just because most words overlap", async () => {
  const html = page({ name: "Charizard Ultra Premium Collection" }).replace('{"name":"Kortsett","value":"Prismatic Evolutions"},', "");
  const fixture = transport(html, [{ id: 3594, name: "Charizard Ultra Premium Collection" }]);
  assert.equal(await findPokeprisPriceMatch({ ...message, url: "https://unlisted.example/mega-charizard", searchTerm: "Pokémon Mega Charizard X ex Ultra Premium Collection English" }, fixture.request), undefined);
});

test("Klarna comparison pages require a valid retailer GTIN to resolve to their own product ID", async () => {
  const klarnaMessage = { ...message, url: "https://www.klarna.com/no/shopping/pl/cl613/3584064629/Kort-brettspill/Pokemon-Pitch-Black-Elite-Trainer-Box/", searchTerm: "Pokémon Mega Evolution Pitch Black Elite Trainer Box" };
  const urls = ["https://www.norli.no/pokemon-pitch-black-0196214142138"];
  assert.equal(isValidGtin("0196214142138"), true);
  assert.equal(isValidGtin("0196214142139"), false);
  assert.deepEqual(readProductCodesFromUrl(urls[0]!), ["0196214142138"]);
  let calls = 0;
  const request = async (url: string) => {
    calls += 1;
    assert.equal(new URL(url).searchParams.get("q"), "0196214142138");
    return { products: [{ id: "3584064629", name: klarnaMessage.searchTerm, url: "/pl/3584064629/", lowestPrice: { currency: "NOK" } }] };
  };
  assert.equal(await isKlarnaProductForOfferUrls(klarnaMessage, urls, request), true);
  assert.equal(calls, 1);
  assert.equal(await isKlarnaProductForOfferUrls({ ...klarnaMessage, url: klarnaMessage.url.replace("3584064629", "999") }, urls, request), false);
  assert.equal(await isKlarnaProductForOfferUrls(klarnaMessage, [urls[0]!.replace("2138", "2139")], request), false);
  assert.equal(calls, 2);
});

test("a sold-out merchant URL can verify the product without its sold-out price being shown", async () => {
  const fixture = transport(page({ offers: [offer(899, "OutOfStock"), offer(1499, "InStock", "https://other.example/item")] }));
  const result = await findPokeprisPriceMatch(message, fixture.request);
  assert.equal(result?.amount, 1499);
  assert.equal(result?.matchedCurrentMerchant, true);
  assert.deepEqual(result?.alternatives?.map((item) => item.amount), [1499]);
});

test("verified preorder facts remove the exact price from other sources and recompute their best offer", () => {
  const facts: VerifiedPriceMatchAvailability[] = [{ productName: "Pokémon Pitch Black Elite Trainer Box", productUrl: "https://www.pokepris.no/produkt/6501", preorders: [{ shopName: "Cardcenter", amount: 990, currency: "NOK" }] }];
  const source: PriceMatchOffer = { source: "prisjakt", productName: "Pokémon TCG Mega Evolution Pitch Black Elite Trainer Box", productUrl: "https://www.prisjakt.no/product.php?p=16669514", offerUrl: "https://old.example/preorder", shopName: "Cardcenter.no", amount: 990, price: "990 kr", currency: "NOK", sortAmount: 1029, alternatives: [
    { shopName: "Cardcenter.no", amount: 990, price: "990 kr", currency: "NOK", sortAmount: 1029 },
    { shopName: "Norli", amount: 1099, price: "1099 kr", currency: "NOK", sortAmount: 1099 },
  ] };
  const result = excludeVerifiedPreorders(source, facts);
  assert.equal(result?.shopName, "Norli");
  assert.equal(result?.amount, 1099);
  assert.equal(result?.sortAmount, 1099);
  assert.equal(result?.offerUrl, undefined);
  assert.match(result?.details ?? "", /forhåndsbestilling/);
  assert.equal(excludeVerifiedPreorders({ ...source, alternatives: source.alternatives!.slice(0, 1) }, facts), undefined);
  assert.equal(excludeVerifiedPreorders({ ...source, productName: "Pokémon Pitch Black Booster Box" }, facts)?.amount, 990);
  assert.equal(excludeVerifiedPreorders({ ...source, amount: 995, alternatives: undefined }, facts)?.amount, 995);
});

test("Klarna and Prisjakt reject explicit preorder statuses using the shared rule", async () => {
  const klarna = await findKlarnaPriceMatch({ ...message, url: "https://www.klarna.com/no/shopping/pl/3584064629/" }, async () => ({ merchants: { "1": { name: "Preorder shop" }, "2": { name: "Stock shop" } }, offers: [
    { merchantId: "1", price: { amount: "990", currency: "NOK" }, stockStatus: "PRE_ORDER" },
    { merchantId: "2", price: { amount: "1099", currency: "NOK" }, stockStatus: "IN_STOCK" },
  ] }));
  assert.equal(klarna?.shopName, "Stock shop");
  const prisjakt = await findPrisjaktPriceMatch(message, async (_url, init) => {
    const operation = JSON.parse(init?.body ?? "{}").operationName;
    if (operation === "SearchProductsByOfferURL") return { data: { productsByOfferUrl: [{ id: 42, name: message.searchTerm, webUri: "https://www.prisjakt.no/product.php?p=42" }] } };
    if (operation === "OfferList") return { data: { product: { offers: [
      { shop: { name: "Preorder shop", currency: "NOK" }, price: { exclShipping: 990 }, stock: { status: "pre_order" } },
      { shop: { name: "Stock shop", currency: "NOK" }, price: { exclShipping: 1099 }, stock: { status: "in_stock" } },
    ] } } };
    return undefined;
  });
  assert.equal(prisjakt?.shopName, "Stock shop");
});
