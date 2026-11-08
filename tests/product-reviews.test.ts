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
    { source: "klarna", sourceName: "Kjøpere hos Klarna", score: 4.7, maxScore: 5, count: 613, url: "https://www.klarna.com/no/shopping/pl/cl110/3447588155/" });
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
