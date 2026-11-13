// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage, ProxyConfiguration } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { formatPercentageReward, formatRewardNumber, normalizeRewardLabel } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type KlarnaCheerio = CheerioCrawlingContext["$"];

export type CrawlKlarnaInput = {
  startUrl: string;
  maxPages: number;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
  proxyUrl?: string;
  proxyUrls?: string[];
};

async function runKlarnaCrawl(
  input: CrawlKlarnaInput,
  label: string,
  proxyUrl?: string,
): Promise<CashbackOffer[]> {
  const rawOffers: CashbackOffer[] = [];
  const pageResults: string[] = [];

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const proxyConfiguration = proxyUrl
    ? new ProxyConfiguration({ proxyUrls: [proxyUrl] })
    : undefined;

  const crawler = new CheerioCrawler({
    // Klarna often returns a 403 block page to direct requests. Let the handler
    // parse it as an empty page so the caller can move on to proxy/app fallbacks.
    useSessionPool: false,
    maxRequestsPerCrawl: input.maxPages,
    ...(proxyConfiguration ? { proxyConfiguration } : {}),
    requestHandler: async ({ $, request, response }) => {
      const pageOffers = parseKlarnaStoreListing(
        $,
        request.url,
        input.generatedAt,
      );
      rawOffers.push(...pageOffers);
      pageResults.push(describeKlarnaPage(request.url, response.statusCode, pageOffers.length, $));
    },
    failedRequestHandler: async ({ request }, error) => {
      pageResults.push(`${pageNumber(request.url)}: failed (${error.message})`);
    },
  }, config);

  const pageUrls = buildPageUrls(input.startUrl, input.maxPages);
  await crawler.run(pageUrls);

  if (rawOffers.length === 0) {
    // A block page, exhausted proxy credits or a changed page format all end
    // as zero stores; log what each page actually returned so they differ.
    input.logger.warn(`Klarna ${label}: 0 offers; ${pageResults.join("; ") || "no pages handled"}`);
  }

  return rawOffers;
}

function pageNumber(url: string): string {
  return `page ${new URL(url).searchParams.get("page") ?? "?"}`;
}

function describeKlarnaPage(
  url: string,
  statusCode: number | undefined,
  offerCount: number,
  $: KlarnaCheerio,
): string {
  const title = $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 80);
  const hasStoreState = $("script").toArray().some((el) => ($(el).html() ?? "").includes("storeDirectUrl"));
  return `${pageNumber(url)}: HTTP ${statusCode ?? "?"}, ${offerCount} offers, store data ${hasStoreState ? "present" : "missing"}${title ? `, title «${title}»` : ""}`;
}

export async function crawlKlarna(
  input: CrawlKlarnaInput,
): Promise<CashbackOffer[]> {
  let rawOffers = await runKlarnaCrawl(input, "direct");
  const proxyUrls = [
    ...(input.proxyUrls ?? []),
    ...(input.proxyUrl ? [input.proxyUrl] : []),
  ];

  if (rawOffers.length === 0 && proxyUrls.length > 0) {
    input.logger.info("Klarna: direct crawl returned 0 offers, retrying via proxy");
    for (const [index, proxyUrl] of proxyUrls.entries()) {
      try {
        rawOffers = await runKlarnaCrawl(input, `proxy ${index + 1}/${proxyUrls.length}`, proxyUrl);
      } catch (error) {
        input.logger.warn(`Klarna proxy ${index + 1}/${proxyUrls.length} failed: ${error}`);
        rawOffers = [];
      }

      if (rawOffers.length > 0) {
        input.logger.info(`Klarna proxy ${index + 1}/${proxyUrls.length} returned ${rawOffers.length} offers`);
        break;
      }
    }
  }

  input.logger.info(
    `Klarna listing pages yielded ${rawOffers.length} raw offers`,
  );

  // The public app API (deals_directory_bff getCashbackLandingPage) is not
  // used: on 2026-11-13 it listed only stores that the web listing also has
  // (same storeKrn), and for 53 of 72 it reported about twice the rate shown
  // on klarna.com and on the store's own page (AGV 7 % vs 3.5 %), matching
  // Klarna's membership multiplier rather than the public base rate.
  const offers = uniqueOffers(rawOffers);

  const resolved = await resolveDomainsForOffers(
    offers,
    input.overrides,
    input.logger,
  );

  input.logger.info(`Found ${resolved.length} Klarna cashback offers`);
  return resolved;
}

