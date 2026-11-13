// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
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
import {
  merchantDomainsFromHostname,
} from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import { extractCouponMinimumPurchase, extractCouponReward } from "./rabattkode.js";

type TrustdealsCheerio = CheerioCrawlingContext["$"];

export type CrawlTrustdealsInput = {
  generatedAt: string;
  logger: Logger;
  startUrl: string;
};

// TrustDeals' front page only shows the last characters of each code
// ("MDFF" for WELCOME10). The full code is server-rendered in the modal of
// /view/<store>?id=offer<id>, next to the structured discount box of that
// coupon, so every candidate coupon is read from its own view page.
const MAX_VIEW_PAGES = 60;

type PendingCoupon = {
  offerId: string;
  storeDomain: string;
  domains: string[];
  title: string;
  merchantName: string;
};

export async function crawlTrustdeals(
  input: CrawlTrustdealsInput,
): Promise<CashbackOffer[]> {
  const offers: CashbackOffer[] = [];
  const counts = { visible: 0, unique: 0, noCode: 0, withoutDomain: 0, failed: 0 };
  let frontPageError: string | undefined;

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: MAX_VIEW_PAGES + 1,
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 30,
    requestHandler: async ({ $, request, addRequests }) => {
      const loadedUrl = request.loadedUrl ?? request.url;

      if (request.label === "view") {
        const coupon = request.userData as PendingCoupon;
        const offer = parseTrustdealsViewPage($, coupon, loadedUrl, input.generatedAt);
        if (offer === undefined) counts.noCode += 1;
        else offers.push(offer);
        return;
      }

      const pending = parseTrustdealsFrontPage($, counts);
      await addRequests(pending.slice(0, MAX_VIEW_PAGES).map((coupon) => ({
        url: buildUrl(`/view/${coupon.storeDomain}?id=offer${coupon.offerId}`, loadedUrl) ?? loadedUrl,
        label: "view",
        userData: coupon,
      })));
    },
    failedRequestHandler: async ({ request, error }) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (request.label === "view") {
        counts.failed += 1;
        input.logger.warn(`TrustDeals: could not fetch ${request.url}: ${message}`);
      } else {
        frontPageError = `TrustDeals: could not fetch ${request.url}: ${message}`;
      }
    },
  }, config);

  await crawler.run([input.startUrl]);

  if (frontPageError !== undefined) input.logger.warn(frontPageError);
  input.logger.info(
    `TrustDeals: ${counts.visible} frontpage coupons, ${offers.length} usable codes, ${counts.unique} personal codes, ${counts.noCode} without code on the view page, ${counts.withoutDomain} without domain, ${counts.failed} view pages failed`,
  );

  return uniqueOffers(offers);
}

function parseTrustdealsFrontPage(
  $: TrustdealsCheerio,
  counts: { visible: number; unique: number; withoutDomain: number },
): PendingCoupon[] {
  const pending: PendingCoupon[] = [];

  $("article.coupon").each((_index, element) => {
    const article = $(element);
    counts.visible += 1;

    if (article.hasClass("uq")) {
      counts.unique += 1;
      return;
    }

    const offerId = article.attr("data-offer")?.trim() ?? "";
    const rawSlug = article.attr("data-slug")?.trim() ?? "";
    const domains = merchantDomainsFromHostname(rawSlug);

    if (!/^\d+$/.test(offerId) || domains.length === 0) {
      counts.withoutDomain += 1;
      return;
    }

    const storeDomain = normalizeDomainInput(rawSlug);
    pending.push({
      offerId,
      storeDomain,
      domains,
      title: normalizeWhitespace(article.find("h3").first().text()),
      merchantName: extractMerchantName(article, storeDomain),
    });
  });

  return pending;
}

export function parseTrustdealsViewPage(
  $: TrustdealsCheerio,
  coupon: PendingCoupon,
  pageUrl: string,
  generatedAt: string,
): CashbackOffer | undefined {
  const modal = $("#modal").filter((_index, element) => $(element).attr("data-id") === coupon.offerId).first();
  const discountCode = normalizeWhitespace(modal.find(".modal-open .code").first().text());

  // Deals without a code show "Ingen kode nødvendig" in the modal.
  if (!isReusableDiscountCode(discountCode)) return undefined;

  const article = $(`article[data-offer="${coupon.offerId}"]`).first();
  const title = normalizeWhitespace(article.find("h3").first().text()) || coupon.title;
  const conditions = normalizeWhitespace(article.find(".terms").first().text()).replace(/^-\s*/, "");
  const boxValue = normalizeWhitespace(article.find(".discount-box .discount").first().text());
  const boxReward = boxValue === "" ? "" : extractCouponReward(`${boxValue} rabatt`);
  const titleReward = extractReward(title);
  // The box and the headline disagree for some coupons (eBay: box 15 %,
  // headline 3 %, code PERFECTEBAY3); neither is then shown as the reward.
  const conflicting = boxReward !== "" && /\d/.test(titleReward) && boxReward !== titleReward;
  const reward = conflicting ? "Rabattkode" : boxReward || titleReward;
  const rewardCalculation = extractCouponMinimumPurchase(`${title}\n${conditions}`);
  const note = conflicting
    ? `TrustDeals oppgir ${boxReward} for koden, men ${titleReward} i overskriften.`
    : "";

  return {
    provider: "rabattkode",
    merchantName: coupon.merchantName,
    domains: coupon.domains,
    reward,
    ...(rewardCalculation === undefined ? {} : { rewardCalculation }),
    sourceUrl: buildUrl(`/view/${coupon.storeDomain}#td-offer${coupon.offerId}`, pageUrl) ?? pageUrl,
    activationUrl: `https://${coupon.storeDomain}`,
    discountCode,
    terms: [title, conditions, note].filter(Boolean).join("\n"),
    updatedAt: generatedAt,
  };
}

function isReusableDiscountCode(code: string): boolean {
  if (code.length < 3 || /\s/.test(code) || code.includes("…")) {
    return false;
  }

  return !/^(?:uniquecodes?|unique|personlig)$/i.test(code) && /^[\p{L}\p{N}][\p{L}\p{N}!._%-]{2,40}$/u.test(code);
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
  return extractCouponReward(title) || "Rabattkode";
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

