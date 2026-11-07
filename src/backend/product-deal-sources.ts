// Order: each source's own popularity ranking, as on its deal page — Klarna's sale page
// (GLOBALRANK_ASC), Godpris "Mest populære" (?s=popularity) and Prisradar's default
// "Populær" sort; Prisjakt's comes from prisjakt-deals.ts.
// Structured APIs first. Godpris' current list has no verified list API, so
// only its own product-card links/discounts use Cheerio; prices always come
// from named Product JSON-LD and concrete in-stock offers. Prisradar list links
// are a bounded DOM fallback; the detail uses its product-bound Next component.
import { CheerioCrawler, Configuration, MemoryStorage, Request, type CheerioCrawlingContext } from "crawlee";
import { isRecord } from "../shared/cashback.js";
import { readKlarnaDealCandidates, readKlarnaDeal, klarnaOffersUrl, KLARNA_DEALS_API, type KlarnaDealCandidate } from "../shared/klarna-deals.js";
import { readGodprisProductPage } from "../shared/godpris-price-match.js";
import { readPrisradarProductPage } from "../shared/prisradar-price-match.js";
import { readComparisonProductLdJson, readLdJsonScripts, readNextProductData, readStructuredProductCodes, findTypedLdJson } from "../shared/product-data.js";
import { readPriceAmount } from "../shared/price.js";
import { isValidGtin } from "../shared/product-match.js";
import type { DealSource, ProductDeal } from "../shared/product-deals.js";
import { godprisHistoryUrl, klarnaPriceHistoryUrl, prisradarHistoryRequest, readGodprisHistorySection, readKlarnaPriceHistory, readPrisradarPriceHistory } from "../shared/deal-price-history.js";
import type { Logger } from "./logger.js";

export const SOURCE_LIST_URLS = { klarna: KLARNA_DEALS_API, godpris: "https://godpris.no/tilbud?s=popularity", prisradar: "https://prisradar.no/beste-tilbud" };
type Source = Exclude<DealSource, "prisjakt">;
type Candidate = { id: string; name: string; productUrl: string; sourceRank: number; advertisedPrice?: number; priceDrop?: number };
export type SourceInput = { source: Source; generatedAt: string; logger: Logger; maxProducts?: number; maxPages?: number; requestUrl?: (url: string) => string; timeoutSecs?: number };