function buildPageUrls(startUrl: string, maxPages: number): string[] {
  const urls: string[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const separator = startUrl.includes("?") ? "&" : "?";
    urls.push(`${startUrl}${separator}page=${page}`);
  }
  return urls;
}

type KlarnaCashbackRate = { value?: unknown; type?: unknown; name?: unknown };

export type KlarnaStore = {
  storeKrn: string;
  displayName: string;
  storeDirectUrl: string;
  cashbackDiscount: {
    // Basis points: 350 = 3.5 %.
    discountPercentage?: number;
    discountLabel: {
      prefix: string;
      body: string;
      suffix: string;
    };
    showUpToPrefix: boolean;
    endedAt?: string | null;
    conditions?: {
      cashbackRates?: KlarnaCashbackRate[];
      exclusionsStructured?: unknown[];
    };
  } | null;
  otcUrl: string | null;
};

function parseKlarnaStoreListing(
  $: KlarnaCheerio,
  pageUrl: string,
  generatedAt: string,
): CashbackOffer[] {
  const stores = extractStoresFromJson($);
  if (stores.length === 0) {
    return parseKlarnaStoreListingFromHtml($, pageUrl, generatedAt);
  }
  return parseKlarnaStores(stores, pageUrl, generatedAt);
}

const KLARNA_BASE_TERMS = "Cashback i appen Klarna i kassen";

/** Translates the store directory's dehydrated store objects into offers. */
export function parseKlarnaStores(
  stores: KlarnaStore[],
  pageUrl: string,
  generatedAt: string,
): CashbackOffer[] {
  const offers: CashbackOffer[] = [];

  for (const store of stores) {
    const discount = store.cashbackDiscount;
    const reward = readKlarnaReward(discount);
    if (reward === "") {
      continue;
    }

    const activationUrl = buildActivationUrl(store.storeDirectUrl, pageUrl);
    const merchantDomain = extractMerchantDomain(store);
    const searchQuery = encodeURIComponent(store.displayName);

    offers.push({
      provider: "klarna",
      merchantName: store.displayName,
      domains: merchantDomain !== undefined ? [merchantDomain] : [],
      reward,
      sourceUrl: `https://www.klarna.com/no/store/?type=CASHBACK&search=${searchQuery}`,
      activationUrl,
      terms: buildKlarnaTerms(discount),
      updatedAt: generatedAt,
    });
  }

  return offers;
}

function readKlarnaRates(discount: KlarnaStore["cashbackDiscount"]): Array<{ name: string; percent: number }> {
  return (discount?.conditions?.cashbackRates ?? []).flatMap((rate) => {
    if (rate.type !== "percentage" || typeof rate.value !== "number" || !Number.isFinite(rate.value) || rate.value <= 0) return [];
    return [{ name: typeof rate.name === "string" ? rate.name.trim() : "", percent: rate.value / 100 }];
  });
}

function readKlarnaReward(discount: KlarnaStore["cashbackDiscount"]): string {
  if (discount === null || discount === undefined) return "";
  const headline = typeof discount.discountPercentage === "number" && Number.isFinite(discount.discountPercentage) && discount.discountPercentage > 0
    ? discount.discountPercentage / 100
    : Number.parseFloat((discount.discountLabel?.body ?? "").replace(",", ".").replace(/\s*%\s*$/, ""));
  if (!Number.isFinite(headline) || headline <= 0) return "";
  if (discount.showUpToPrefix !== true) return `${formatRewardNumber(headline)} %`;

  // "Opp til N %" is the best of the store's rate table (new customer,
  // full-price items, a category...). Show that table's real range; without
  // one, keep the up-to qualifier instead of inventing a minimum.
  const rates = readKlarnaRates(discount).map((rate) => rate.percent).filter((percent) => percent <= headline);
  return rates.length > 1 && Math.min(...rates) < headline
    ? formatPercentageReward([...rates, headline])
    : `opptil ${formatRewardNumber(headline)} %`;
}

