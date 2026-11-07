// Daily catalogue of Prisjakt's "Dagens tilbud" for cashbacknorge.no/dagens-tilbud.
//
// Source: the public pages prisjakt.no/tema/dagens-tilbud?page=N (popularity order). There is
// no verified list endpoint in the existing product-search adapter or page; read the page's own
// server-rendered data (see src/shared/prisjakt-deals.ts). Bounded to the first pages, one
// request at a time. Prisjakt sits behind Cloudflare, so a challenge page is reported as a
// format error and the previously published catalogue is reused (at most 14 days old).
import { Configuration, HttpCrawler, type HttpCrawlingContext, MemoryStorage, Request } from "crawlee";
import { readPrisjaktDeals, type PrisjaktDeal } from "../shared/prisjakt-deals.js";
import type { Logger } from "./logger.js";
import { readPrisjaktDealDetails, readPrisjaktAllTimeHistory } from "../shared/prisjakt-deal-details.js";
import { createHash } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve, basename } from "node:path";

export const PRISJAKT_DEALS_URL = "https://www.prisjakt.no/tema/dagens-tilbud";
export const PRISJAKT_DEALS_PUBLISHED_URL = "https://cashbacknorge.no/prisjakt-deals.json";
const MAX_PAGES = 10;
const MAX_CATALOG_AGE_DAYS = 14;

export type PrisjaktDealsCatalog = {
  version: 1;
  generatedAt: string;
  source: string;
  deals: Array<PrisjaktDeal & { rank: number }>;
};

export type CollectPrisjaktDealsInput = {
  generatedAt: string;
  logger: Logger;
  pageUrl?: string;
  previousUrl?: string;
  maxPages?: number;
  navigationTimeoutSecs?: number;
  maxDetailProducts?: number;
  productPageUrl?: (deal: PrisjaktDeal) => string;
  historyUrl?: string;
  copyImageDirectory?: string;
  imageRequestUrl?: (url: string) => string;
};

