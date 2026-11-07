import { isRecord } from "./cashback.js";
import { readNextFlightValues } from "./product-data.js";
import type { PrisjaktDeal } from "./prisjakt-deals.js";
import { normalizePriceMatchShopName } from "./product-match.js";

/** Read only this product's concrete offer and history component, never recommendations.
 * History prices are scaled by 100, verified against the page's current JS currency
 * helper (`unscaled(value) = value / 100`), discovered from its script links Nov 2026.
 * The chart includes changes before the range's start; that starting price matters.
 */
export function readPrisjaktDealDetails(html: string, deal: PrisjaktDeal, now: string): Partial<PrisjaktDeal> {
  const queue = [...readNextFlightValues(html)];
  const result: Partial<PrisjaktDeal> = {};
  const charts: Record<string, unknown>[] = [];
  let variantId: number | undefined;
  for (let index = 0; index < queue.length && index < 50000; index += 1) {
    const value = queue[index];
    if (Array.isArray(value)) { queue.push(...value); continue; }
    if (!isRecord(value)) continue;
    if (String(value.productId) === deal.id) {
      if (isRecord(value.initialData) && isRecord(value.initialData.priceHistory)) charts.push(value);
      if (value.shopId === deal.storeId && String(value.shopOfferId) === deal.shopOfferId &&
        isRecord(value.price) && value.price.amount === deal.price && value.price.currency === deal.currency &&
        value.condition === "New" && value.stockStatus === "InStock" && value.isPaidMembership === false) {
        variantId = typeof value.variantId === "number" ? value.variantId : undefined;
        if (typeof value.shopLogoUrl === "string" && value.shopLogoUrl.startsWith("https://cdn.pji.nu/")) result.storeLogoUrl = value.shopLogoUrl;
        if (isRecord(value.shop) && isRecord(value.shop.membershipProgram) && typeof value.shop.membershipProgram.url === "string") {
          try {
            const url = new URL(value.shop.membershipProgram.url);
            if (url.protocol === "https:" && normalizePriceMatchShopName(url.hostname.replace(/^www\./, "")) === normalizePriceMatchShopName(deal.store)) result.storeUrl = url.origin;
          } catch { /* Missing a verifiable retailer URL. */ }
        }
        if (typeof value.priceValidUntil === "string") {
          const expiry = value.priceValidUntil.replace(/^\$D/, "");
          if (Number.isFinite(Date.parse(expiry))) result.validTo = new Date(expiry).toISOString();
        }
      }
    }
    queue.push(...Object.values(value));
  }
  const nowMs = Date.parse(now);
  const start = nowMs - 90 * 86400000;
  for (const chart of charts) {
    if (!isRecord(chart.marketConfig) || chart.marketConfig.currency !== deal.currency || !isRecord(chart.initialData)) continue;
    const history = chart.initialData.priceHistory;
    if (!isRecord(history) || !Array.isArray(history.historyItems) || !Array.isArray(chart.variantIds)) continue;
    const specificVariant = [...new URL(deal.productUrl).searchParams.keys()].some((key) => key.startsWith("a-"));
    if (specificVariant && (variantId === undefined || !chart.variantIds.includes(variantId))) continue;
    if (chart.variantIds.length > 0 && (variantId === undefined || !chart.variantIds.includes(variantId))) continue;
    const updated = typeof history.newestHistoryItem === "string" ? Date.parse(history.newestHistoryItem) : NaN;
    const oldest = typeof history.oldestHistoryItem === "string" ? Date.parse(history.oldestHistoryItem) : NaN;
    // A partial chart is not evidence for the whole 90-day period.
    if (!Number.isFinite(updated) || updated < nowMs - 2 * 86400000 || updated > nowMs || !(oldest <= start)) continue;
    const events = history.historyItems.filter(isRecord).filter((item) => typeof item.date === "string" && Date.parse(item.date) <= nowMs)
      .sort((a, b) => Date.parse(String(a.date)) - Date.parse(String(b.date)));
    const beforeStart = events.filter((item) => Date.parse(String(item.date)) <= start).at(-1);
    if (!beforeStart) continue;
    const inRange = events.filter((item) => Date.parse(String(item.date)) > start);
    const prices = [...(beforeStart ? [beforeStart] : []), ...inRange].filter((item) => item.active === true && item.isMembershipPrice === false && item.isPaidMembership === false &&
      typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0).map((item) => (item.price as number) / 100);
    if (prices.length === 0) continue;
    result.lowestPrice90Days = Math.min(...prices);
    result.historyScope = chart.variantIds.length > 0 ? "variant" : "product";
    result.historyUpdatedAt = new Date(updated).toISOString();
    break;
  }
  return result;
}
