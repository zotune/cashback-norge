// Norwegian product reviews gathered alongside the price match:
// - Professional tests: Godpris' product page lists them as `review-card` links (site, score,
//   scale, title, short quote, link to the test). Only one of them is in its JSON-LD, so the
//   HTML is read; tests from non-Norwegian publications are left out.
// - Buyer ratings: Prisjakt's own ProductGroup JSON-LD `aggregateRating` (Norwegian users),
//   and the Norwegian reviews in Klarna's review service.
// Scores are kept with their own scale and only converted to 0–100 for the summary.
import { decodeHtmlEntities, isRecord, parseUrl } from "./cashback.js";
import { readLdJsonScripts, readNextFlightPayloads, selectProductLdJson } from "./product-data.js";

export type CriticReview = { site: string; score: number; maxScore: number; url: string; title?: string; quote?: string };
export type UserRating = { source: string; sourceName: string; score: number; maxScore: number; count: number; url: string };
// A rating of the shop itself (service, delivery), not of the product.
export type StoreRating = { source: string; shopName: string; score: number; maxScore: number; count: number; url: string };
export type ProductReviews = { critics?: CriticReview[]; users?: UserRating[]; store?: StoreRating };
export type ProductReviewSummary = {
  critics: CriticReview[];
  users: UserRating[];
  criticScore?: number;
  userScore?: number;
  userCount: number;
};

export const MIN_CRITIC_REVIEWS = 3;
export const MIN_USER_RATINGS = 20;
const MAX_CRITICS = 12;

const finite = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim().replace(",", ".")) : NaN;
  return Number.isFinite(number) ? number : undefined;
};
const text = (html: string | undefined): string | undefined => {
  if (html === undefined) return undefined;
  const value = decodeHtmlEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return value.length > 0 ? value : undefined;
};

/** 0–100, or undefined for a score outside its own scale. */
export function toHundredScale(score: number, maxScore: number): number | undefined {
  if (!(maxScore > 0) || !(score >= 0) || score > maxScore) return undefined;
  return (score / maxScore) * 100;
}

/** A Norwegian publication: a .no address or a Norwegian edition (…/no-no/, …/nb-no/). */
export function isNorwegianReviewUrl(rawUrl: string): boolean {
  const url = parseUrl(rawUrl);
  if (url === undefined || url.protocol !== "https:") return false;
  return /\.no$/i.test(url.hostname) || /^\/(?:no|nb|nn)(?:-no)?\//i.test(url.pathname);
}

