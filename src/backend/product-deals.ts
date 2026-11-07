import { Configuration, HttpCrawler, MemoryStorage } from "crawlee";
import type { Logger } from "./logger.js";
import type { PrisjaktDealsCatalog } from "./prisjakt-deals.js";
import { fetchProductDealSource, type SourceInput } from "./product-deal-sources.js";
import { DEAL_SOURCES, isProductDealsCatalog, rankProductDeals, type ProductDeal, type ProductDealsCatalog } from "../shared/product-deals.js";
import { cacheOfferImages, imageKey } from "./offer-images.js";
import { getMerchantFaviconUrl } from "../shared/deal-merchants.js";

export type ProductDealsInput = {
  generatedAt: string; logger: Logger; prisjakt?: PrisjaktDealsCatalog;
  merchantDomain?: (name: string) => string | undefined;
  previous?: ProductDealsCatalog; previousUrl?: string;
  sourceOptions?: Partial<Pick<SourceInput, "maxProducts" | "maxPages" | "requestUrl" | "timeoutSecs">>;
  imageDirectory?: string; imageRequestUrl?: (url: string) => string;
};

/** Product prices never enter the cashback index. Failures are isolated by
 * source, with the original timestamp retained on a <=14-day fallback. */
export async function collectProductDeals(input: ProductDealsInput): Promise<ProductDealsCatalog> {
  const previous = input.previous ?? await fetchPrevious(input);
  const raw: ProductDeal[] = [];
  const sources: ProductDealsCatalog["sources"] = [];
  if (input.prisjakt) {
    const deals: ProductDeal[] = input.prisjakt.deals.map(deal => ({ ...deal, source: "prisjakt", sourceRank: deal.rank, updatedAt: input.prisjakt!.generatedAt, referenceLabel: "Prisjakts normalpris fra de siste tre månedene" }));
    raw.push(...deals);
    sources.push({ source: "prisjakt", updatedAt: input.prisjakt.generatedAt, count: deals.length, reused: input.prisjakt.generatedAt !== input.generatedAt });
  } else {
    const seen = new Set<string>();
    const fallback = previous?.deals.flatMap(deal => deal.sources).filter(deal => {
      const age = Date.parse(input.generatedAt) - Date.parse(deal.updatedAt);
      if (deal.source !== "prisjakt" || seen.has(deal.id) || age < 0 || age > 14 * 86400000) return false;
      seen.add(deal.id); return true;
    }) ?? [];
    if (fallback.length) {
      raw.push(...fallback);
      sources.push({ source: "prisjakt", updatedAt: fallback[0]!.updatedAt, count: fallback.length, reused: true });
      input.logger.warn(`prisjakt deals: reusing ${fallback.length} combined-catalogue offers with original timestamps`);
    }
  }
  const results = await Promise.allSettled(DEAL_SOURCES.filter(source => source !== "prisjakt").map(async source => ({ source, deals: await fetchProductDealSource({ ...input.sourceOptions, source, generatedAt: input.generatedAt, logger: input.logger }) })));
  for (let index = 0; index < results.length; index++) {
    const source = (["klarna", "prisradar", "godpris"] as const)[index]!;
    const result = results[index]!;
    if (result.status === "fulfilled") {
      raw.push(...result.value.deals);
      sources.push({ source, updatedAt: input.generatedAt, count: result.value.deals.length, reused: false });
      continue;
    }
    const seen = new Set<string>();
    const fallback = previous?.deals.flatMap(deal => deal.sources).filter(deal => {
      const key = `${deal.source}:${deal.id}`;
      const age = Date.parse(input.generatedAt) - Date.parse(deal.updatedAt);
      if (deal.source !== source || seen.has(key) || age < 0 || age > 14 * 86400000) return false;
      seen.add(key); return true;
    }) ?? [];
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    input.logger.warn(`${source} deals: ${reason}; ${fallback.length ? `reusing ${fallback.length} offers with original timestamps` : "no usable previous offers"}`);
    raw.push(...fallback);
    if (fallback.length) sources.push({ source, updatedAt: fallback[0]!.updatedAt, count: fallback.length, reused: true });
  }
  const prepared = await cacheProductDealImages(raw, input);
  const deals = rankProductDeals(prepared, input.generatedAt);
  input.logger.info(`Combined deals: ${raw.length} source offers → ${deals.length} products; ${sources.map(source => `${source.source} ${source.count}${source.reused ? " (fallback)" : ""}`).join(", ")}`);
  return { version: 1, generatedAt: input.generatedAt, sources, deals };
}

export async function cacheProductDealImages(deals: ProductDeal[], input: Pick<ProductDealsInput, "logger" | "merchantDomain" | "imageDirectory" | "imageRequestUrl">): Promise<ProductDeal[]> {
  const rows = deals.map(deal => {
    const original = deal.imageSourceUrl ?? deal.imageUrl;
    // Preserve the original photo, including white products and their shadows.
    // Also restores earlier cutouts when reusing a published catalogue.
    const imageUrl = original;
    const domain = input.merchantDomain?.(deal.store);
    const storeIconUrl = deal.storeIconUrl?.startsWith("/offer-images/") ? deal.storeIconUrl : domain ? getMerchantFaviconUrl(domain) : undefined;
    return { ...deal, ...(original ? { imageSourceUrl: original } : {}), ...(imageUrl ? { imageUrl } : {}), ...(storeIconUrl ? { storeIconUrl } : {}) };
  });
  const snapshots = await cacheOfferImages(rows.flatMap(deal => [
    ...(deal.imageUrl ? [{ url: deal.imageUrl }] : []), ...(deal.storeIconUrl ? [{ url: deal.storeIconUrl, size: 64 }] : []),
  ]), { logger: input.logger, ...(input.imageDirectory ? { directory: input.imageDirectory } : {}), ...(input.imageRequestUrl ? { requestUrl: input.imageRequestUrl } : {}) });
  return rows.map(deal => {
    const photo = deal.imageUrl && snapshots.get(imageKey({ url: deal.imageUrl }));
    const imageUrl = photo;
    const storeIconUrl = deal.storeIconUrl && snapshots.get(imageKey({ url: deal.storeIconUrl, size: 64 }));
    const { imageUrl: _photo, copyImageUrl: _copy, storeIconUrl: _icon, storeLogoUrl: _logo, ...rest } = deal;
    return { ...rest, ...(imageUrl ? { imageUrl, copyImageUrl: imageUrl } : {}), ...(storeIconUrl ? { storeIconUrl } : {}) };
  });
}

async function fetchPrevious(input: ProductDealsInput): Promise<ProductDealsCatalog | undefined> {
  let previous: ProductDealsCatalog | undefined;
  const config = new Configuration(); config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  const crawler = new HttpCrawler({ maxConcurrency: 1, maxRequestRetries: 2, navigationTimeoutSecs: 30, useSessionPool: false, ignoreSslErrors: false, additionalMimeTypes: ["application/json"],
    async requestHandler({ request, body }) {
      let value: unknown;
      try { value = JSON.parse(String(body)); } catch { request.noRetry = true; throw new Error("invalid JSON"); }
      if (!isProductDealsCatalog(value)) { request.noRetry = true; throw new Error("unexpected catalogue format"); }
      previous = value;
    }, async failedRequestHandler({ request }, error) { input.logger.warn(`Combined deals: previous ${request.url} unavailable (${error.message.slice(0, 200)})`); },
  }, config);
  await crawler.run([input.previousUrl ?? "https://cashbacknorge.no/product-deals.json"]);
  return previous;
}
