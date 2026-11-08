import { test } from "node:test";
import assert from "node:assert/strict";
import { readKlarnaProReviews, readKlarnaUserReviews, buildReviewAiPrompt, isNorwegianReviewUrl, isProductReviews, readGodprisReviewCards, readJsonLdUserRating, summarizeProductReviews, toHundredScale } from "../src/shared/product-reviews.js";

// Godpris' "Tester" section for Logitech G PRO X2 Superstrike (godpris.no/produkt/15346856, 2026-11-08), shortened.
const card = (href: string, site: string, score: string, max: string, title: string, quote: string) =>
  `<a href="${href}" rel="nofollow noopener" target="_blank" title="Les test hos ${site}" class="review-card" > <div class="review-card__badge"> <span class="sr-only">${site}: ${score} av ${max}</span> <span class="review-card__score" aria-hidden="true">${score}</span> <span class="review-card__max" aria-hidden="true">av ${max}</span> </div> <div class="review-card__body"> <span class="review-card__site">${site}</span> <h3 class="review-card__title">${title}</h3> <p class="review-card__quote">«${quote}»</p> <span class="review-card__link"> Les test </span> </div> </a>`;
const godprisHtml = `<h2 id="tester">Tester</h2><div class="test-section"><div class="wrapper">${[
  card("https://www.trustedreviews.com/reviews/logitech-g-pro-x2-superstrike?utm_source=godpris.no", "Trusted Reviews", "4.5", "5", "Logitech G Pro X2 Superstrike Review", "One of the most revolutionary peripherals I&#039;ve ever tested."),
  card("https://global.techradar.com/no-no/gaming/gaming-accessories/test-logitech-pro-x2-superstrike?utm_source=godpris.no", "techradar", "4.75", "5", "Test av Logitech Pro X2 Superstrike", "Den nye toppstandarden."),
  card("https://komputer.no/pc-utstyr/mus/logitech-g-pro-x2-superstrike?utm_source=godpris.no", "Komputer for alle", "9.4", "10", "Logitech G Pro X2 Superstrike", "Nyutviklede magnetiske brytere."),
  card("https://www.tomshardware.com/peripherals/gaming-mice/logitech-g-pro-x2-superstrike-review?utm_source=godpris.no", "Tom&#039;s Hardware", "4.5", "5", "Changing the Game", "Innovative and excellent."),
  `<a href="https://www.tek.no/samletest/i/bmqlQA/vi-har-testet-ultralette-traadloese-gamingmus?utm_source=godpris.no" rel="nofollow noopener" target="_blank" title="Les test hos Tek.no" class="review-card" > <div class="review-card__badge review-card__badge--image"> <img src="/images/static/badges/tek/9.5.png" alt="Karakter 9.5 av 10 hos Tek.no" loading="lazy" /> </div> <div class="review-card__body"> <span class="review-card__site">Tek.no</span> <h3 class="review-card__title">Logitech Pro X2 Superstrike</h3> <p class="review-card__quote">«Logitech finner opp musen på ny med responsen fra disse knappene. »</p> </div> </a>`,
  card("https://www.tek.no/test/i/bad", "Tek.no", "11", "10", "Ugyldig", "Over skalaen."),
].join("")}</div></div>`;

test("Godpris tests (text and badge-image scores): only Norwegian publications, own scale kept, tracking removed, entities decoded", () => {
  const critics = readGodprisReviewCards(godprisHtml);
  assert.deepEqual(critics.map((critic) => [critic.site, critic.score, critic.maxScore]), [["techradar", 4.75, 5], ["Komputer for alle", 9.4, 10], ["Tek.no", 9.5, 10]]);
  assert.equal(critics[1]!.url, "https://komputer.no/pc-utstyr/mus/logitech-g-pro-x2-superstrike");
  assert.equal(critics[0]!.quote, "Den nye toppstandarden.");
  assert.equal(readGodprisReviewCards("<html>ingen tester</html>").length, 0);
});