export async function collectPrisjaktDeals(input: CollectPrisjaktDealsInput): Promise<PrisjaktDealsCatalog | undefined> {
  try {
    return await cachePrisjaktCopyImages(await enrichPrisjaktDeals(await fetchPrisjaktDeals(input), input), input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const previous = await fetchPreviousCatalog(input).catch((previousError: unknown) => {
      input.logger.warn(`Prisjakt deals: previous catalogue ${input.previousUrl ?? PRISJAKT_DEALS_PUBLISHED_URL} unavailable (${previousError instanceof Error ? previousError.message : String(previousError)})`);
      return undefined;
    });
    const age = previous === undefined ? NaN : Date.parse(input.generatedAt) - Date.parse(previous.generatedAt);
    if (previous !== undefined && age >= 0 && age <= MAX_CATALOG_AGE_DAYS * 86_400_000) {
      input.logger.warn(`${message}; reusing ${previous.deals.length} deals from the catalogue generated ${previous.generatedAt}`);
      return await cachePrisjaktCopyImages(previous, input);
    }
    input.logger.error(`${message}; no usable previous Prisjakt deals catalogue`);
    return undefined;
  }
}

/** Legacy cdn.pji.nu images omit CORS headers. Store those exact public images
 * with the published site so the browser can include them in a clipboard PNG.
 * The normal thumbnail retains its source URL. No third-party image proxy.
 */
export async function cachePrisjaktCopyImages(catalog: PrisjaktDealsCatalog, input: CollectPrisjaktDealsInput): Promise<PrisjaktDealsCatalog> {
  const directory = input.copyImageDirectory ?? resolve("site/deal-images");
  const deals = catalog.deals.map((deal) => ({ ...deal }));
  const requests: Request[] = [];
  const pendingPaths = new Map<number, string>();
  const availablePaths = new Set<string>();
  for (const [index, deal] of deals.entries()) {
    if (index >= 400) break;
    let url: URL;
    try { url = new URL(deal.imageUrl ?? ""); } catch { continue; }
    const previous = deal.copyImageUrl && /^\/deal-images\/[a-f0-9]{32}\.(?:png|jpe?g|webp)$/.test(deal.copyImageUrl) ? deal.copyImageUrl : undefined;
    const extension = url.pathname.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
    if (!previous && (url.hostname !== "cdn.pji.nu" || !url.pathname.startsWith("/product/") || !extension)) continue;
    const path = previous ?? `/deal-images/${createHash("sha256").update(url.href).digest("hex").slice(0, 32)}.${extension}`;
    try { await access(resolve(directory, basename(path))); deal.copyImageUrl = path; continue; } catch { /* Download below. */ }
    delete deal.copyImageUrl;
    pendingPaths.set(index, path);
    const sourceUrl = previous ? `https://cashbacknorge.no${previous}` : url.href;
    requests.push(new Request({ url: input.imageRequestUrl?.(sourceUrl) ?? sourceUrl, userData: { index, path } }));
  }
  if (!requests.length) return { ...catalog, deals };
  await mkdir(directory, { recursive: true });
  const crawler = createCrawler(input, async ({ request, buffer, contentType }) => {
    if (!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(contentType) || buffer.length < 8 || buffer.length > 5 * 1024 * 1024) throw new NoRetryError(`Prisjakt copy image: unexpected image format/size (${contentType}, ${buffer.length} bytes)`);
    await writeFile(resolve(directory, basename(request.userData.path as string)), buffer);
    deals[request.userData.index as number]!.copyImageUrl = request.userData.path as string;
    availablePaths.add(request.userData.path as string);
  }, (request, reason) => input.logger.warn(`Prisjakt copy image: ${request.url} (${reason})`), ["image/jpeg", "image/png", "image/webp"]);
  await crawler.run(requests);
  for (const [index, path] of pendingPaths) if (availablePaths.has(path)) deals[index]!.copyImageUrl = path;
  input.logger.info(`Prisjakt copy images: ${deals.filter((deal) => deal.copyImageUrl).length} available`);
  return { ...catalog, deals };
}

/** Bounded sequential reads; detail failures leave the verified listing usable. */
export async function enrichPrisjaktDeals(catalog: PrisjaktDealsCatalog, input: CollectPrisjaktDealsInput): Promise<PrisjaktDealsCatalog> {
  const limit = Math.max(0, Math.min(400, Math.trunc(input.maxDetailProducts ?? 400)));
  const deals = catalog.deals.map((deal) => ({ ...deal }));
  let failed = 0;
  const crawler = createCrawler(input, async ({ request, body }) => {
    const index = request.userData.index as number;
    if (request.userData.kind === "history") {
      let json: unknown;
      try { json = JSON.parse(body); } catch { throw new NoRetryError("Prisjakt history: invalid JSON"); }
      Object.assign(deals[index]!, readPrisjaktAllTimeHistory(json, deals[index]!.historyVariantIds!, catalog.generatedAt));
      return;
    }
    Object.assign(deals[index]!, readPrisjaktDealDetails(body, deals[index]!, catalog.generatedAt));
    const variantIds = deals[index]!.historyVariantIds;
    if (variantIds) await crawler.addRequests([new Request({
      url: input.historyUrl ?? "https://www.prisjakt.no/api/price-history", method: "POST",
      uniqueKey: `history:${deals[index]!.id}:${variantIds.join(",")}`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      payload: JSON.stringify({ productId: Number(deals[index]!.id), timeRange: "ALL", shopIds: [], variantIds }),
      userData: { index, kind: "history" },
    })]);
  }, (request, reason) => { failed += 1; input.logger.warn(`Prisjakt details: ${request.url} (${reason})`); });
  await crawler.run(deals.slice(0, limit).map((deal, index) => new Request({ url: input.productPageUrl?.(deal) ?? deal.productUrl, userData: { index } })));
  input.logger.info(`Prisjakt details: ${Math.min(limit, deals.length)} products, ${deals.filter((deal) => deal.lowestPriceEver !== undefined).length} verified all-time histories, ${failed} failed`);
  return { ...catalog, deals };
}

export async function fetchPrisjaktDeals(input: CollectPrisjaktDealsInput): Promise<PrisjaktDealsCatalog> {
  const pageUrl = input.pageUrl ?? PRISJAKT_DEALS_URL;
  const maxPages = Number.isFinite(input.maxPages) ? Math.max(1, Math.min(MAX_PAGES, Math.trunc(input.maxPages!))) : MAX_PAGES;
  const pages = new Map<number, PrisjaktDeal[]>();
  const failures: string[] = [];
  const crawler = createCrawler(input, async ({ request, body }) => {
    const page = request.userData.page as number;
    let deals: PrisjaktDeal[];
    try {
      deals = readPrisjaktDeals(body);
    } catch (error) {
      throw new NoRetryError(error instanceof Error ? error.message : String(error));
    }
    pages.set(page, deals);
  }, (request, reason) => { failures.push(`page ${String(request.userData.page)} ${request.url} (${reason})`); });

  await crawler.run(Array.from({ length: maxPages }, (_value, index) => new Request({
    url: (() => { const url = new URL(pageUrl); if (index > 0) url.searchParams.set("page", String(index + 1)); return url.href; })(),
    userData: { page: index + 1 },
    headers: { Accept: "text/html", "Accept-Language": "nb-NO,nb;q=0.9" },
  })));
  if (!pages.has(1)) throw new Error(`Prisjakt deals: first page failed: ${failures.join("; ") || "no result"}`);
  for (const failure of failures) input.logger.warn(`Prisjakt deals: ${failure}`);
  // Keep Prisjakt's order (popularity) across pages; a product on two pages counts once.
  const seen = new Set<string>();
  const deals: PrisjaktDealsCatalog["deals"] = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    for (const deal of pages.get(page)!) {
      if (seen.has(deal.id) || (deal.validTo && Date.parse(deal.validTo) < Date.parse(input.generatedAt))) continue;
      seen.add(deal.id);
      deals.push({ ...deal, rank: deals.length + 1 });
    }
  }
  if (deals.length === 0) throw new Error("Prisjakt deals: no deals in stock on the pages read");
  input.logger.info(`Prisjakt deals: ${deals.length} deals from ${pages.size} of ${maxPages} pages (${failures.length} failed)`);
  return { version: 1, generatedAt: input.generatedAt, source: "Prisjakt (Dagens tilbud)", deals };
}

