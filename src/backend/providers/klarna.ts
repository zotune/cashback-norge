import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage, ProxyConfiguration } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
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
};

async function runKlarnaCrawl(
  input: CrawlKlarnaInput,
  proxyUrl?: string,
): Promise<CashbackOffer[]> {
  const rawOffers: CashbackOffer[] = [];

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const proxyConfiguration = proxyUrl
    ? new ProxyConfiguration({ proxyUrls: [proxyUrl] })
    : undefined;

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: input.maxPages,
    ...(proxyConfiguration ? { proxyConfiguration } : {}),
    requestHandler: async ({ $, request }) => {
      const pageOffers = parseKlarnaStoreListing(
        $,
        request.url,
        input.generatedAt,
      );
      rawOffers.push(...pageOffers);
    },
  }, config);

  const pageUrls = buildPageUrls(input.startUrl, input.maxPages);
  await crawler.run(pageUrls);
  return rawOffers;
}

export async function crawlKlarna(
  input: CrawlKlarnaInput,
): Promise<CashbackOffer[]> {
  let rawOffers = await runKlarnaCrawl(input);

  if (rawOffers.length === 0 && input.proxyUrl) {
    input.logger.info("Klarna: direct crawl returned 0 offers, retrying via proxy");
    rawOffers = await runKlarnaCrawl(input, input.proxyUrl);
  }

  input.logger.info(
    `Klarna listing pages yielded ${rawOffers.length} raw offers`,
  );

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

type KlarnaStore = {
  storeKrn: string;
  displayName: string;
  storeDirectUrl: string;
  cashbackDiscount: {
    discountLabel: {
      prefix: string;
      body: string;
      suffix: string;
    };
    showUpToPrefix: boolean;
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

  const offers: CashbackOffer[] = [];

  for (const store of stores) {
    const label = store.cashbackDiscount?.discountLabel;
    const body = label?.body ?? "";
    if (body === "") {
      continue;
    }
    const showUpTo = store.cashbackDiscount?.showUpToPrefix === true;
    // Fjern eventuelle mellomrom og % fra body for å unngå dobbel % og rare mellomrom
    const cleanBody = body.replace(/\s*%\s*$/, "");
    const reward = showUpTo ? `1-${cleanBody} %` : `${cleanBody} %`;

    const uuidMatch = store.storeKrn.match(/([a-f0-9-]{36})$/);
    const uuid = uuidMatch?.[1] ?? store.storeDirectUrl;
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
      terms: "Cashback i appen Klarna i kassen",
      updatedAt: generatedAt,
    });
  }

  return offers;
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
    const cashbackMatch = text.match(/(\d+(?:,\d+)?)\s*%\s*cashback/i);
    const reward = cashbackMatch?.[1] != null ? `${cashbackMatch[1]}%` : "";
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