test("Norwegian review URLs: .no hosts and Norwegian editions only", () => {
  assert.equal(isNorwegianReviewUrl("https://www.tek.no/test/x"), true);
  assert.equal(isNorwegianReviewUrl("https://global.techradar.com/no-no/gaming/x"), true);
  assert.equal(isNorwegianReviewUrl("https://www.techradar.com/reviews/x"), false);
  assert.equal(isNorwegianReviewUrl("http://www.tek.no/test/x"), false);
  assert.equal(isNorwegianReviewUrl("https://evil.example/?u=tek.no"), false);
});

const klarnaHtml = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Logitech G PRO X 2 Superstrike Wireless Gaming Mus","aggregateRating":{"@type":"AggregateRating","ratingValue":4.7,"bestRating":"5","worstRating":"0","ratingCount":"613"}}</script>`;

test("buyer rating from the named Product JSON-LD; missing or invalid ratings give none", () => {
  assert.deepEqual(readJsonLdUserRating(klarnaHtml, "klarna", "Kjøpere hos Klarna", "https://www.klarna.com/no/shopping/pl/cl110/3447588155/"),
    { source: "klarna", sourceName: "Kjøpere hos Klarna", score: 4.7, maxScore: 5, count: 613, url: "https://www.klarna.com/no/shopping/pl/cl110/3447588155/", productName: "Logitech G PRO X 2 Superstrike Wireless Gaming Mus" });
  assert.equal(readJsonLdUserRating(klarnaHtml.replace('"ratingCount":"613"', '"ratingCount":"0"'), "klarna", "K", "https://x.no/"), undefined);
  assert.equal(readJsonLdUserRating(klarnaHtml.replace('"ratingValue":4.7', '"ratingValue":7'), "klarna", "K", "https://x.no/"), undefined);
  // Prisjakt: a ProductGroup with its variants (prisjakt.no/product.php?p=16029953, 2026-11-08).
  assert.deepEqual(readJsonLdUserRating(`<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Prisjakt"}</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"ProductGroup","name":"Logitech G PRO X2 SUPERSTRIKE","aggregateRating":{"@type":"AggregateRating","ratingValue":5,"ratingCount":1,"worstRating":0,"bestRating":5}}</script>`, "prisjakt", "Brukere hos Prisjakt", "https://www.prisjakt.no/product.php?p=16029953")?.count, 1);
  assert.equal(readJsonLdUserRating(`<script type="application/ld+json">{"@type":"Product","aggregateRating":{"ratingValue":5,"ratingCount":9}}</script>`, "klarna", "K", "https://x.no/"), undefined);
});

test("summary: plain critic mean, buyer mean weighted by count, thresholds before a score", () => {
  const critics = readGodprisReviewCards(godprisHtml);
  const users = [
    { source: "klarna", sourceName: "Kjøpere hos Klarna", score: 4.7, maxScore: 5, count: 613, url: "https://www.klarna.com/no/shopping/pl/cl110/1/" },
    { source: "prisjakt", sourceName: "Prisjakt", score: 5, maxScore: 5, count: 1, url: "https://www.prisjakt.no/product.php?p=1" },
  ];
  const summary = summarizeProductReviews([{ critics }, { critics: critics.slice(0, 1), users }, undefined])!;
  assert.equal(summary.critics.length, 3); // the duplicate from a second source counts once
  assert.equal(summary.criticScore, Math.round((95 + 94 + 95) / 3));
  assert.equal(summary.userScore, 94); // (4.7*613 + 5*1) / 614 / 5 * 100 = 94.0
  assert.equal(summary.userCount, 614);
  const thin = summarizeProductReviews([{ critics: critics.slice(0, 2), users: [{ ...users[1]! }] }])!;
  assert.equal(thin.criticScore, undefined);
  assert.equal(thin.userScore, undefined);
  assert.equal(summarizeProductReviews([undefined, {}]), undefined);
  assert.equal(toHundredScale(9.4, 10), 94);
  assert.equal(toHundredScale(6, 5), undefined);
});

