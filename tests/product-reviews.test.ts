import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReviewAiPrompt, isNorwegianReviewUrl, isProductReviews, readGodprisReviewCards, readJsonLdUserRating, summarizeProductReviews, toHundredScale } from "../src/shared/product-reviews.js";

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