function buildKlarnaTerms(discount: KlarnaStore["cashbackDiscount"]): string {
  const parts = [KLARNA_BASE_TERMS];
  const rates = readKlarnaRates(discount).filter((rate) => rate.name !== "" && !/^default$/i.test(rate.name));
  if (rates.length > 1) {
    parts.push(`Satser: ${rates.map((rate) => `${rate.name} ${formatRewardNumber(rate.percent)} %`).join("; ")}`);
  }
  const exclusions = (discount?.conditions?.exclusionsStructured ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  if (exclusions.length > 0) {
    parts.push(`Gjelder ikke: ${exclusions.join(", ")}`);
  }
  const endedAt = typeof discount?.endedAt === "string" ? new Date(discount.endedAt) : undefined;
  if (endedAt !== undefined && Number.isFinite(endedAt.getTime())) {
    parts.push(`Kampanjesats til ${endedAt.toLocaleDateString("nb-NO", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Oslo" })}`);
  }
  return parts.join(". ");
}

function extractStoresFromJson($: KlarnaCheerio): KlarnaStore[] {
  const scripts = $("script")
    .toArray()
    .map((el) => $(el).html() ?? "");

  for (const script of scripts) {
    if (!script.includes("storeDirectUrl")) {
      continue;
    }
    try {
      const jsonStart = script.indexOf("{");
      if (jsonStart < 0) continue;
      const data = JSON.parse(script.slice(jsonStart));
      const queries =
        data?.__DEHYDRATED_QUERY_STATE__?.queries as
          | Array<{ state?: { data?: { pages?: Array<{ stores?: KlarnaStore[] }> } } }>
          | undefined;
      if (!queries) continue;
      for (const q of queries) {
        const pages = q.state?.data?.pages;
        if (!pages) continue;
        for (const page of pages) {
          if (page.stores && page.stores.length > 0) {
            return page.stores;
          }
        }
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return [];
}

/** Fallback: parse stores from HTML links when JSON is not available */
function parseKlarnaStoreListingFromHtml(
  $: KlarnaCheerio,
  pageUrl: string,
  generatedAt: string,
): CashbackOffer[] {
  const offers: CashbackOffer[] = [];

  $("a[href*='gotostore']").each((_i, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const uuidMatch = href.match(/store\/([a-f0-9-]{36})/);

    if (uuidMatch === null) {
      return;
    }

    const uuid = uuidMatch[1];
    const text = $el.text().trim();
    const cashbackMatch = text.match(/(\d+(?:[,.]\d+)?)\s*%\s*cashback/i);
    const upTo = /opp\s*til|opptil/i.test(text);
    const reward = cashbackMatch?.[1] != null
      ? normalizeRewardLabel(`${upTo ? "opptil " : ""}${cashbackMatch[1]}%`)
      : "";
    const nameFromAlt = $el.find("img[alt]").first().attr("alt")?.replace(/\s*Logo$/i, "").trim() ?? "";
    const nameFromText = extractStoreNameFromText(text);
    const merchantName = nameFromAlt || nameFromText || "Unknown Klarna merchant";
    const activationUrl = buildActivationUrl(href, pageUrl);

    if (reward === "") {
      return;
    }

    const searchQuery = encodeURIComponent(merchantName);

    offers.push({
      provider: "klarna",
      merchantName,
      domains: [],
      reward,
      sourceUrl: `https://www.klarna.com/no/store/?type=CASHBACK&search=${searchQuery}`,
      activationUrl,
      terms: "Cashback i appen Klarna i kassen",
      updatedAt: generatedAt,
    });
  });

  return offers;
}

function extractStoreNameFromText(text: string): string {
  return text
    .replace(/Logo.*$/i, "")
    .replace(/([\d,]+)%.*$/i, "")
    .trim();
}

function buildActivationUrl(href: string, pageUrl: string): string {
  if (href.startsWith("http")) {
    return href;
  }
  const base = new URL(pageUrl);
  return new URL(href, base.origin).toString();
}

async function resolveDomainsForOffers(
  offers: CashbackOffer[],
  overrides: ProviderOverrides,
  logger: Logger,
): Promise<CashbackOffer[]> {
  return offers.map((offer) => {
    const slug = toSlug(offer.merchantName);
    const overrideDomains = overrides.klarna[slug] ?? [];

    // Use override if available, otherwise keep the domain already extracted from otcUrl
    const domains =
      overrideDomains.length > 0
        ? overrideDomains
        : offer.domains;

    if (domains.length === 0) {
      logger.warn(
        `Klarna offer has no domains: ${offer.merchantName} (slug: ${slug})`,
      );
    }

    const resolvedDomains = uniqueStrings(domains.map(normalizeDomainInput));

    return {
      ...offer,
      domains: resolvedDomains,
    };
  });
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9æøå.-]/g, "");
}

function extractMerchantDomain(store: KlarnaStore): string | undefined {
  const otcUrl = store.otcUrl ?? "";
  const match = otcUrl.match(/merchantUrl=([^&]+)/);
  if (match?.[1] !== undefined && match[1].length > 0) {
    return match[1];
  }
  return undefined;
}