test("AI prompt lists every source with its link and asks for a Norwegian-only HTML summary", () => {
  const summary = summarizeProductReviews([{ critics: readGodprisReviewCards(godprisHtml), users: [{ source: "klarna", sourceName: "Kjøpere hos Klarna", score: 4.7, maxScore: 5, count: 613, url: "https://www.klarna.com/no/shopping/pl/cl110/1/" }] }])!;
  const prompt = buildReviewAiPrompt({ productName: "Logitech G PRO X2 Superstrike", price: "1 295 kr", shopName: "Elkjøp", summary, date: "8. nov. 2026" });
  assert.match(prompt, /HTML-side/);
  assert.match(prompt, /Bare norske kilder/);
  assert.match(prompt, /Tek\.no: 9,5 av 10/);
  assert.match(prompt, /https:\/\/komputer\.no\/pc-utstyr\/mus\/logitech-g-pro-x2-superstrike/);
  assert.match(prompt, /Kjøpere hos Klarna: 4,7 av 5 fra 613 vurderinger/);
  assert.match(prompt, /1 295 kr hos Elkjøp/);
  assert.doesNotMatch(prompt, /trustedreviews|tomshardware/);
});

test("runtime validation rejects unsafe or malformed review data", () => {
  assert.equal(isProductReviews({ critics: readGodprisReviewCards(godprisHtml) }), true);
  assert.equal(isProductReviews({ critics: [{ site: "X", score: 4, maxScore: 5, url: "javascript:alert(1)" }] }), false);
  assert.equal(isProductReviews({ users: [{ source: "k", sourceName: "K", score: 4, maxScore: 5, count: 1.5, url: "https://x.no/" }] }), false);
  assert.equal(isProductReviews("nope"), false);
});

// Klarna review-edge-rest (shape from /v2/products/reviews/NO/3334077607/user and /pro, 2026-11-08).
const klarnaReview = (over: Record<string, unknown>) => ({ date: "2024-11-30", lang: "en", country: "GB", source: "John Lewis", domain: "johnlewis.com", score: 3, scoreMax: 5, extract: "Overpriced.", author: "TheGamer", type: "user", link: "https://b2b.testfreaks.com/click/out/?url=x", ...over });

test("Klarna reviews: only Norwegian ones count, foreign totals are ignored", () => {
  const users = { reviews: [klarnaReview({}), klarnaReview({ country: "US", score: 5 }), klarnaReview({ country: "NO", lang: "no", score: 4 }), klarnaReview({ country: "NO", lang: "no", score: 5 })], pageRequest: { hasNext: true } };
  assert.deepEqual(readKlarnaUserReviews(users, "https://www.klarna.com/no/shopping/pl/cl52/1/"), { source: "klarna", sourceName: "Norske kjøpere hos Klarna", score: 4.5, maxScore: 5, count: 2, url: "https://www.klarna.com/no/shopping/pl/cl52/1/" });
  assert.equal(readKlarnaUserReviews({ reviews: [klarnaReview({}), klarnaReview({ country: "US" })] }, "https://www.klarna.com/no/"), undefined);
  const pros = { reviews: [klarnaReview({ type: "pro", source: "Wired", score: 4 }), klarnaReview({ type: "pro", source: "Tek.no", domain: "tek.no", country: "NO", lang: "no", score: 5, scoreMax: 6, title: "PS5 Pro" }), klarnaReview({ type: "pro", country: "NO", source: "Bad", link: "http://x.no/" })] };
  assert.deepEqual(readKlarnaProReviews(pros).map((critic) => [critic.site, critic.score, critic.maxScore]), [["Tek.no", 5, 6]]);
  assert.deepEqual(readKlarnaProReviews("x"), []);
});

