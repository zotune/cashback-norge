// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import { formatPercentageReward, formatRewardNumber } from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const API_URLS = [
  "https://spareborsen.no/api/partners?limit=500",
  "https://www.spareborsen.no/api/partners?limit=500",
];
const BASE_URL = "https://spareborsen.no";
const MAX_FETCH_ATTEMPTS = 3;

type SpareborsenSegment = {
  name: string;
  cashbackValue: number;
  cashbackType: "percentage" | "fixed";
  currency: string;
};

type SpareborsenPartner = {
  name: string;
  slug: string;
  websiteUrl: string;
  cashbackPercent: number;
  cashbackType: "percentage" | "fixed";
  cashbackCurrency: string | null;
  /** Sparebørsen's own conditions (new customers only, one-off bonus, …). */
  customTerms?: string | null;
  active: boolean;
  segments: SpareborsenSegment[];
  /** The ordinary rate while a campaign raises cashbackPercent. */
  baseCashbackPercent?: number | null;
  campaignApplies?: boolean;
};

export type FetchSpareborsenInput = {
  generatedAt: string;
  logger: Logger;
  /** Local verification only. */
  apiUrls?: string[];
  /** Verified merchant domains by partner slug (data/provider-overrides.json). */
  overrides?: Record<string, string[]>;
};

export async function fetchSpareborsen(
  input: FetchSpareborsenInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Sparebørsen: fetching partners...");

  const partners = (await fetchPartners(input.logger, input.apiUrls ?? API_URLS)).filter((p) => p.active);
  input.logger.info(`Sparebørsen: ${partners.length} active partners`);

  const offers: CashbackOffer[] = [];

  for (const partner of partners) {
    const domains = partnerDomains(partner, input.overrides?.[partner.slug]);
    if (domains === undefined) {
      input.logger.warn(`Sparebørsen: no domain for ${partner.name} (${partner.websiteUrl})`);
      continue;
    }
    if (domains.length === 0) {
      // The partner's "websiteUrl" is sometimes an affiliate click URL
      // (iherb.prf.hn, go.nordvpn.net/aff_c). Its host is not the shop, and
      // other providers borrow these domains by merchant name.
      input.logger.warn(`Sparebørsen: ${partner.name} links to a tracking URL (${partner.websiteUrl}); keeping the offer without domains`);
    }

    const reward = buildReward(partner);
    if (!reward) {
      input.logger.warn(`Sparebørsen: no reward for ${partner.name}`);
      continue;
    }

    const terms = buildTerms(partner);
    const sourceUrl = `${BASE_URL}/partnere/${partner.slug}`;

    offers.push({
      provider: "spareborsen",
      merchantName: cleanMerchantName(partner.name),
      domains,
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Sparebørsen: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchPartners(logger: Logger, urls: string[]): Promise<SpareborsenPartner[]> {
  const errors: string[] = [];

  for (const url of urls) {
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const response = await gotScraping(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "CashbackNorgeCrawler/1.0",
          },
          http2: false,
          responseType: "json",
          throwHttpErrors: false,
          timeout: { request: 30_000 },
        });

        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new Error(
            `returned ${response.statusCode}: ${response.statusMessage}`,
          );
        }

        return readPartnersResponse(response.body);
      } catch (error) {
        const message = formatError(error);
        errors.push(`${url} attempt ${attempt}/${MAX_FETCH_ATTEMPTS}: ${message}`);
        if (attempt < MAX_FETCH_ATTEMPTS) {
          logger.warn(
            `Sparebørsen: ${message}; retrying ${url} (${attempt + 1}/${MAX_FETCH_ATTEMPTS})`,
          );
          await sleep(1_000 * attempt);
        }
      }
    }
  }

  throw new Error(`Sparebørsen API failed: ${errors.join("; ")}`);
}

function readPartnersResponse(value: unknown): SpareborsenPartner[] {
  if (!isRecord(value) || typeof value.success !== "boolean") {
    throw new Error("returned unexpected data format");
  }

  if (value.success !== true) {
    throw new Error("returned success=false");
  }

  const data = isRecord(value.data) ? value.data : undefined;
  if (!Array.isArray(data?.partners)) {
    throw new Error("returned unexpected partners data");
  }

  return data.partners as SpareborsenPartner[];
}

