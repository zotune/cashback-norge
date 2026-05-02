import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  MemoryStorage,
} from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractPercentageReward } from "../../shared/reward.js";
import { type DomainLookup, lookupDomains } from "../domain-lookup.js";
import { isDomainLike, merchantDomainsFromUrl } from "../merchant-domains.js";
import type { Logger } from "../logger.js";

type KickbackCheerio = CheerioCrawlingContext["$"];

export type CrawlKickbackInput = {
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
  maxRequestsPerCrawl: number;
  startUrl: string;
};

type PendingKickbackOffer = {
  activationUrl?: string;
  discountCode: string;
  domains: string[];
  merchantName: string;
  partnerPageUrl: string;
  reward: string;
  sourceUrl: string;
  terms: string;
};

type FrontPageParseResult = {
  offers: PendingKickbackOffer[];
  visiblePromotionCount: number;
  skippedWithoutReusableCodeCount: number;
  skippedWithoutPartnerPageCount: number;
};

export async function crawlKickback(
  input: CrawlKickbackInput,
): Promise<CashbackOffer[]> {
  const pendingOffers: PendingKickbackOffer[] = [];
  const offersByPartnerPage = new Map<string, PendingKickbackOffer[]>();
  let visiblePromotionCount = 0;
  let skippedWithoutReusableCodeCount = 0;
  let skippedWithoutPartnerPageCount = 0;

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxRequestRetries: 0,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, enqueueLinks, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;

      if (request.label === "partner") {
        resolvePendingOffersFromPartnerPage(
          $,
          loadedUrl,
          offersByPartnerPage,
        );
        return;
      }

      const result = parseKickbackFrontPage(
        $,
        loadedUrl,
        input.domainLookup,
      );
      visiblePromotionCount += result.visiblePromotionCount;
      skippedWithoutReusableCodeCount += result.skippedWithoutReusableCodeCount;
      skippedWithoutPartnerPageCount += result.skippedWithoutPartnerPageCount;
      pendingOffers.push(...result.offers);

      const partnerUrls = uniqueStrings(
        result.offers.map((offer) => offer.partnerPageUrl),
      );

      for (const offer of result.offers) {
        const key = normalizePageKey(offer.partnerPageUrl);
        const existing = offersByPartnerPage.get(key) ?? [];
        offersByPartnerPage.set(key, [...existing, offer]);
      }

      if (partnerUrls.length > 0) {
        await enqueueLinks({
          label: "partner",
          urls: partnerUrls,
        });
      }
    },
    failedRequestHandler: async ({ request, error }) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      input.logger.warn(
        `Kickback: could not fetch ${request.url}: ${message}`,
      );
    },
  }, config);

  await crawler.run([input.startUrl]);

  const unresolvedMerchants: string[] = [];
  const offers = pendingOffers.flatMap((offer): CashbackOffer[] => {
    const domains = uniqueStrings(offer.domains);

    if (domains.length === 0) {
      unresolvedMerchants.push(offer.merchantName);
      return [];
    }

    return [
      {
        provider: "rabattkode",
        merchantName: offer.merchantName,
        domains,
        reward: offer.reward,
        sourceUrl: offer.sourceUrl,
        activationUrl: offer.activationUrl ?? offer.partnerPageUrl,
        discountCode: offer.discountCode,
        terms: offer.terms,
        updatedAt: input.generatedAt,
      },
    ];
  });

  if (unresolvedMerchants.length > 0) {
    input.logger.warn(
      `Kickback: skipped offers without merchant domain: ${uniqueStrings(unresolvedMerchants).join(", ")}`,
    );
  }

  input.logger.info(
    `Kickback: ${visiblePromotionCount} frontpage promotions, ${offers.length} usable codes, ${skippedWithoutReusableCodeCount} without reusable code, ${skippedWithoutPartnerPageCount} without partner page`,
  );

  return uniqueOffers(offers);
}

function parseKickbackFrontPage(
  $: KickbackCheerio,
  pageUrl: string,
  domainLookup: DomainLookup,
): FrontPageParseResult {
  const offers: PendingKickbackOffer[] = [];
  let visiblePromotionCount = 0;
  let skippedWithoutReusableCodeCount = 0;
  let skippedWithoutPartnerPageCount = 0;

  $("article.node--type-promotion").each((_index, element) => {
    const article = $(element);
    visiblePromotionCount += 1;

    if (!article.hasClass("voucher-code")) {
      skippedWithoutReusableCodeCount += 1;
      return;
    }

    const discountCode = normalizeWhitespace(article.attr("data-payload") ?? "");

    if (!isReusableDiscountCode(discountCode)) {
      skippedWithoutReusableCodeCount += 1;
      return;
    }

    const pageUrls = extractPartnerPageUrls(article, pageUrl);

    if (pageUrls === undefined) {
      skippedWithoutPartnerPageCount += 1;
      return;
    }

    const merchantName = extractMerchantName(article);
    const partnerSlugDomains = extractDomainLikeSlugDomains(pageUrls.partnerPageUrl);
    const domains = uniqueStrings([
      ...lookupDomains(domainLookup, merchantName),
      ...partnerSlugDomains,
    ]);
    const title = normalizeWhitespace(article.find(".node__title").first().text());

    offers.push({
      discountCode,
      domains,
      merchantName,
      partnerPageUrl: pageUrls.partnerPageUrl,
      reward: extractReward(title),
      sourceUrl: pageUrls.sourceUrl,
      terms: extractTerms(article, title),
    });
  });

  return {
    offers,
    visiblePromotionCount,
    skippedWithoutReusableCodeCount,
    skippedWithoutPartnerPageCount,
  };
}