test("the same test from Godpris and Klarna counts once", () => {
  const godpris = readGodprisReviewCards(godprisHtml);
  const klarna = [{ site: "Tek.no", score: 9.5, maxScore: 10, url: "https://b2b.testfreaks.com/click/out/?url=tek" }];
  assert.equal(summarizeProductReviews([{ critics: godpris }, { critics: klarna }])!.critics.length, 3);
});

test("Prisjakt shop ratings: shop name and its own users' score from each offer row", async () => {
  const { readPrisjaktShopRatings } = await import("../src/shared/product-reviews.js");
  // Offer rows from prisjakt.no/product.php?p=13395263 (2026-11-08), shortened.
  const row = (name: string, score: number, count: number) => `{"index":0,"shopId":1,"name":"PlayStation 5 Pro","condition":"New","shopUserReviews":{"score":${score},"numberOfReviewsInScore":${count}},"isPaidMembership":true,"stockStatus":"InStock","shipping":{"nodes":[]},"shop":{"name":"${name}","membershipProgram":{"name":"Coop Medlem"}}}`;
  const flight = `f:["$","$L8f","",{"offerRows":[${row("Obs", 2.68, 13)},${row("Komplett", 4.5, 33793)},${row("Bad", 9, 3)}]}]`;
  const html = `<script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`;
  assert.deepEqual([...readPrisjaktShopRatings(html)], [["Obs", { score: 2.68, count: 13 }], ["Komplett", { score: 4.5, count: 33793 }]]);
  assert.equal(readPrisjaktShopRatings("<html></html>").size, 0);
  assert.equal(isProductReviews({ store: { source: "prisjakt", shopName: "Komplett", score: 4.5, maxScore: 5, count: 33793, url: "https://www.prisjakt.no/product.php?p=1" } }), true);
  assert.equal(isProductReviews({ store: { source: "prisjakt", shopName: "Komplett", score: 4.5, maxScore: 5, count: 0, url: "https://www.prisjakt.no/" } }), false);
});

test("Godpris: tests from duplicate listings of the same product, never from another variant", async () => {
  const { findGodprisPriceMatch } = await import("../src/shared/godpris-price-match.js");
  const ld = (name: string, offers: unknown[]) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org/", "@type": "Product", name, brand: { "@type": "Brand", name: "Sony" }, offers: { "@type": "AggregateOffer", offers } })}</script>`;
  const inStock = [{ "@type": "Offer", url: "https://godpris.no/api/services/click?i=1", price: 17990, priceCurrency: "NOK", availability: "InStock", seller: { "@type": "Organization", name: "Komplett" } }];
  const pages: Record<string, string> = {
    "19156434": ld("PlayStation 5 Pro 2TB (PS5)", inStock),
    "5186542": ld("PlayStation 5 Pro 2TB", []) + card("https://www.tek.no/test/i/Jbp1j4/vi-har-testet-playstation-5-pro?utm_source=godpris.no", "Tek.no", "6", "10", "PS5 Pro", "Dyr."),
    "15019822": ld("PS5-konsoll PRO DIGITAL 2TB", []) + card("https://www.lydogbilde.no/test/feil", "Lyd &amp; bilde", "2", "6", "Feil variant", "Skal ikke telle."),
  };
  const requested: string[] = [];
  const requestJson = async () => ({ results: [
    { id: "19156434", title: "PlayStation 5 Pro 2TB (PS5)", brand: "Sony" },
    { id: "15019822", title: "Sony PS5-konsoll PRO DIGITAL 2TB", brand: "Sony" },
    { id: "5186542", title: "PlayStation 5 Pro 2TB", brand: "Sony" },
  ] });
  const requestText = async (url: string) => { requested.push(url); return pages[url.split("/").at(-1)!]; };
  const offer = await findGodprisPriceMatch({ type: "get-price-match-for-product", url: "https://www.komplett.no/product/1346176", searchTerm: "PlayStation 5 Pro 2TB", price: 17990, productPageClue: true } as never, requestJson as never, requestText);
  assert.equal(offer?.productUrl, "https://godpris.no/produkt/19156434");
  assert.deepEqual(offer?.reviews?.critics?.map((critic) => critic.site), ["Tek.no"]);
  assert.ok(requested.length <= 4, `bounded page reads: ${requested.length}`);
});

