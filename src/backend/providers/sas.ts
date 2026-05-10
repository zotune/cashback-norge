// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  uniqueOffers,
} from "../../shared/cashback.js";
import { type DomainLookup, lookupDomains } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type SasShop = {
  uuid: string;
  name: string;
  slug: string;
  commission_type: string;
  points: number;
  points_channel: number;
  fixed_cashback_text: string | null;
  has_campaign: number;
  points_campaign: number | null;
  campaign_ends_date: string | null;
};

type SasShopsResponse = {
  data: SasShop[];
};

export type FetchSasInput = {
  apiUrl: string;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
  domainLookup: DomainLookup;
};

export async function fetchSas(input: FetchSasInput): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching SAS EuroBonus shops from ${input.apiUrl}`);

  const response = await gotScraping(input.apiUrl, {
    responseType: "json",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `SAS API returned ${response.statusCode}: ${response.statusMessage}`,
    );
  }

  const body: unknown = response.body;

  if (!isSasShopsResponse(body)) {
    throw new Error("SAS API returned unexpected data format");
  }

  const offers: CashbackOffer[] = [];

  for (const shop of body.data) {
    const overrideDomains = input.overrides.sas[shop.slug] ?? [];
    const discoveredDomains =
      overrideDomains.length > 0
        ? overrideDomains
        : lookupDomains(input.domainLookup, shop.name);

    const offer = parseSasShop(shop, discoveredDomains, input.generatedAt);

    if (offer.domains.length === 0) {
      input.logger.warn(
        `SAS offer has no domains and no cross-reference match: ${shop.name} (${shop.slug})`,
      );
    }

    offers.push(offer);
  }

  input.logger.info(`Found ${offers.length} SAS EuroBonus offers`);
  return uniqueOffers(offers);
}

function parseSasShop(
  shop: SasShop,
  domains: string[],
  generatedAt: string,
): CashbackOffer {
  const reward = formatSasReward(shop);
  const sourceUrl = `https://onlineshopping.flysas.com/nb-NO/butikker/${shop.slug}/${shop.uuid}`;

  return {
    provider: "sas",
    merchantName: shop.name,
    domains,
    reward,
    sourceUrl,
    activationUrl: sourceUrl,
    terms: formatSasTerms(shop),
    updatedAt: generatedAt,
  };
}

function formatSasReward(shop: SasShop): string {
  if (shop.fixed_cashback_text !== null && shop.fixed_cashback_text.length > 0) {
    return shop.fixed_cashback_text;
  }

  const points = shop.has_campaign === 1 && shop.points_campaign !== null && shop.points_campaign > 0
    ? shop.points_campaign
    : shop.points;

  if (shop.commission_type === "variable") {
    return `${points} poeng per 100 kr`;
  }

  return `${formatPoints(points)} poeng`;
}

function formatSasTerms(shop: SasShop): string {
  const parts: string[] = [];

  if (shop.commission_type === "variable") {
    const basePoints = shop.points;
    const channelPoints = shop.points_channel;
    let line = `Tjen ${formatPoints(basePoints)} poeng`;
    if (channelPoints > 0) line += ` + ${channelPoints} nivåpoeng`;
    line += ` per 100 kr.`;
    parts.push(line);
  } else if (shop.fixed_cashback_text === null || shop.fixed_cashback_text.length === 0) {
    let line = `Tjen ${formatPoints(shop.points)} poeng`;
    if (shop.points_channel > 0) line += ` + ${shop.points_channel} nivåpoeng`;
    line += `.`;
    parts.push(line);
  }

  if (shop.has_campaign === 1 && shop.points_campaign !== null && shop.points_campaign > 0) {
    parts.push(`Kampanje: ${shop.points_campaign} poeng (normalt ${shop.points}).`);
    if (shop.campaign_ends_date !== null && shop.campaign_ends_date.length > 0) {
      parts.push(`Kampanje gyldig til ${shop.campaign_ends_date}.`);
    }
  }

  return parts.join("\n");
}

function formatPoints(points: number): string {
  if (points >= 1000) {
    return points.toLocaleString("nb-NO");
  }

  return String(points);
}

function isSasShopsResponse(value: unknown): value is SasShopsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isSasShop)
  );
}

function isSasShop(value: unknown): value is SasShop {
  return (
    isRecord(value) &&
    typeof value.uuid === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    typeof value.commission_type === "string" &&
    typeof value.points === "number" &&
    typeof value.points_channel === "number" &&
    typeof value.has_campaign === "number" &&
    (value.points_campaign === null || typeof value.points_campaign === "number") &&
    (value.campaign_ends_date === null || typeof value.campaign_ends_date === "string")
  );
}