const withoutTracking = (rawUrl: string): string => {
  const url = new URL(rawUrl);
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  // Godpris appends its tracking after an anchor too ("…#anchor-2?utm_source=godpris.no").
  url.hash = url.hash.replace(/[?&]utm_[^#]*$/i, "");
  return url.href;
};

export function readGodprisReviewCards(html: string): CriticReview[] {
  const reviews: CriticReview[] = [];
  for (const match of html.matchAll(/<a\b([^>]*\bclass="review-card"[^>]*)>([\s\S]*?)<\/a>/g)) {
    const attributes = match[1]!;
    const body = match[2]!;
    const href = decodeHtmlEntities(attributes.match(/\bhref="([^"]+)"/)?.[1] ?? "");
    const site = text(body.match(/class="review-card__site"[^>]*>([\s\S]*?)<\/span>/)?.[1]);
    // Most cards print the score as text; some publications (Tek.no) use a badge image whose
    // alt text carries it ("Karakter 9.5 av 10 hos Tek.no").
    const badge = body.match(/\balt="Karakter ([\d.,]+) av ([\d.,]+)/i);
    const score = finite(text(body.match(/class="review-card__score"[^>]*>([\s\S]*?)<\/span>/)?.[1]) ?? badge?.[1]);
    const maxScore = finite(text(body.match(/class="review-card__max"[^>]*>([\s\S]*?)<\/span>/)?.[1])?.replace(/^av\s+/i, "") ?? badge?.[2]);
    if (site === undefined || score === undefined || maxScore === undefined || toHundredScale(score, maxScore) === undefined) continue;
    if (!isNorwegianReviewUrl(href)) continue;
    const title = text(body.match(/class="review-card__title"[^>]*>([\s\S]*?)<\/h3>/)?.[1]);
    const quote = text(body.match(/class="review-card__quote"[^>]*>([\s\S]*?)<\/p>/)?.[1])?.replace(/^«|»$/g, "").trim();
    reviews.push({ site, score, maxScore, url: withoutTracking(href), ...(title ? { title } : {}), ...(quote ? { quote } : {}) });
  }
  return reviews;
}

/** Buyer rating from the page's named Product JSON-LD. */
export function readJsonLdUserRating(html: string, source: string, sourceName: string, pageUrl: string): UserRating | undefined {
  // Prisjakt publishes a ProductGroup (the product with its colour variants) instead of a Product.
  const scripts = readLdJsonScripts(html);
  const product = selectProductLdJson(scripts) ?? scripts.flatMap((item) => Array.isArray(item) ? item : [item]).find((item): item is Record<string, unknown> =>
    isRecord(item) && item["@type"] === "ProductGroup" && typeof item.name === "string" && item.name.trim().length > 0);
  const rating = product !== undefined && isRecord(product.aggregateRating) ? product.aggregateRating : undefined;
  if (rating === undefined) return undefined;
  const score = finite(rating.ratingValue);
  const maxScore = finite(rating.bestRating) ?? 5;
  const count = finite(rating.ratingCount) ?? finite(rating.reviewCount);
  if (score === undefined || count === undefined || !Number.isInteger(count) || count <= 0 || toHundredScale(score, maxScore) === undefined) return undefined;
  return { source, sourceName, score, maxScore, count, url: pageUrl };
}

// Klarna's review service (review-edge-rest, sourced from TestFreaks) mixes reviews from many
// countries; for the mouse and PS5 Pro on 2026-11-08 every one was from the US, GB, CA or ZA.
// Only reviews marked Norwegian (country NO or a Norwegian language) are kept.
export const klarnaReviewsUrl = (productId: string, kind: "user" | "pro") =>
  `https://www.klarna.com/no/api/review-edge-rest/public/v2/products/reviews/NO/${encodeURIComponent(productId)}/${kind}?limit=50`;
const isNorwegianReview = (review: Record<string, unknown>) =>
  review.country === "NO" || review.lang === "no" || review.lang === "nb" || review.lang === "nn";

export function readKlarnaProReviews(value: unknown): CriticReview[] {
  const reviews = isRecord(value) && Array.isArray(value.reviews) ? value.reviews.filter(isRecord) : [];
  return reviews.filter(isNorwegianReview).flatMap((review): CriticReview[] => {
    const score = finite(review.score);
    const maxScore = finite(review.scoreMax);
    const site = typeof review.source === "string" ? review.source.trim() : "";
    const link = typeof review.link === "string" && parseUrl(review.link)?.protocol === "https:" ? review.link : undefined;
    if (!site || score === undefined || maxScore === undefined || toHundredScale(score, maxScore) === undefined || link === undefined) return [];
    const quote = typeof review.extract === "string" ? review.extract.trim() : "";
    const title = typeof review.title === "string" ? review.title.trim() : "";
    return [{ site, score, maxScore, url: link, ...(title ? { title } : {}), ...(quote ? { quote } : {}) }];
  });
}

/** Norwegian buyer reviews in Klarna's review service, as one rating; none gives undefined. */
export function readKlarnaUserReviews(value: unknown, pageUrl: string): UserRating | undefined {
  const reviews = isRecord(value) && Array.isArray(value.reviews) ? value.reviews.filter(isRecord) : [];
  const scores = reviews.filter(isNorwegianReview).flatMap((review) => {
    const score = finite(review.score);
    const maxScore = finite(review.scoreMax);
    const hundred = score === undefined || maxScore === undefined ? undefined : toHundredScale(score, maxScore);
    return hundred === undefined ? [] : [hundred];
  });
  if (scores.length === 0) return undefined;
  return { source: "klarna", sourceName: "Norske kjøpere hos Klarna", score: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length / 20).toFixed(2)), maxScore: 5, count: scores.length, url: pageUrl };
}

/**
 * Shop ratings from Prisjakt's product page: each offer row in the Next data carries
 * `shopUserReviews` (Prisjakt users' rating of the shop) and `shop.name`.
 */
export function readPrisjaktShopRatings(html: string): Map<string, { score: number; count: number }> {
  const ratings = new Map<string, { score: number; count: number }>();
  const text = readNextFlightPayloads(html).join("");
  for (const match of text.matchAll(/"shopUserReviews":\{"score":([\d.]+),"numberOfReviewsInScore":(\d+)\}[\s\S]{0,2500}?"shop":\{"name":"([^"]{1,80})"/g)) {
    const score = Number(match[1]);
    const count = Number(match[2]);
    const name = match[3]!;
    if (!(score >= 0 && score <= 5) || !Number.isInteger(count) || count <= 0 || ratings.has(name)) continue;
    ratings.set(name, { score, count });
  }
  return ratings;
}

/** Combines every source's reviews: one entry per test, buyer ratings weighted by count. */
export function summarizeProductReviews(all: Array<ProductReviews | undefined>): ProductReviewSummary | undefined {
  const critics = new Map<string, CriticReview>();
  const users = new Map<string, UserRating>();
  for (const reviews of all) {
    for (const critic of reviews?.critics ?? []) {
      // The same test can arrive from two sources with different links (direct or a redirect).
      const key = `${critic.site.toLowerCase().replace(/[^a-z0-9æøå]/g, "")}|${Math.round(toHundredScale(critic.score, critic.maxScore) ?? -1)}`;
      if (!critics.has(key)) critics.set(key, critic);
    }
    for (const user of reviews?.users ?? []) if (!users.has(user.source)) users.set(user.source, user);
  }
  if (critics.size === 0 && users.size === 0) return undefined;
  const criticList = [...critics.values()]
    .sort((a, b) => toHundredScale(b.score, b.maxScore)! - toHundredScale(a.score, a.maxScore)!)
    .slice(0, MAX_CRITICS);
  const userList = [...users.values()].sort((a, b) => b.count - a.count);
  const userCount = userList.reduce((sum, user) => sum + user.count, 0);
  const criticScore = criticList.length >= MIN_CRITIC_REVIEWS
    ? Math.round(criticList.reduce((sum, critic) => sum + toHundredScale(critic.score, critic.maxScore)!, 0) / criticList.length)
    : undefined;
  const userScore = userCount >= MIN_USER_RATINGS
    ? Math.round(userList.reduce((sum, user) => sum + toHundredScale(user.score, user.maxScore)! * user.count, 0) / userCount)
    : undefined;
  return { critics: criticList, users: userList, userCount, ...(criticScore !== undefined ? { criticScore } : {}), ...(userScore !== undefined ? { userScore } : {}) };
}

// Metacritic's bands: 75+ favourable (green), 50–74 mixed (yellow), under 50 unfavourable (red).
export function getReviewScoreLevel(score: number): "high" | "good" | "mixed" | "low" {
  return score >= 85 ? "high" : score >= 75 ? "good" : score >= 50 ? "mixed" : "low";
}

const formatScore = (score: number) => String(Number(score.toFixed(2))).replace(".", ",");

/**
 * Text for the reader's own AI assistant: the sources, and instructions for a summary page.
 * Nothing is sent anywhere by us; the reader pastes it into Claude, ChatGPT or similar.
 */
export function buildReviewAiPrompt(input: { productName: string; price?: string; shopName?: string; pageUrl?: string; summary: ProductReviewSummary; store?: StoreRating; date: string }): string {
  const { summary } = input;
  const critics = summary.critics.map((critic) =>
    `- ${critic.site}: ${formatScore(critic.score)} av ${formatScore(critic.maxScore)}.${critic.title ? ` «${critic.title}».` : ""}${critic.quote ? ` Sitat: «${critic.quote}»` : ""} ${critic.url}`);
  const users = summary.users.map((user) => `- ${user.sourceName}: ${formatScore(user.score)} av ${formatScore(user.maxScore)} fra ${user.count} ${user.count === 1 ? "vurdering" : "vurderinger"}. ${user.url}`);
  return [
    "Du er en nøytral norsk produktrådgiver. Lag en oversiktlig oppsummering av hva norske testere og kjøpere mener om produktet under.",
    "",
    "Slik vil jeg ha svaret:",
    "- Lag det som en pen, selvstendig HTML-side (i Claude som en Artifact, i ChatGPT som Canvas). Bruk lyst og mørkt tema, tydelige overskrifter, poengsummene som merker øverst, og kort tekst som fungerer på mobil.",
    "- Bruk bare kildene i listen. Åpne lenkene og les testene og kjøperanmeldelsene hvis du kan. Bare norske kilder.",
    "- Oppgi kilden ved hver påstand, med lenke. Si tydelig fra når noe bare nevnes av én kilde eller når du ikke fikk lest en kilde.",
    "- Ikke finn på egenskaper, priser eller problemer som ikke står i kildene.",
    "",
    "Seksjoner på siden:",
    "1. Kort konklusjon (2–3 setninger)",
    "2. Det testere og kjøpere liker best",
    "3. Vanlige problemer og klager (holdbarhet, programvare, batteri, passform, støy, kundeservice osv.)",
    "4. Hvem produktet passer for, og hvem som bør velge noe annet",
    "5. Der testere og kjøpere er uenige",
    "6. Hva jeg bør sjekke før jeg kjøper",
    "7. Kildeliste med lenker",
    "",
    "PRODUKT",
    input.productName,
    ...(input.price ? [`Pris: ${input.price}${input.shopName ? ` hos ${input.shopName}` : ""} (${input.date})`] : []),
    ...(input.pageUrl ? [`Siden jeg ser på: ${input.pageUrl}`] : []),
    "",
    `PROFESJONELLE TESTER${summary.criticScore !== undefined ? ` – snitt ${summary.criticScore}/100` : ""} (${summary.critics.length})`,
    ...(critics.length ? critics : ["- Ingen norske tester funnet."]),
    "",
    `KJØPERE${summary.userScore !== undefined ? ` – snitt ${summary.userScore}/100` : ""} (${summary.userCount} vurderinger)`,
    ...(users.length ? users : ["- Ingen kjøpervurderinger funnet."]),
    ...(input.store ? ["", "BUTIKKEN JEG SER PÅ (vurdering av butikken, ikke produktet)", `- ${input.store.shopName}: ${formatScore(input.store.score)} av ${formatScore(input.store.maxScore)} fra ${input.store.count} vurderinger hos Prisjakt. ${input.store.url}`] : []),
    "",
    "Hentet av Cashback Norge. Poengsummene er omregnet til 0–100 (karakter / maks × 100); kjøpersnittet er vektet etter antall vurderinger.",
  ].join("\n");
}

const isHttpsUrl = (value: unknown): value is string => typeof value === "string" && value.length <= 2048 && parseUrl(value)?.protocol === "https:";
const isScore = (score: unknown, maxScore: unknown) => typeof score === "number" && typeof maxScore === "number" && toHundredScale(score, maxScore) !== undefined;

/** Runtime check for reviews arriving in extension messages. */
export function isProductReviews(value: unknown): value is ProductReviews {
  if (!isRecord(value)) return false;
  const critics = value.critics;
  const users = value.users;
  const store = value.store;
  return (store === undefined || (isRecord(store) && typeof store.source === "string" && typeof store.shopName === "string" &&
    isScore(store.score, store.maxScore) && typeof store.count === "number" && Number.isInteger(store.count) && store.count > 0 && isHttpsUrl(store.url))) && (critics === undefined || (Array.isArray(critics) && critics.length <= 50 && critics.every((critic) =>
    isRecord(critic) && typeof critic.site === "string" && isScore(critic.score, critic.maxScore) && isHttpsUrl(critic.url) &&
    (critic.title === undefined || typeof critic.title === "string") && (critic.quote === undefined || typeof critic.quote === "string")))) &&
    (users === undefined || (Array.isArray(users) && users.length <= 10 && users.every((user) =>
      isRecord(user) && typeof user.source === "string" && typeof user.sourceName === "string" && isScore(user.score, user.maxScore) &&
      typeof user.count === "number" && Number.isInteger(user.count) && user.count > 0 && isHttpsUrl(user.url))));
}