test("Prisradar editorReviews: Norwegian tests with the source's own scale", async () => {
  const { readPrisradarEditorReviews } = await import("../src/shared/product-reviews.js");
  // From prisradar.no/produkter/playstation-5-slim-digital-edition-2023 (2026-11-08), shortened.
  const source = (title: string, url: string, ratingMax: number) => ({ __typename: "EditorReviewSource", title, url, ratingMin: 0, ratingMax });
  const product = { editorReviews: [
    { __typename: "EditorReview", id: 4760, title: "Sony PlayStation 5 - Test - Tek.no", content: "Et spennende og stort sett vellykket steg", rating: 9, link: "https://www.tek.no/test/i/aPPkLE/playstation-5-innfrir-paa-det-aller-meste", source: source("Tek.no", "https://tek.no", 10) },
    { __typename: "EditorReview", id: 4761, title: "TEST: Sony PlayStation 5", content: "Lynrask ytelse", rating: 5, link: "https://www.lydogbilde.no/test/gaming/sony-playstation-5/", source: source("Lyd & bilde", "https://lydogbilde.no", 6) },
    { __typename: "EditorReview", id: 1, title: "Review", rating: 4, link: "https://www.ign.com/x", source: source("IGN", "https://ign.com", 5) },
    { __typename: "EditorReview", id: 2, title: "Broken", rating: 12, link: "https://www.tek.no/y", source: source("Tek.no", "https://tek.no", 10) },
  ] };
  assert.deepEqual(readPrisradarEditorReviews(product).map((critic) => [critic.site, critic.score, critic.maxScore, critic.quote]), [["Tek.no", 9, 10, "Et spennende og stort sett vellykket steg"], ["Lyd & bilde", 5, 6, "Lynrask ytelse"]]);
  assert.deepEqual(readPrisradarEditorReviews({ editorReviews: "$undefined" }), []);
});

