// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import { formatPercentageReward } from "../../shared/reward.js";
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
  active: boolean;
  segments: SpareborsenSegment[];
};

export type FetchSpareborsenInput = {
  generatedAt: string;
  logger: Logger;
};

export async function fetchSpareborsen(
  input: FetchSpareborsenInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Sparebørsen: fetching partners...");

  const partners = (await fetchPartners(input.logger)).filter((p) => p.active);
  input.logger.info(`Sparebørsen: ${partners.length} active partners`);

  const offers: CashbackOffer[] = [];

  for (const partner of partners) {
    const domain = extractDomain(partner.websiteUrl);
    if (!domain) {
      input.logger.warn(`Sparebørsen: no domain for ${partner.name} (${partner.websiteUrl})`);
      continue;
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
      merchantName: partner.name,
      domains: [domain],
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

async function fetchPartners(logger: Logger): Promise<SpareborsenPartner[]> {
  const errors: string[] = [];

  for (const url of API_URLS) {
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

function extractDomain(websiteUrl: string): string | null {
  try {
    const url = new URL(websiteUrl);
    return normalizeDomainInput(url.hostname);
  } catch {
    return null;
  }
}

function buildReward(partner: SpareborsenPartner): string {
  if (partner.cashbackType === "fixed") {
    const value = partner.cashbackPercent;
    return value > 0 ? `${value} kr` : "";
  }

  // percentage type
  const values = partner.segments
    .filter((s) => s.cashbackType === "percentage")
    .map((s) => s.cashbackValue);

  if (values.length === 0) {
    return partner.cashbackPercent > 0
      ? `${partner.cashbackPercent} %`
      : "";
  }

  return formatPercentageReward(values);
}

function buildTerms(partner: SpareborsenPartner): string {
  if (partner.segments.length <= 1) return "";

  const lines = partner.segments.map((s) => {
    if (s.cashbackType === "fixed") {
      return `${s.cashbackValue} kr – ${s.name}`;
    }
    return `${s.cashbackValue} % – ${s.name}`;
  });

  return lines.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveValue) => setTimeout(resolveValue, ms));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
