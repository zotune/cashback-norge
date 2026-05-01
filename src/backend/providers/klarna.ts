import { resolve as dnsResolve } from "node:dns/promises";
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
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
};

export async function crawlKlarna(
  input: CrawlKlarnaInput,
): Promise<CashbackOffer[]> {
  const rawOffers: CashbackOffer[] = [];

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: input.maxPages,
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
  } | null;
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
    const reward = store.cashbackDiscount?.discountLabel.body ?? "";
    if (reward === "") {
      continue;
    }

    const uuidMatch = store.storeKrn.match(/([a-f0-9-]{36})$/);
    const uuid = uuidMatch?.[1] ?? store.storeDirectUrl;
    const activationUrl = buildActivationUrl(store.storeDirectUrl, pageUrl);

    const searchQuery = encodeURIComponent(store.displayName);

    offers.push({
      provider: "klarna",
      merchantName: store.displayName,
      domains: [],
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
  const resolved: CashbackOffer[] = [];

  // Resolve domains in parallel batches
  const batchSize = 20;
  for (let i = 0; i < offers.length; i += batchSize) {
    const batch = offers.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (offer) => {
        const slug = toSlug(offer.merchantName);
        const overrideDomains = overrides.klarna[slug] ?? [];

        const domains =
          overrideDomains.length > 0
            ? overrideDomains
            : await discoverDomains(offer.merchantName, logger);

        if (domains.length === 0) {
          logger.warn(
            `Klarna offer has no domains and could not resolve: ${offer.merchantName}`,
          );
        }

        return {
          ...offer,
          domains: uniqueStrings(domains.map(normalizeDomainInput)),
        };
      }),
    );
    resolved.push(...results);
  }

  return resolved;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9æøå.-]/g, "");
}

async function discoverDomains(
  merchantName: string,
  logger: Logger,
): Promise<string[]> {
  const candidates = buildDomainCandidates(merchantName);
  const resolved: string[] = [];

  for (const domain of candidates) {
    if (await canResolve(domain)) {
      resolved.push(domain);
      break;
    }
  }

  if (resolved.length === 0) {
    logger.warn(
      `Could not resolve domain for Klarna merchant: ${merchantName} (tried: ${candidates.join(", ")})`,
    );
  }

  return resolved;
}

function buildDomainCandidates(merchantName: string): string[] {
  const name = merchantName.toLowerCase().trim();
  const candidates: string[] = [];

  // If name already looks like a domain (contains a dot and a TLD), use it directly
  if (/\.[a-z]{2,}$/i.test(name)) {
    candidates.push(name);
    if (!name.startsWith("www.")) {
      candidates.push(`www.${name}`);
    }
    return candidates;
  }

  // Build candidates from the merchant name
  const slug = name
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9æøå-]/g, "");

  if (slug.length === 0) {
    return candidates;
  }

  // Try .no first (Norwegian market), then .com, then .se
  candidates.push(
    `${slug}.no`,
    `www.${slug}.no`,
    `${slug}.com`,
    `www.${slug}.com`,
    `${slug}.se`,
  );

  // If slug contains hyphens, try without them
  if (slug.includes("-")) {
    const noHyphens = slug.replace(/-/g, "");
    candidates.push(`${noHyphens}.no`, `${noHyphens}.com`);
  }

  return candidates;
}

async function canResolve(domain: string): Promise<boolean> {
  try {
    await dnsResolve(domain);
    return true;
  } catch {
    return false;
  }
}
