// Prisjakt users' rating of the shop the reader is on, for any product page on that shop.
// Prisjakt's app GraphQL (already used by the price match) has search(query).shops and
// shops(ids) with homePage.url and userReviews { count, rating (0–10) }. The shop is accepted
// only when its home page has the same host as the page, so a similar name never counts.
import { isRecord, parseUrl } from "./cashback.js";
import type { JsonRequest } from "./prisjakt-price-match.js";
import { PRISJAKT_NATIVE_AUTHORIZATION, PRISJAKT_NATIVE_GRAPHQL_URL } from "./prisjakt-price-match.js";
import { toHundredScale, type StoreRating } from "./product-reviews.js";

const SEARCH = "query ShopSearch($query: String!) { search(query: $query) { shops { nodes { id } } } }";
const SHOPS = "query Shops($ids: [Int!]!) { shops(ids: $ids) { id name homePage { url } userReviews { count rating } } }";
const host = (raw: string) => parseUrl(raw)?.hostname.toLowerCase().replace(/^www\./, "");

async function graphql(requestJson: JsonRequest, query: string, variables: Record<string, unknown>): Promise<unknown> {
  return requestJson(PRISJAKT_NATIVE_GRAPHQL_URL, {
    method: "POST",
    headers: { "Accept": "application/json", "Authorization": PRISJAKT_NATIVE_AUTHORIZATION, "Content-Type": "application/json", "Market": "no" },
    body: JSON.stringify({ query, variables }),
  });
}

export function readPrisjaktShops(value: unknown, pageHost: string): StoreRating | undefined {
  const shops = isRecord(value) && isRecord(value.data) && Array.isArray(value.data.shops) ? value.data.shops.filter(isRecord) : [];
  for (const shop of shops) {
    const home = isRecord(shop.homePage) && typeof shop.homePage.url === "string" ? shop.homePage.url : "";
    const reviews = isRecord(shop.userReviews) ? shop.userReviews : undefined;
    const score = typeof reviews?.rating === "number" ? reviews.rating : undefined;
    const count = typeof reviews?.count === "number" ? reviews.count : undefined;
    const id = typeof shop.id === "string" || typeof shop.id === "number" ? String(shop.id) : "";
    if (host(home) !== pageHost || !/^\d+$/.test(id) || typeof shop.name !== "string" || score === undefined || count === undefined ||
      !Number.isInteger(count) || count <= 0 || toHundredScale(score, 10) === undefined) continue;
    return { source: "prisjakt", shopName: shop.name, score, maxScore: 10, count, url: `https://www.prisjakt.no/shop.php?f=${id}` };
  }
  return undefined;
}

export async function findPrisjaktShopRating(pageUrl: string, requestJson: JsonRequest): Promise<StoreRating | undefined> {
  const pageHost = host(pageUrl);
  const label = pageHost?.split(".")[0];
  if (!pageHost || !label || label.length < 3) return undefined;
  const found = await graphql(requestJson, SEARCH, { query: label });
  const nodes = isRecord(found) && isRecord(found.data) && isRecord(found.data.search) && isRecord(found.data.search.shops) && Array.isArray(found.data.search.shops.nodes)
    ? found.data.search.shops.nodes.filter(isRecord) : [];
  const ids = nodes.map((node) => Number(node.id)).filter((id) => Number.isInteger(id) && id > 0).slice(0, 5);
  return ids.length === 0 ? undefined : readPrisjaktShops(await graphql(requestJson, SHOPS, { ids }), pageHost);
}