function resolvePendingOffersFromPartnerPage(
  $: KickbackCheerio,
  pageUrl: string,
  offersByPartnerPage: Map<string, PendingKickbackOffer[]>,
): void {
  const pendingOffers = offersByPartnerPage.get(normalizePageKey(pageUrl));

  if (pendingOffers === undefined) {
    return;
  }

  const merchantUrls = extractExternalMerchantUrls($, pageUrl);
  const domains = uniqueStrings(merchantUrls.flatMap(merchantDomainsFromUrl));
  const activationUrl = merchantUrls[0];

  if (domains.length === 0) {
    return;
  }

  for (const offer of pendingOffers) {
    offer.domains = uniqueStrings([...offer.domains, ...domains]);

    if (activationUrl !== undefined) {
      offer.activationUrl = activationUrl;
    }
  }
}

function extractPartnerPageUrls(
  article: ReturnType<KickbackCheerio>,
  pageUrl: string,
): { partnerPageUrl: string; sourceUrl: string } | undefined {
  const rawHref =
    article.attr("data-href")?.trim() ??
    article.find(".field--name-field-partner a[href]").first().attr("href")?.trim() ??
    "";
  const sourceUrl = parseUrlWithBase(rawHref, pageUrl);

  if (sourceUrl === undefined) {
    return undefined;
  }

  const partnerPageUrl = new URL(sourceUrl.toString());
  partnerPageUrl.hash = "";

  return {
    partnerPageUrl: partnerPageUrl.toString(),
    sourceUrl: sourceUrl.toString(),
  };
}

function extractMerchantName(article: ReturnType<KickbackCheerio>): string {
  const dataName = normalizeWhitespace(article.attr("data-partner-name") ?? "");

  if (dataName.length > 0) {
    return dataName;
  }

  const partnerName = normalizeWhitespace(
    article.find(".field--name-field-partner a").first().text(),
  );

  if (partnerName.length > 0) {
    return partnerName;
  }

  return "Unknown Kickback merchant";
}

function extractDomainLikeSlugDomains(partnerPageUrl: string): string[] {
  const parsedUrl = parseUrlWithBase(partnerPageUrl, partnerPageUrl);
  const slug = parsedUrl?.pathname.split("/").filter(Boolean).at(-1) ?? "";

  if (!isDomainLike(slug)) {
    return [];
  }

  return merchantDomainsFromUrl(`https://${slug}`);
}

function extractExternalMerchantUrls(
  $: KickbackCheerio,
  pageUrl: string,
): string[] {
  const urls: string[] = [];

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href") ?? "";
    const parsedUrl = parseUrlWithBase(href, pageUrl);

    if (
      parsedUrl === undefined ||
      !isLikelyExternalMerchantUrl(parsedUrl, pageUrl)
    ) {
      return;
    }

    const value = parsedUrl.toString();

    if (!urls.includes(value)) {
      urls.push(value);
    }
  });

  return urls;
}

function isLikelyExternalMerchantUrl(url: URL, pageUrl: string): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const pageHostname = parseUrlWithBase(pageUrl, pageUrl)?.hostname ?? "";
  const normalizedPageDomain = normalizeDomainInput(pageHostname);
  const normalizedDomain = normalizeDomainInput(url.hostname);
  const blockedDomains = [
    "drupal.org",
    "google.com",
    "googletagmanager.com",
    "schema.org",
  ];

  if (
    normalizedDomain === normalizedPageDomain ||
    normalizedDomain.endsWith(`.${normalizedPageDomain}`)
  ) {
    return false;
  }

  if (
    blockedDomains.some((domain) => {
      return normalizedDomain === domain || normalizedDomain.endsWith(`.${domain}`);
    })
  ) {
    return false;
  }

  return !/\.(?:css|gif|ico|jpe?g|js|pdf|png|svg|webp)$/i.test(url.pathname);
}

function isReusableDiscountCode(code: string): boolean {
  if (code.length < 3 || /\s/.test(code) || code.includes("…")) {
    return false;
  }

  return !/^(?:uniquecodes?|unique|personlig)$/i.test(code);
}

function extractReward(title: string): string {
  const percentageReward = extractPercentageReward(title);

  if (percentageReward !== "") {
    return percentageReward;
  }

  const fixedMatch = title.match(/\d+(?:[,.]\d+)?\s*kr/i);

  if (fixedMatch !== null) {
    return fixedMatch[0].replace(/\s+/g, " ");
  }

  if (/gratis/i.test(title)) {
    return "Gratis";
  }

  return title;
}

function extractTerms(
  article: ReturnType<KickbackCheerio>,
  title: string,
): string {
  const validUntil = normalizeWhitespace(
    article.find(".field-to-formatted").first().text(),
  );
  const terms = normalizeWhitespace(article.find(".term-collapse .inner").first().text());

  return [title, validUntil, terms].filter(Boolean).join("\n");
}

function parseUrlWithBase(href: string, baseUrl: string): URL | undefined {
  try {
    return new URL(href, baseUrl);
  } catch {
    return undefined;
  }
}

function normalizePageKey(url: string): string {
  return url.replace(/\/$/, "");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
