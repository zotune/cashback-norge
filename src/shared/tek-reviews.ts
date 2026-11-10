// Tek.no's own test of the product on the page. Tek.no's review platform has a public GraphQL
// endpoint (the one its product pages use) with `reviewedProducts(query:)`: product name, latest
// review rating (1–10), conclusion, pros and cons and the article. Searched by the page's title;
// a candidate counts only when every word of its name is in the page title and the variant
// checks pass, and the most specific name wins (Saros 20 Sonic over Saros 20 on a Sonic page).
import type { GetPriceMatchForProductMessage } from "./extension-messages.js";
import type { JsonRequest } from "./prisjakt-price-match.js";
import { buildProductMatchAnchor, hasModelTierConflict, hasNumericModelConflict, hasProductVariantConflict } from "./product-match.js";
import { isRecord } from "./cashback.js";
import { isAccessoryMismatch, toHundredScale, type CriticReview } from "./product-reviews.js";

export const TEK_REVIEW_GRAPHQL_URL = "https://www.tek.no/api/review-platform/graphql";
const QUERY = "query ReviewedProducts($query: String, $limit: Int) { reviewedProducts(query: $query, limit: $limit) { items { id name slug latestReview { rating { value conclusion pros cons } articleId sectionName articleSlug title } } } }";

const words = (value: string) => value.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}+]+/u).filter((word) => word.length > 0);

export function readTekReview(value: unknown, pageTitle: string, anchor = buildProductMatchAnchor({ searchTerm: pageTitle } as GetPriceMatchForProductMessage)): CriticReview | undefined {
  const items = isRecord(value) && isRecord(value.data) && isRecord(value.data.reviewedProducts) && Array.isArray(value.data.reviewedProducts.items)
    ? value.data.reviewedProducts.items.filter(isRecord) : [];
  const titleWords = new Set(words(pageTitle));
  const candidates = items.flatMap((item) => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const review = isRecord(item.latestReview) ? item.latestReview : undefined;
    const rating = review && isRecord(review.rating) ? review.rating : undefined;
    const score = typeof rating?.value === "number" ? rating.value : undefined;
    const nameWords = words(name);
    if (!name || !review || score === undefined || toHundredScale(score, 10) === undefined || nameWords.length < 2 ||
      !nameWords.every((word) => titleWords.has(word)) || hasProductVariantConflict(anchor, name) || isAccessoryMismatch(pageTitle, name)) return [];
    const section = typeof review.sectionName === "string" ? review.sectionName : "";
    const article = typeof review.articleId === "string" ? review.articleId : "";
    const slug = typeof review.articleSlug === "string" ? review.articleSlug : "";
    if (!/^[a-z-]+$/.test(section) || !/^[A-Za-z0-9]+$/.test(article) || !/^[a-z0-9-]*$/.test(slug)) return [];
    const strings = (list: unknown) => Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 10) : [];
    const conclusion = typeof rating?.conclusion === "string" ? rating.conclusion.trim() : "";
    const title = typeof review.title === "string" ? review.title.trim() : "";
    return [{ length: nameWords.length, review: {
      site: "Tek.no", score, maxScore: 10, url: `https://www.tek.no/${section}/i/${article}/${slug}`,
      ...(title ? { title: `${title} (${name})` } : { title: name }), ...(conclusion ? { quote: conclusion } : {}),
      ...(strings(rating?.pros).length ? { pros: strings(rating?.pros) } : {}), ...(strings(rating?.cons).length ? { cons: strings(rating?.cons) } : {}),
    } satisfies CriticReview }];
  });
  return candidates.sort((a, b) => b.length - a.length)[0]?.review;
}

export async function findTekReview(message: GetPriceMatchForProductMessage, requestJson: JsonRequest): Promise<CriticReview | undefined> {
  // The search matches every word, so the page's full title ("… robotstøvsuger (sort)") finds
  // nothing: search the first three words, then two, and let the name check pick the product.
  const titleWords = message.searchTerm.replace(/[()[\],]/g, " ").trim().split(/\s+/).filter(Boolean);
  for (const size of [3, 2]) {
    if (titleWords.length < size) continue;
    const value = await requestJson(TEK_REVIEW_GRAPHQL_URL, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ operationName: "ReviewedProducts", query: QUERY, variables: { query: titleWords.slice(0, size).join(" "), limit: 30 } }),
    });
    const review = readTekReview(value, message.searchTerm, buildProductMatchAnchor(message));
    if (review !== undefined) return review;
  }
  return undefined;
}

const TEK_ARTICLE_ID = /^https:\/\/www\.tek\.no\/[a-z-]+\/i\/([A-Za-z0-9]+)(?:\/|$)/;

/** A Tek.no test passed on by another source (Prisradar keeps copies) is checked against Tek's
 * own review platform: the item reviewed in the same article whose name agrees with the copy's
 * («Roborock QR 798» ↔ «Roborock Qrevo 798»: same numeric model, no variant conflict), exactly
 * one. Tek re-grades tests (8/10, «originalt 9/10»), so its current rating, conclusion, pros and
 * cons replace the copy's. Without a single verified item the copy is returned unchanged. */
export async function refreshTekCritic(critic: CriticReview, requestJson: JsonRequest): Promise<CriticReview> {
  const article = critic.url.match(TEK_ARTICLE_ID)?.[1];
  const name = critic.title?.replace(/^.*\((.+)\)$/, "$1").trim();
  if (critic.site !== "Tek.no" || article === undefined || !name) return critic;
  const nameWords = name.replace(/[()[\],]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (nameWords.length < 2) return critic;
  const value = await requestJson(TEK_REVIEW_GRAPHQL_URL, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ operationName: "ReviewedProducts", query: QUERY, variables: { query: nameWords.slice(0, 2).join(" "), limit: 30 } }),
  });
  const items = isRecord(value) && isRecord(value.data) && isRecord(value.data.reviewedProducts) && Array.isArray(value.data.reviewedProducts.items)
    ? value.data.reviewedProducts.items.filter(isRecord) : [];
  const matches = items.filter((item) => {
    const review = isRecord(item.latestReview) ? item.latestReview : undefined;
    const itemName = typeof item.name === "string" ? item.name : "";
    // «QR 798» reads as the code «qr798» that «Qrevo 798» lacks, so the full model-code check is
    // too strict here: same article, brand and stand-alone model number, and no tier/number conflict.
    return review?.articleId === article && itemName && sameBrand(name, itemName) && hasSameNumericModel(name, itemName) &&
      !hasNumericModelConflict(name, itemName) && !hasModelTierConflict(name, itemName);
  });
  if (matches.length !== 1) return critic;
  const current = readTekReview({ data: { reviewedProducts: { items: matches } } }, `${matches[0]!.name}`);
  return current === undefined ? critic : { ...critic, ...current, ...(critic.foundAt ? { foundAt: critic.foundAt } : {}) };
}

const sameBrand = (first: string, second: string) => words(first)[0] !== undefined && words(first)[0] === words(second)[0];

// Both names carry the same stand-alone model number («798»).
function hasSameNumericModel(first: string, second: string): boolean {
  const numbers = (text: string) => new Set(text.match(/\b\d{2,5}\b/g) ?? []);
  const firstNumbers = numbers(first);
  return [...numbers(second)].some((number) => firstNumbers.has(number));
}