export async function fetchProductDealSource(input: SourceInput): Promise<ProductDeal[]> {
  // Prisradar lists ~40 offers per page (three pages read); Godpris shows 48 on one page.
  const maxProducts = Math.max(1, Math.min(150, Number.isFinite(input.maxProducts) ? Math.trunc(input.maxProducts!) : input.source === "klarna" ? 150 : 100));
  const pages = Math.max(1, Math.min(3, Number.isFinite(input.maxPages) ? Math.trunc(input.maxPages!) : 3));
  const candidates = new Set<string>();
  const deals: ProductDeal[] = [];
  let listed = 0, failures = 0, listingFailed = false, rankOffset = 0;
  const configuration = new Configuration();
  configuration.useStorageClient(new MemoryStorage({ persistStorage: false }));
  const crawler = new CheerioCrawler({
    // Klarna answered 429 to a quick run of offers plus histories; keep a steady pace.
    maxConcurrency: 1, maxRequestRetries: 2, maxRequestsPerCrawl: maxProducts * 2 + pages, maxRequestsPerMinute: input.source === "klarna" ? 90 : 150,
    navigationTimeoutSecs: input.timeoutSecs ?? 30, requestHandlerTimeoutSecs: 30,
    useSessionPool: false, ignoreSslErrors: false, additionalMimeTypes: ["application/json", "application/octet-stream"],
    async requestHandler({ request, body, response, $ }) {
      const html = String(body);
      const status = response.statusCode ?? 0;
      if (status !== 200) { if (status < 500 && status !== 429) request.noRetry = true; throw new Error(`HTTP ${status}`); }
      if (request.userData.kind === "history") {
        // A missing or unreadable history leaves the verified deal without a lowest price.
        const deal = deals[request.userData.index as number]!;
        let history;
        try {
          history = input.source === "klarna" ? readKlarnaPriceHistory(JSON.parse(html), request.userData.productId as string)
            : input.source === "godpris" ? readGodprisHistorySection(html) : readPrisradarPriceHistory(JSON.parse(html));
        } catch { history = undefined; }
        if (history) Object.assign(deal, { ...history, lowestPriceEver: Math.min(deal.price, history.lowestPriceEver) });
        return;
      }
      if (request.userData.kind === "detail") {
        const candidate = request.userData.candidate as Candidate;
        const deal = input.source === "klarna" ? readKlarnaDeal(candidate as KlarnaDealCandidate, JSON.parse(html), input.generatedAt)
          : readOtherDealPage(input.source, html, candidate, input.generatedAt);
        if (deal) {
          deals.push(deal);
          const history = historyRequest(deal, candidate.id, deals.length - 1);
          if (history) await crawler.addRequests([history]);
        }
        return;
      }
      listed++;
      const offset = Number(request.userData.offset ?? 0);
      // Ranks continue across pages (Klarna's come with the offset already).
      const rows = input.source === "klarna" ? readKlarnaDealCandidates(JSON.parse(html), offset)
        : readListCandidates(input.source, $).map((row) => ({ ...row, sourceRank: row.sourceRank + rankOffset }));
      if (input.source !== "klarna") rankOffset += rows.length;
      if (!rows.length) { request.noRetry = true; throw new Error(`${input.source}: no deal candidates (format changed?)`); }
      let added = 0;
      for (const candidate of rows) {
        if (candidates.size >= maxProducts) break;
        if (candidates.has(candidate.id)) continue;
        candidates.add(candidate.id);
        added++;
        const url = input.source === "klarna" ? klarnaOffersUrl(candidate.id) : candidate.productUrl;
        await crawler.addRequests([new Request({ url: input.requestUrl?.(url) ?? url, uniqueKey: `${input.source}:${candidate.id}`, userData: { kind: "detail", candidate } })]);
      }
      if (input.source === "klarna" && offset / 50 + 1 < pages && candidates.size < maxProducts) await crawler.addRequests([listingRequest(offset + 50)]);
      // Godpris ignores ?page and repeats its 48 offers; a page without new products ends the list.
      if (input.source !== "klarna" && added > 0 && offset + 1 < pages && candidates.size < maxProducts) await crawler.addRequests([listingRequest(offset + 1)]);
    },
    async failedRequestHandler({ request }, error) {
      failures++;
      if (request.userData.kind === "list") listingFailed = true;
      input.logger.warn(`${input.source} deals: ${request.url} (${error.message.slice(0, 250)})`);
    },
  }, configuration);
  function historyRequest(deal: ProductDeal, candidateId: string, index: number): Request | undefined {
    const userData = { kind: "history", index, productId: candidateId };
    if (input.source === "klarna") return new Request({ url: input.requestUrl?.(klarnaPriceHistoryUrl(candidateId)) ?? klarnaPriceHistoryUrl(candidateId), uniqueKey: `history:klarna:${candidateId}`, headers: { Accept: "application/json" }, userData });
    if (input.source === "godpris") { const url = godprisHistoryUrl(candidateId, deal.price, deal.store); return new Request({ url: input.requestUrl?.(url) ?? url, uniqueKey: `history:godpris:${candidateId}`, userData }); }
    const graphql = prisradarHistoryRequest(deal.productUrl);
    return graphql ? new Request({ url: input.requestUrl?.(graphql.url) ?? graphql.url, method: "POST", payload: graphql.body, headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://prisradar.no" }, uniqueKey: `history:prisradar:${candidateId}`, userData }) : undefined;
  }
  function listingRequest(offset = 0): Request {
    const url = new URL(SOURCE_LIST_URLS[input.source]);
    // Prisradar pages with ?page=2, 3 …; `offset` is the zero-based page there.
    if (input.source !== "klarna" && offset > 0) url.searchParams.set("page", String(offset + 1));
    if (input.source === "klarna") { url.searchParams.set("sorting", "GLOBALRANK_ASC"); url.searchParams.set("af_PRICE_DROP", "-90_-10"); url.searchParams.set("size", "50"); url.searchParams.set("offset", String(offset)); }
    return new Request({ url: input.requestUrl?.(url.href) ?? url.href, userData: { kind: "list", offset }, uniqueKey: `list:${input.source}:${offset}` });
  }
  await crawler.run([listingRequest()]);
  if (!listed || listingFailed || !deals.length) throw new Error(`${input.source} deals: ${listed} listing pages, ${candidates.size} candidates, ${deals.length} verified deals, ${failures} failed requests`);
  input.logger.info(`${input.source} deals: ${deals.length}/${candidates.size} verified in-stock offers (${failures} failed requests)`);
  return deals.sort((a, b) => a.sourceRank - b.sourceRank);
}

function readListCandidates(source: "godpris" | "prisradar", $: CheerioCrawlingContext["$"]): Candidate[] {
  const result = new Map<string, Candidate>();
  const selector = source === "godpris" ? ".search-item-wrapper" : "a[href^='/produkter/']";
  $(selector).each((_index, element) => {
    const item = $(element);
    const anchor = source === "godpris" ? item.find("h3 a[href]").first() : item;
    const href = anchor.attr("href");
    if (!href) return;
    const url = new URL(href, SOURCE_LIST_URLS[source]);
    if (url.origin !== new URL(SOURCE_LIST_URLS[source]).origin) return;
    const id = url.pathname.split("/")[2];
    if (!id || result.has(id)) return;
    const name = (source === "godpris" ? anchor.attr("title") : anchor.text())?.trim();
    if (!name) return;
    const advertisedPrice = source === "godpris" ? readPriceAmount(item.find("[data-price]").attr("data-price")) : undefined;
    const priceDrop = source === "godpris" ? readPriceAmount(item.find(".app-offer-badge [aria-hidden]").text().replace("%", "")) : undefined;
    result.set(id, { id, name, productUrl: url.href, sourceRank: result.size + 1,
      ...(advertisedPrice !== undefined ? { advertisedPrice } : {}), ...(priceDrop !== undefined ? { priceDrop } : {}) });
  });
  return [...result.values()];
}

export function readOtherDealPage(source: "godpris" | "prisradar", html: string, candidate: Candidate, updatedAt: string): ProductDeal | undefined {
  const structured = readComparisonProductLdJson(html, candidate.productUrl);
  if (!structured) return undefined;
  const codes = readStructuredProductCodes(structured).filter(isValidGtin);
  const brand = isRecord(structured.brand) ? structured.brand.name : structured.brand;
  const shared = { id: candidate.id, source, sourceRank: candidate.sourceRank, updatedAt, productUrl: candidate.productUrl, currency: "NOK" as const,
    ...(typeof brand === "string" ? { brand } : {}), ...(codes.length ? { codes } : {}) };
  if (source === "godpris") {
    const offer = readGodprisProductPage(html, candidate.id, { searchTerm: candidate.name }, true);
    // Its advertised discount only applies when that exact price is buyable.
    if (!offer || offer.amount !== candidate.advertisedPrice || !(candidate.priceDrop! > 0 && candidate.priceDrop! < 100)) return undefined;
    const breadcrumb = findTypedLdJson(readLdJsonScripts(html), "BreadcrumbList");
    const categories = Array.isArray(breadcrumb?.itemListElement) ? breadcrumb.itemListElement.filter(isRecord).map(item => item.name).filter((name): name is string => typeof name === "string") : [];
    const image = Array.isArray(structured.image) ? structured.image[0] : structured.image;
    return { ...shared, name: offer.productName, store: offer.shopName, price: offer.amount, priceDrop: candidate.priceDrop!, referenceLabel: "Godpris' oppgitte prisfall", storeCount: offer.alternatives?.length ?? 1,
      ...(categories.length ? { category: categories.at(-1)! } : {}), ...(typeof image === "string" ? { imageUrl: image } : {}), ...(offer.offerUrl ? { offerUrl: offer.offerUrl } : {}) };
  }
  const product = readNextProductData(html, candidate.productUrl);
  const schemaOffer = isRecord(structured.offers) ? structured.offers : undefined;
  if (!product || schemaOffer?.priceCurrency !== "NOK" || !/NewCondition$/.test(String(schemaOffer.itemCondition))) return undefined;
  const offer = readPrisradarProductPage(html, candidate.productUrl, true);
  const referencePrice = isRecord(product.discount) ? readPriceAmount(product.discount.oldPrice) : undefined;
  if (!offer || !referencePrice || offer.amount >= referencePrice) return undefined;
  const images = Array.isArray(product.images) ? product.images.filter(isRecord) : [];
  const image = images.find(image => image.isMain === true) ?? images[0];
  const imageUrl = image && isRecord(image.medium) ? image.medium.path : undefined;
  const category = isRecord(product.category) ? product.category.title : undefined;
  const alternative = offer.alternatives?.find(item => item.shopName === offer.shopName && item.amount === offer.amount);
  return { ...shared, ...(typeof product.id === "number" ? { id: String(product.id) } : {}), name: offer.productName, store: offer.shopName, price: offer.amount, referencePrice, referenceLabel: "Prisradars sammenligningspris før prisfallet",
    priceDrop: Math.round((referencePrice - offer.amount) / referencePrice * 100), storeCount: offer.alternatives?.length ?? 1,
    ...(alternative?.sortAmount !== undefined ? { shippingAmount: alternative.sortAmount - offer.amount } : {}),
    ...(typeof imageUrl === "string" ? { imageUrl } : {}), ...(typeof category === "string" ? { category } : {}) };
}
