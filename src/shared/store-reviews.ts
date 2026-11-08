// Buyer ratings from shops whose own search sends a GTIN straight to the product page.
// The page's Product JSON-LD must carry the same GTIN before its aggregateRating is used, so a
// search that lands on another product or a result list gives nothing. Each shop needs
// host_permissions in the manifest and @connect in the userscript.
import type { GetPriceMatchForProductMessage } from "./extension-messages.js";
import { buildProductMatchAnchor, hasProductVariantConflict, isValidGtin, MIN_PRODUCT_MATCH_SCORE, scoreProductCandidateMatch, type ProductMatchAnchor } from "./product-match.js";
import { isRecord } from "./cashback.js";
import { readLdJsonScripts } from "./product-data.js";
import { toHundredScale, type UserRating } from "./product-reviews.js";

type TextRequest = (url: string, init?: { headers?: Record<string, string> }) => Promise<string | undefined>;
// `searchUrl` with a GTIN lands on the product page; `titleSearch` lists product links instead.
type GtinSearchStore = { host: string; name: string; searchUrl: (gtin: string) => string; titleSearch?: { url: (query: string) => string; link: RegExp } };

// Lyko: /no/sok?q=<GTIN> redirects to the product (checked 2026-11-08 with 7046110321911).
export const GTIN_SEARCH_STORES: GtinSearchStore[] = [
  { host: "lyko.com", name: "Lyko", searchUrl: (gtin) => `https://lyko.com/no/sok?q=${encodeURIComponent(gtin)}` },
  // Boozt: the search lists product links; each product page has its GTIN and rating in JSON-LD.
  { host: "www.boozt.com", name: "Boozt", searchUrl: (gtin) => `https://www.boozt.com/no/no/search/result?q=${encodeURIComponent(gtin)}`,
    titleSearch: { url: (query) => `https://www.boozt.com/no/no/search/result?q=${encodeURIComponent(query)}`, link: /https:\/\/www\.boozt\.com\/no\/no\/[a-z0-9-]+\/[a-z0-9-]+_\d+\/\d+/g } },
];
const MAX_TITLE_LINKS = 3;

const gtin14 = (value: string) => value.replace(/\D/g, "").padStart(14, "0");

function ldProducts(html: string): Record<string, unknown>[] {
  // A ProductGroup's variants (hasVariant) can carry the rating (Kicks).
  const flat = (value: unknown): unknown[] => Array.isArray(value) ? value.flatMap(flat) : !isRecord(value) ? [value] :
    Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flat) : [value, ...(Array.isArray(value.hasVariant) ? value.hasVariant.flatMap(flat) : [])];
  return readLdJsonScripts(html).flatMap(flat).filter(isRecord).filter((item) => {
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    return types.includes("Product") || types.includes("ProductGroup");
  });
}

/**
 * The page counts only when one of its Product entries carries the GTIN and its name passes the
 * page's product checks; the rating may sit on another entry of the same page (Boozt).
 */
export function readGtinPageRating(html: string, gtin: string, store: GtinSearchStore, url: string, anchor?: ProductMatchAnchor): UserRating | undefined {
  const products = ldProducts(html);
  const matching = products.find((product) => ["gtin", "gtin8", "gtin12", "gtin13", "gtin14"].some((key) => {
    const code = product[key];
    return (typeof code === "string" || typeof code === "number") && isValidGtin(String(code)) && gtin14(String(code)) === gtin14(gtin);
  }));
  if (matching === undefined) return undefined;
  const name = typeof matching.name === "string" ? matching.name : "";
  if (anchor !== undefined && (!name || hasProductVariantConflict(anchor, name) || scoreProductCandidateMatch(anchor, { title: name }) < MIN_PRODUCT_MATCH_SCORE)) return undefined;
  const rated = [matching, ...products].find((product) => isRecord(product.aggregateRating));
  const rating = rated !== undefined && isRecord(rated.aggregateRating) ? rated.aggregateRating : undefined;
  const number = (value: unknown) => typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  const score = number(rating?.ratingValue);
  const maxScore = Number.isFinite(number(rating?.bestRating)) ? number(rating?.bestRating) : 5;
  const count = Number.isFinite(number(rating?.ratingCount)) ? number(rating?.ratingCount) : number(rating?.reviewCount);
  if (!Number.isFinite(score) || !Number.isInteger(count) || count <= 0 || toHundredScale(score, maxScore) === undefined) return undefined;
  const own = (value: unknown) => typeof value === "string" && value.startsWith(`https://${store.host}/`) ? value : undefined;
  const pageUrl = own(matching.url) ?? (isRecord(matching.offers) ? own(matching.offers.url) : undefined) ?? url;
  return { source: `store:${store.host}`, sourceName: store.name, score, maxScore, count, url: pageUrl, ...(name ? { productName: name.slice(0, 300) } : {}) };
}

export async function findGtinStoreRatings(message: GetPriceMatchForProductMessage, requestText: TextRequest): Promise<UserRating[]> {
  const gtin = (message.codes ?? []).map((code) => code.trim()).find(isValidGtin);
  if (gtin === undefined) return [];
  const anchor = buildProductMatchAnchor(message);
  const currentHost = (() => { try { return new URL(message.url).hostname; } catch { return ""; } })();
  const read = (url: string) => requestText(url, { headers: { Accept: "text/html" } }).catch(() => undefined);
  const query = message.searchTerm.replace(/[()[\],]/g, " ").trim().split(/\s+/).slice(0, 6).join(" ");
  const ratings = await Promise.all(GTIN_SEARCH_STORES.filter((store) => store.host.replace(/^www\./, "") !== currentHost.replace(/^www\./, "")).map(async (store) => {
    const url = store.searchUrl(gtin);
    const landing = await read(url);
    const direct = landing === undefined ? undefined : readGtinPageRating(landing, gtin, store, url, anchor);
    if (direct !== undefined || store.titleSearch === undefined || query.length < 4) return direct;
    // No direct hit: read the first product links from a title search, each checked by GTIN.
    const list = await read(store.titleSearch.url(query));
    const links = [...new Set(list?.match(store.titleSearch.link) ?? [])].slice(0, MAX_TITLE_LINKS);
    for (const link of links) {
      const page = await read(link);
      const rating = page === undefined ? undefined : readGtinPageRating(page, gtin, store, link, anchor);
      if (rating !== undefined) return rating;
    }
    return undefined;
  }));
  return ratings.filter((rating): rating is UserRating => rating !== undefined);
}