async function fetchPreviousCatalog(input: CollectPrisjaktDealsInput): Promise<PrisjaktDealsCatalog | undefined> {
  let catalog: PrisjaktDealsCatalog | undefined;
  let failure: string | undefined;
  const crawler = createCrawler(input, async ({ body }) => {
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new NoRetryError("invalid JSON"); }
    if (isPrisjaktDealsCatalog(json)) catalog = json;
    else throw new NoRetryError("unexpected catalogue format");
  }, (_request, reason) => { failure = reason; }, ["application/json"]);
  await crawler.run([new Request({ url: input.previousUrl ?? PRISJAKT_DEALS_PUBLISHED_URL, userData: { page: 0 } })]);
  if (failure !== undefined) throw new Error(failure);
  return catalog;
}

export function isPrisjaktDealsCatalog(value: unknown): value is PrisjaktDealsCatalog {
  if (typeof value !== "object" || value === null) return false;
  const catalog = value as Record<string, unknown>;
  return catalog.version === 1 && typeof catalog.generatedAt === "string" && Number.isFinite(Date.parse(catalog.generatedAt)) && Array.isArray(catalog.deals) &&
    catalog.deals.every((deal) => typeof deal === "object" && deal !== null &&
      typeof (deal as Record<string, unknown>).id === "string" && typeof (deal as Record<string, unknown>).name === "string" &&
      typeof (deal as Record<string, unknown>).price === "number" && Number.isFinite((deal as Record<string, unknown>).price) && ((deal as Record<string, unknown>).price as number) > 0 &&
      (deal as Record<string, unknown>).currency === "NOK" && typeof (deal as Record<string, unknown>).store === "string" &&
      typeof (deal as Record<string, unknown>).productUrl === "string" && ((deal as Record<string, unknown>).productUrl as string).startsWith("https://www.prisjakt.no/"));
}

class NoRetryError extends Error {}

function createCrawler(
  input: CollectPrisjaktDealsInput,
  handle: (context: { request: Request; body: string; buffer: Buffer; contentType: string }) => Promise<void>,
  onFailure: (request: Request, reason: string) => void,
  additionalMimeTypes: string[] = [],
): HttpCrawler<HttpCrawlingContext> {
  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  return new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    navigationTimeoutSecs: input.navigationTimeoutSecs ?? 30,
    requestHandlerTimeoutSecs: 30,
    useSessionPool: false,
    ignoreSslErrors: false,
    additionalMimeTypes,
    requestHandler: async ({ request, body, response }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        if (status !== 429 && status < 500) request.noRetry = true;
        throw new Error(`HTTP ${status}`);
      }
      try {
        const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
        await handle({ request, body: buffer.toString("utf8"), buffer, contentType: String(response.headers["content-type"] ?? "") });
      } catch (error) {
        if (error instanceof NoRetryError) request.noRetry = true;
        throw error;
      }
    },
    failedRequestHandler: async ({ request }, error) => {
      onFailure(request, error.message.slice(0, 300));
    },
  }, config);
}