/** Undefined = unusable URL; [] = affiliate tracking URL without a shop domain. */
function partnerDomains(partner: SpareborsenPartner, overrideDomains: string[] | undefined): string[] | undefined {
  if (overrideDomains !== undefined && overrideDomains.length > 0) return overrideDomains;

  let url: URL;
  try {
    url = new URL(partner.websiteUrl);
  } catch {
    return undefined;
  }

  if (isAffiliateTrackingUrl(url)) return [];
  const domain = normalizeDomainInput(url.hostname);
  return domain ? [domain] : undefined;
}

// Shared with the other adapters; re-exported for existing imports.
import { isAffiliateTrackingUrl } from "../merchant-domains.js";
export { isAffiliateTrackingUrl };

// Some partner names carry a tagline ("Nordhost - Hosting på norsk siden
// 1999"). A suffix with ordinary lowercase words is a description, while a
// name part such as "Barnas Bokverden - Tanum Bokklubber" is kept.
function cleanMerchantName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const match = trimmed.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (match?.[1] && match[2] && /(?:^|\s)(?:og|på|for|med|til|siden|i|av)(?:\s|$)/.test(match[2])) {
    return match[1].trim();
  }
  return trimmed;
}

function buildReward(partner: SpareborsenPartner): string {
  // Segments are the rates Sparebørsen shows per purchase type ("Nye kunder
  // 5,7 %", "1-8 GB 150 kr"); the partner-level value is only one of them.
  const values = partner.segments
    .filter((s) => s.cashbackType === partner.cashbackType && Number.isFinite(s.cashbackValue) && s.cashbackValue > 0)
    .map((s) => s.cashbackValue);
  if (values.length === 0 && Number.isFinite(partner.cashbackPercent) && partner.cashbackPercent > 0) {
    values.push(partner.cashbackPercent);
  }
  if (values.length === 0) return "";

  if (partner.cashbackType === "fixed") {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min < max
      ? `${formatRewardNumber(min)}-${formatRewardNumber(max)} kr`
      : `${formatRewardNumber(max)} kr`;
  }

  return formatPercentageReward(values);
}

function buildTerms(partner: SpareborsenPartner): string {
  const lines = partner.segments.length <= 1 ? [] : partner.segments.map((s) => {
    if (s.cashbackType === "fixed") {
      return `${formatRewardNumber(s.cashbackValue)} kr – ${s.name}`;
    }
    return `${formatPercentageReward([s.cashbackValue])} – ${s.name}`;
  });

  // Sparebørsen marks campaign rates as "+x prosentpoeng"; the reward is the
  // raised rate, so the tooltip names the ordinary one beside it.
  const base = partner.baseCashbackPercent;
  const campaign = partner.cashbackType === "percentage" && partner.campaignApplies === true &&
    typeof base === "number" && Number.isFinite(base) && base >= 0 && base < partner.cashbackPercent;
  // The API gives one base rate for the partner-level value. It only states
  // the ordinary rate of the reward when that reward is the partner value;
  // with several segments, or a segment rate that differs from it, the
  // tooltip says that the rates are raised without naming a number.
  const single = partner.segments.length === 0 ||
    (partner.segments.length === 1 && partner.segments[0]?.cashbackValue === partner.cashbackPercent);
  const campaignLine = !campaign ? "" : !single
    ? "Forhøyede kampanjesatser hos Sparebørsen. Kampanjen er tidsbegrenset."
    : `Forhøyet kampanjesats hos Sparebørsen: +${formatPercentageReward([Math.round((partner.cashbackPercent - base) * 100) / 100]).replace(" %", "")} prosentpoeng. Vanlig sats: ${formatPercentageReward([base])}. Kampanjen er tidsbegrenset.`;
  const customTerms = typeof partner.customTerms === "string" ? partner.customTerms.replace(/\s+/g, " ").trim() : "";

  return [lines.join("\n"), customTerms, campaignLine].filter(Boolean).join("\n\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveValue) => setTimeout(resolveValue, ms));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
