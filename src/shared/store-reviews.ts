// Buyer ratings from shops whose own search sends a GTIN straight to the product page.
// The page's Product JSON-LD must carry the same GTIN before its aggregateRating is used, so a
// search that lands on another product or a result list gives nothing. Each shop needs
// host_permissions in the manifest and @connect in the userscript.
import type { GetPriceMatchForProductMessage } from "./extension-messages.js";
import { isValidGtin } from "./product-match.js";
import { isRecord } from "./cashback.js";
import { readLdJsonScripts, selectProductLdJson } from "./product-data.js";
import { readJsonLdUserRating, type UserRating } from "./product-reviews.js";

type TextRequest = (url: string, init?: { headers?: Record<string, string> }) => Promise<string | undefined>;
type GtinSearchStore = { host: string; name: string; searchUrl: (gtin: string) => string };

// Lyko: /no/sok?q=<GTIN> redirects to the product (checked 2026-11-08 with 7046110321911).
export const GTIN_SEARCH_STORES: GtinSearchStore[] = [
  { host: "lyko.com", name: "Lyko", searchUrl: (gtin) => `https://lyko.com/no/sok?q=${encodeURIComponent(gtin)}` },
];

const gtin14 = (value: string) => value.replace(/\D/g, "").padStart(14, "0");

export function readGtinPageRating(html: string, gtin: string, store: GtinSearchStore, url: string): UserRating | undefined {
  const product = selectProductLdJson(readLdJsonScripts(html));
  if (product === undefined) return undefined;
  const codes = ["gtin", "gtin8", "gtin12", "gtin13", "gtin14"].map((key) => product[key]).filter((value): value is string | number => typeof value === "string" || typeof value === "number").map(String);
  if (!codes.some((code) => isValidGtin(code) && gtin14(code) === gtin14(gtin))) return undefined;
  const pageUrl = typeof product.url === "string" && product.url.startsWith(`https://${store.host}/`) ? product.url
    : isRecord(product.offers) && typeof product.offers.url === "string" && product.offers.url.startsWith(`https://${store.host}/`) ? product.offers.url : url;
  return readJsonLdUserRating(html, `store:${store.host}`, store.name, pageUrl);
}

export async function findGtinStoreRatings(message: GetPriceMatchForProductMessage, requestText: TextRequest): Promise<UserRating[]> {
  const gtin = (message.codes ?? []).map((code) => code.trim()).find(isValidGtin);
  if (gtin === undefined) return [];
  const currentHost = (() => { try { return new URL(message.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const ratings = await Promise.all(GTIN_SEARCH_STORES.filter((store) => store.host !== currentHost).map(async (store) => {
    const url = store.searchUrl(gtin);
    const html = await requestText(url, { headers: { Accept: "text/html" } }).catch(() => undefined);
    return html === undefined ? undefined : readGtinPageRating(html, gtin, store, url);
  }));
  return ratings.filter((rating): rating is UserRating => rating !== undefined);
}