test("Godpris store links: the shop's own page from the click link's u parameter, never affiliate networks", async () => {
  const { readGodprisStoreLinks } = await import("../src/shared/product-reviews.js");
  const click = (u: string) => `https://godpris.no/api/services/click?u=${encodeURIComponent(u)}&si=1&i=15346856`;
  const offer = (name: string, u: string) => ({ "@type": "Offer", url: click(u), price: 1295, priceCurrency: "NOK", availability: "InStock", seller: { "@type": "Organization", name } });
  // Offers from godpris.no/produkt/15346856 (2026-11-08), shortened.
  const html = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org/", "@type": "Product", name: "G PRO X2 SUPERSTRIKE", offers: { "@type": "AggregateOffer", offers: [
    offer("POWER", "https://www.power.no/gaming/gamingmus/logitech-g-pro-x2-superstrike/p-4229653/?utm_source=godpris&utm_medium=cpc"),
    offer("Elkjøp", "https://www.elkjop.no/product/pc-mus/logitech-g-pro-x2-superstrike-tradlos-gamingmus/101908"),
    offer("Netonnet", "https://no-go.kelkoogroup.net/offersearchGo?affiliationId=97007182&comId=6995723"),
    offer("CDON", "https://pdt.tradedoubler.com/click?a(3365759)p(116)url(https%3A%2F%2Fcdon.no%2Fx)"),
    // godpris.no/produkt/1589824: an affiliate host whose name contains the shop's.
    offer("Boozt", "https://booztfashionab.pxf.io/c/6034808/3881586/51152?prodsku=LPLE3548600_223277360&u=https%3A%2F%2Fwww.boozt.com%2Fno%2Fno%2Floreal-professionnel%2Fmetal-dx-shampoo_29356961%2F223277360"),
  ] } })}</script>`;
  assert.deepEqual(readGodprisStoreLinks(html), [
    { shopName: "POWER", url: "https://www.power.no/gaming/gamingmus/logitech-g-pro-x2-superstrike/p-4229653/" },
    { shopName: "Elkjøp", url: "https://www.elkjop.no/product/pc-mus/logitech-g-pro-x2-superstrike-tradlos-gamingmus/101908" },
    { shopName: "Boozt", url: "https://www.boozt.com/no/no/loreal-professionnel/metal-dx-shampoo_29356961/223277360" },
  ]);
});

test("Power: buyer rating from its product search, only for the page's own part number", async () => {
  const { findPowerUserRating } = await import("../src/shared/power-reviews.js");
  // power.no/api/v2/productlists?q=MXP63DN/A (2026-11-08), shortened.
  const product = (title: string, mpn: string, rating: unknown) => ({ title, url: "/tv-og-lyd/hodetelefoner/apple-airpods-4/p-3614399/", productId: 3614399, productManufactorIdentity: mpn, productReview: rating });
  const urls: string[] = [];
  const respond = (products: unknown[]) => async (url: string) => { urls.push(url); return { products }; };
  const message = { type: "get-price-match-for-product", url: "https://www.komplett.no/product/1313146", searchTerm: "Apple AirPods 4 trådløse ørepropper, In-Ear (hvit)", codes: ["MXP63DN/A"] } as never;
  assert.deepEqual(await findPowerUserRating(message, respond([product("Apple AirPods 4", "MXP63DN/A", { overallAverageRating: 4.2727, overallTotalReviewCount: 3190 })]) as never),
    { source: "store:www.power.no", sourceName: "Power", score: 4.27, maxScore: 5, count: 3190, url: "https://www.power.no/tv-og-lyd/hodetelefoner/apple-airpods-4/p-3614399/", productName: "Apple AirPods 4" });
  assert.match(urls[0]!, /productlists\?q=MXP63DN%2FA/);
  assert.equal(await findPowerUserRating(message, respond([product("Apple AirPods 4 med aktiv støyreduksjon", "MXP93DN/A", { overallAverageRating: 4.5, overallTotalReviewCount: 900 })]) as never), undefined);
  assert.equal(await findPowerUserRating(message, respond([product("Apple AirPods 4", "MXP63DN/A", { overallAverageRating: 0, overallTotalReviewCount: 0 })]) as never), undefined);
  assert.equal(await findPowerUserRating({ ...(message as object), codes: [] } as never, respond([]) as never), undefined);
});

test("Tek.no review platform: the most specific product name in the page title wins", async () => {
  const { readTekReview, findTekReview } = await import("../src/shared/tek-reviews.js");
  // reviewedProducts(query: "Roborock Saros") from www.tek.no/api/review-platform/graphql (2026-11-08), shortened.
  const item = (id: string, name: string, value: number, conclusion: string) => ({ id, name, slug: name.toLowerCase().replace(/ /g, "-"),
    latestReview: { rating: { value, conclusion, pros: ["Roborock-appen er uslåelig"], cons: ["Dyr"] }, articleId: "y3GLPJ", sectionName: "samletest", articleSlug: "beste-robotstoevsuger", title: "Samletest av robotstøvsugere toppmodeller" } });
  const response = { data: { reviewedProducts: { items: [item("1", "Roborock Saros 10", 8, "God."), item("40563", "Roborock Saros 20", 7, "Gjør mye av det storebror kan."), item("40596", "Roborock Saros 20 Sonic", 9, "En svært gjennomarbeidet og knallgod robotstøvsuger.")] } } };
  const sonic = readTekReview(response, "Roborock Saros 20 Sonic robotstøvsuger (sort)");
  assert.deepEqual([sonic?.score, sonic?.maxScore, sonic?.url, sonic?.pros, sonic?.cons], [9, 10, "https://www.tek.no/samletest/i/y3GLPJ/beste-robotstoevsuger", ["Roborock-appen er uslåelig"], ["Dyr"]]);
  assert.match(sonic!.title!, /Roborock Saros 20 Sonic/);
  assert.equal(readTekReview(response, "Roborock Saros 20 robotstøvsuger")?.score, 7);
  assert.equal(readTekReview(response, "Roborock Qrevo Edge 2 Pro"), undefined);
  assert.equal(readTekReview({ errors: [{ message: "x" }] }, "Roborock Saros 20"), undefined);
  const queries: string[] = [];
  const requestJson = async (_url: string, init?: { body?: string }) => { const query = JSON.parse(init!.body!).variables.query as string; queries.push(query); return query === "Roborock Saros" ? response : { data: { reviewedProducts: { items: [] } } }; };
  assert.equal((await findTekReview({ type: "get-price-match-for-product", url: "https://www.komplett.no/x", searchTerm: "Roborock Saros 20 Sonic robotstøvsuger (sort)" } as never, requestJson as never))?.score, 9);
  assert.deepEqual(queries, ["Roborock Saros 20", "Roborock Saros"]);
});

test("GTIN search shops: the landing page's own GTIN must match before its rating counts", async () => {
  const { readGtinPageRating, findGtinStoreRatings, GTIN_SEARCH_STORES } = await import("../src/shared/store-reviews.js");
  const lyko = GTIN_SEARCH_STORES.find((store) => store.host === "lyko.com")!;
  // Product JSON-LD from lyko.com (2026-11-08), shortened.
  const page = (gtin: string) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "SAWE Skin Science Derm-Alert Barrier Repair Cream 75 ml", gtin13: gtin, aggregateRating: { "@type": "AggregateRating", ratingCount: 70, ratingValue: 3.6, worstRating: 1, bestRating: 5 } })}</script>`;
  assert.deepEqual(readGtinPageRating(page("7046110321911"), "7046110321911", lyko, "https://lyko.com/no/sok?q=7046110321911"),
    { source: "store:lyko.com", sourceName: "Lyko", score: 3.6, maxScore: 5, count: 70, url: "https://lyko.com/no/sok?q=7046110321911", productName: "SAWE Skin Science Derm-Alert Barrier Repair Cream 75 ml" });
  assert.equal(readGtinPageRating(page("7046110321928"), "7046110321911", lyko, "https://lyko.com/"), undefined);
  assert.equal(readGtinPageRating("<html>Søkeresultater</html>", "7046110321911", lyko, "https://lyko.com/"), undefined);
  const requested: string[] = [];
  const requestText = async (url: string) => { requested.push(url); return url.startsWith("https://lyko.com/") ? page("7046110321911") : undefined; };
  const title = "SAWE Skin Science Derm-Alert Barrier Repair Cream 75 ml";
  assert.equal((await findGtinStoreRatings({ type: "get-price-match-for-product", url: "https://www.blivakker.no/p/1", searchTerm: title, codes: ["SKU-1", "7046110321911"] } as never, requestText)).length, 1);
  assert.deepEqual(requested.filter((url) => url.startsWith("https://lyko.com/")), ["https://lyko.com/no/sok?q=7046110321911"]);
  // The GTIN alone is not enough when the landing page names another product.
  assert.equal((await findGtinStoreRatings({ type: "get-price-match-for-product", url: "https://www.blivakker.no/p/1", searchTerm: "Roborock Saros 20 Sonic", codes: ["7046110321911"] } as never, requestText)).length, 0);
  assert.deepEqual(await findGtinStoreRatings({ type: "get-price-match-for-product", url: "https://lyko.com/no/x", searchTerm: "x", codes: ["7046110321911"] } as never, requestText), []);
  assert.deepEqual(await findGtinStoreRatings({ type: "get-price-match-for-product", url: "https://x.no/", searchTerm: "x", codes: [] } as never, requestText), []);
});

