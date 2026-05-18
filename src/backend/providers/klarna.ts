// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
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
  proxyUrls?: string[];
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
  const proxyUrls = [
    ...(input.proxyUrls ?? []),
    ...(input.proxyUrl ? [input.proxyUrl] : []),
  ];

  if (rawOffers.length === 0 && proxyUrls.length > 0) {
    input.logger.info("Klarna: direct crawl returned 0 offers, retrying via proxy");
    for (const [index, proxyUrl] of proxyUrls.entries()) {
      try {
        rawOffers = await runKlarnaCrawl(input, proxyUrl);
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

  // Supplement with app API data (public, no auth required)
  const appOffers = await fetchKlarnaAppOffers(input.generatedAt, input.logger);
  const webMerchants = new Set(rawOffers.map((o) => o.merchantName.toLowerCase()));
  let appOnlyCount = 0;
  for (const appOffer of appOffers) {
    if (!webMerchants.has(appOffer.merchantName.toLowerCase())) {
      rawOffers.push(appOffer);
      appOnlyCount++;
    }
  }
  if (appOnlyCount > 0) {
    input.logger.info(`Klarna app API added ${appOnlyCount} offers not found on web`);
  }

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

// --- Klarna App API (public GraphQL, no auth) ---

type KlarnaAppDeal = {
  merchantName: string;
  cashbackAmount: number;
  oldCashbackAmount: number | null;
  dealUrl: string;
  isUpTo: boolean;
  storeKrn: string;
  endedAt: string | null;
};

type KlarnaAppSection = {
  title: string;
  deals: KlarnaAppDeal[];
};

type KlarnaAppResponse = {
  data: {
    cashbackLandingPage: {
      sections: KlarnaAppSection[];
    };
  };
};

const KLARNA_APP_GRAPHQL_URL =
  "https://app-api.klarna.com/api/deals_directory_bff/public/graphql";

const KLARNA_APP_QUERY = `query getCashbackLandingPage($market: Market!) {
  cashbackLandingPage: getCashbackLandingPage(market: $market) {
    sections {
      deals {
        merchantName
        cashbackAmount
        oldCashbackAmount
        dealUrl
        isUpTo
        storeKrn
        endedAt
      }
    }
  }
}`;

async function fetchKlarnaAppOffers(
  generatedAt: string,
  logger: Logger,
): Promise<CashbackOffer[]> {
  try {
    const res = await fetch(KLARNA_APP_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "getCashbackLandingPage",
        query: KLARNA_APP_QUERY,
        variables: { market: "NO" },
      }),
    });

    if (!res.ok) {
      logger.warn(`Klarna app API returned ${res.status}`);
      return [];
    }

    const json = (await res.json()) as KlarnaAppResponse;
    const sections = json.data?.cashbackLandingPage?.sections;
    if (!sections) {
      logger.warn("Klarna app API returned no sections");
      return [];
    }

    const seen = new Set<string>();
    const offers: CashbackOffer[] = [];

    for (const section of sections) {
      for (const deal of section.deals) {
        const key = deal.merchantName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const pct = deal.cashbackAmount / 100;
        const pctStr = Number.isInteger(pct) ? `${pct}` : `${pct}`.replace(".", ",");
        const reward = deal.isUpTo ? `1-${pctStr} %` : `${pctStr} %`;

        let domain: string | undefined;
        try {
          const url = new URL(deal.dealUrl);
          domain = url.hostname.replace(/^www\./, "");
        } catch {
          // skip
        }

        const searchQuery = encodeURIComponent(deal.merchantName);
        offers.push({
          provider: "klarna",
          merchantName: deal.merchantName,
          domains: domain ? [domain] : [],
          reward,
          sourceUrl: `https://www.klarna.com/no/store/?type=CASHBACK&search=${searchQuery}`,
          activationUrl: deal.dealUrl,
          terms: "Cashback i appen Klarna i kassen",
          updatedAt: generatedAt,
        });
      }
    }

    logger.info(`Klarna app API yielded ${offers.length} unique offers`);
    return offers;
  } catch (err) {
    logger.warn(`Klarna app API failed: ${err}`);
    return [];
  }
}
