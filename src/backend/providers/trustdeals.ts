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
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import {
  merchantDomainsFromHostname,
} from "../merchant-domains.js";
import type { Logger } from "../logger.js";

type TrustdealsCheerio = CheerioCrawlingContext["$"];

export type CrawlTrustdealsInput = {
  generatedAt: string;
  logger: Logger;
  startUrl: string;
};

export async function crawlTrustdeals(
  input: CrawlTrustdealsInput,
): Promise<CashbackOffer[]> {
  const offers: CashbackOffer[] = [];
  let visibleCouponCount = 0;
  let skippedInternalCodeCount = 0;
  let skippedWithoutDomainCount = 0;
  let skippedWithoutReusableCodeCount = 0;

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxRequestRetries: 0,
    maxRequestsPerCrawl: 1,
    requestHandler: async ({ $, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      const result = parseTrustdealsPage($, loadedUrl, input.generatedAt);

      offers.push(...result.offers);
      visibleCouponCount += result.visibleCouponCount;
      skippedInternalCodeCount += result.skippedInternalCodeCount;
      skippedWithoutDomainCount += result.skippedWithoutDomainCount;
      skippedWithoutReusableCodeCount += result.skippedWithoutReusableCodeCount;
    },
    failedRequestHandler: async ({ request, error }) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      input.logger.warn(
        `TrustDeals: could not fetch ${request.url}: ${message}`,
      );
    },
  }, config);

  await crawler.run([input.startUrl]);

  input.logger.info(
    `TrustDeals: ${visibleCouponCount} frontpage coupons, ${offers.length} usable codes, ${skippedInternalCodeCount} internal-looking codes, ${skippedWithoutReusableCodeCount} without reusable code, ${skippedWithoutDomainCount} without domain`,
  );

  return uniqueOffers(offers);
}

type ParseResult = {
  offers: CashbackOffer[];
  visibleCouponCount: number;
  skippedInternalCodeCount: number;
  skippedWithoutDomainCount: number;
  skippedWithoutReusableCodeCount: number;
};

function parseTrustdealsPage(
  $: TrustdealsCheerio,
  pageUrl: string,
  generatedAt: string,
): ParseResult {
  const offers: CashbackOffer[] = [];
  let visibleCouponCount = 0;
  let skippedInternalCodeCount = 0;
  let skippedWithoutDomainCount = 0;
  let skippedWithoutReusableCodeCount = 0;

  $("article.coupon").each((_index, element) => {
    const article = $(element);
    visibleCouponCount += 1;

    if (article.hasClass("uq")) {
      skippedWithoutReusableCodeCount += 1;
      return;
    }

    const discountCode = normalizeWhitespace(
      article.find(".snippet .code").first().text(),
    );
    const offerId = article.attr("data-offer")?.trim() ?? "";

    if (!isReusableDiscountCode(discountCode)) {
      skippedWithoutReusableCodeCount += 1;
      return;
    }

    if (isLikelyInternalTrustdealsCode(discountCode, offerId)) {
      skippedInternalCodeCount += 1;
      return;
    }

    const rawSlug = article.attr("data-slug")?.trim() ?? "";
    const domains = merchantDomainsFromHostname(rawSlug);

    if (domains.length === 0) {
      skippedWithoutDomainCount += 1;
      return;
    }

    const storeDomain = normalizeDomainInput(rawSlug);
    const title = normalizeWhitespace(article.find("h3").first().text());
    const sourceUrl =
      buildUrl(
        `/view/${storeDomain}${offerId.length > 0 ? `#td-offer${offerId}` : ""}`,
        pageUrl,
      ) ?? pageUrl;

    offers.push({
      provider: "rabattkode",
      merchantName: extractMerchantName(article, storeDomain),
      domains,
      reward: extractReward(title),
      sourceUrl,
      activationUrl: `https://${storeDomain}`,
      discountCode,
      terms: title,
      updatedAt: generatedAt,
    });
  });

  return {
    offers,
    visibleCouponCount,
    skippedInternalCodeCount,
    skippedWithoutDomainCount,
    skippedWithoutReusableCodeCount,
  };
}

function isReusableDiscountCode(code: string): boolean {
  if (code.length < 3 || /\s/.test(code) || code.includes("…")) {
    return false;
  }

  return !/^(?:uniquecodes?|unique|personlig)$/i.test(code);
}

function isLikelyInternalTrustdealsCode(
  code: string,
  offerId: string,
): boolean {
  if (offerId.length === 0) {
    return false;
  }

  return new RegExp(`^${escapeRegExp(offerId)}[a-z0-9]{4}$`, "i").test(code);
}

function extractMerchantName(
  article: ReturnType<TrustdealsCheerio>,
  domain: string,
): string {
  const linkText = normalizeWhitespace(article.find(".link a").first().text());
  const cleanLinkText = stripMerchantSuffix(linkText);

  if (cleanLinkText.length > 0) {
    return cleanLinkText;
  }

  const imageAlt = normalizeWhitespace(article.find("img[alt]").first().attr("alt") ?? "");

  if (imageAlt.length > 0) {
    return imageAlt;
  }

  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function stripMerchantSuffix(value: string): string {
  return value
    .replace(/\s+(?:rabattkode|kupongkode|kampanjekode|tilbud)$/i, "")
    .trim();
}

function extractReward(title: string): string {
  const reward = extractPercentageReward(title) || extractKrReward(title);
  if (reward !== "") return reward;
  if (/gratis\s+frakt/i.test(title)) return "Gratis frakt";
  return title;
}

function buildUrl(path: string, baseUrl: string): string | undefined {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