test("Prisjakt shop rating: found by the page's domain, only when the shop's home page has that host", async () => {
  const { findPrisjaktShopRating, readPrisjaktShops } = await import("../src/shared/prisjakt-shop-rating.js");
  // native-backend.cloud.pji.nu GraphQL search + shops(ids) (2026-11-08), shortened.
  const shops = { data: { shops: [
    { id: "99", name: "Skousen Outlet", homePage: { url: "https://skousen-outlet.no" }, userReviews: { count: 10, rating: 2 } },
    { id: "22884", name: "Skousen", homePage: { url: "https://www.skousen.no" }, userReviews: { count: 18360, rating: 9.12 } },
  ] } };
  assert.deepEqual(readPrisjaktShops(shops, "skousen.no"), { source: "prisjakt", shopName: "Skousen", score: 9.12, maxScore: 10, count: 18360, url: "https://www.prisjakt.no/shop.php?f=22884" });
  assert.equal(readPrisjaktShops(shops, "elkjop.no"), undefined);
  const bodies: string[] = [];
  const requestJson = async (_url: string, init?: { body?: string }) => { bodies.push(init!.body!); return bodies.length === 1 ? { data: { search: { shops: { nodes: [{ id: "99" }, { id: "22884" }] } } } } : shops; };
  assert.equal((await findPrisjaktShopRating("https://www.skousen.no/produkt/1", requestJson as never))?.count, 18360);
  assert.equal(JSON.parse(bodies[0]!).variables.query, "skousen");
  assert.deepEqual(JSON.parse(bodies[1]!).variables.ids, [99, 22884]);
});

