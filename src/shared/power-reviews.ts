// Buyer rating at Power for the product on the page. Power's public product search
// (/api/v2/productlists, the same call its own search page uses) returns each product's
// productReview { overallAverageRating, overallTotalReviewCount } and its manufacturer part
// number, so no product page is read. A result counts only when its part number or a GTIN
// search matches the page's own code and the title passes the shared variant checks.
// Power runs shops in several Nordic countries; "overall" may include their reviews.
import type { GetPriceMatchForProductMessage } from "./extension-messages.js";
import type { JsonRequest } from "./prisjakt-price-match.js";
import { buildProductMatchAnchor, hasProductVariantConflict, isLikelyGtin, isLikelyMpn, isValidGtin } from "./product-match.js";
import { isRecord } from "./cashback.js";
import { toHundredScale, type UserRating } from "./product-reviews.js";

export const POWER_SEARCH_URL = "https://www.power.no/api/v2/productlists";
const MAX_QUERIES = 2;
const codeKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function findPowerUserRating(message: GetPriceMatchForProductMessage, requestJson: JsonRequest): Promise<UserRating | undefined> {
  const codes = [...new Set((message.codes ?? []).map((code) => code.trim()).filter((code) => isValidGtin(code) || (isLikelyMpn(code) && !isLikelyGtin(code))))];
  const anchor = buildProductMatchAnchor(message);
  for (const code of codes.slice(0, MAX_QUERIES)) {
    const value = await requestJson(`${POWER_SEARCH_URL}?${new URLSearchParams({ q: code, size: "5" })}`, { headers: { Accept: "application/json" } });
    const products = isRecord(value) && Array.isArray(value.products) ? value.products.filter(isRecord) : [];
    const byGtin = isValidGtin(code);
    for (const product of products) {
      const title = typeof product.title === "string" ? product.title : "";
      const mpn = typeof product.productManufactorIdentity === "string" ? product.productManufactorIdentity : "";
      // A GTIN search may return accessories; a single hit is Power's own code match.
      const sameProduct = byGtin ? products.length === 1 : codeKey(mpn) === codeKey(code);
      if (!title || !sameProduct || hasProductVariantConflict(anchor, title)) continue;
      const review = isRecord(product.productReview) ? product.productReview : undefined;
      const score = typeof review?.overallAverageRating === "number" ? review.overallAverageRating : undefined;
      const count = typeof review?.overallTotalReviewCount === "number" ? review.overallTotalReviewCount : undefined;
      const path = typeof product.url === "string" && product.url.startsWith("/") ? product.url : undefined;
      if (score === undefined || count === undefined || !Number.isInteger(count) || count <= 0 || toHundredScale(score, 5) === undefined || path === undefined) return undefined;
      return { source: "store:www.power.no", sourceName: "Power", score: Number(score.toFixed(2)), maxScore: 5, count, url: `https://www.power.no${path}`, productName: title.slice(0, 300) };
    }
  }
  return undefined;
}
