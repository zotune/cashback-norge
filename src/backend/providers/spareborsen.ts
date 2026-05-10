// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import { formatPercentageReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const API_URL = "https://spareborsen.no/api/partners?limit=200";
const BASE_URL = "https://spareborsen.no";

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

  const response = await fetch(API_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Sparebørsen API returned ${response.status}`);
  }

  const json = (await response.json()) as {
    success: boolean;
    data: { partners: SpareborsenPartner[] };
  };
  if (!json.success) {
    throw new Error("Sparebørsen API returned success=false");
  }

  const partners = json.data.partners.filter((p) => p.active);
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