test("Boozt: title search links, GTIN on one JSON-LD entry and the rating on another", async () => {
  const { findGtinStoreRatings } = await import("../src/shared/store-reviews.js");
  // boozt.com/no/no/loreal-professionnel/metal-dx-oil_31794190/225734112 (2026-11-08), shortened.
  const link = "https://www.boozt.com/no/no/loreal-professionnel/metal-dx-oil_31794190/225734112";
  const productPage = `<script type="application/ld+json">${JSON.stringify([
    { "@type": "Product", name: "L'Oréal Professionnel Metal DX Anti-Deposit Protector Concentrated Oil 50 ml", aggregateRating: { "@type": "AggregateRating", ratingValue: 5, ratingCount: 1, worstRating: 1, bestRating: 5 } },
    { "@type": "Product", name: "L'Oréal Professionnel Metal DX Anti-Deposit Protector Concentrated Oil 50 ml (50 ml)", gtin13: "3474637090616", sku: "LPLE38492_225734112" },
  ])}</script>`;
  const requested: string[] = [];
  const requestText = async (url: string) => {
    requested.push(url);
    if (url.startsWith("https://lyko.com/")) return "<html>ingen treff</html>";
    if (url.includes("search/result?q=3474637090616")) return "<html>0 treff</html>";
    if (url.includes("search/result?q=")) return `<a href="${link}">Metal DX oil</a><a href="https://www.boozt.com/no/no/loreal-professionnel/metal-dx-oil_31794190/225734112">dup</a>`;
    return url === link ? productPage : undefined;
  };
  const ratings = await findGtinStoreRatings({ type: "get-price-match-for-product", url: "https://www.blivakker.no/p/1", searchTerm: "L'Oréal Professionnel Metal DX Anti-Deposit Protector Concentrated Oil 50 ml", codes: ["3474637090616"] } as never, requestText);
  assert.deepEqual(ratings, [{ source: "store:www.boozt.com", sourceName: "Boozt", score: 5, maxScore: 5, count: 1, url: link, productName: "L'Oréal Professionnel Metal DX Anti-Deposit Protector Concentrated Oil 50 ml (50 ml)" }]);
  assert.equal(requested.filter((url) => url === link).length, 1);
});
