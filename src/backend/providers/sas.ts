import { resolve as dnsResolve } from "node:dns/promises";
import {
  type CashbackOffer,
  isRecord,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type SasShop = {
  uuid: string;
  name: string;
  slug: string;
  commission_type: string;
  points: number;
  fixed_cashback_text: string | null;
};

type SasShopsResponse = {
  data: SasShop[];
};

export type FetchSasInput = {
  apiUrl: string;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
};

export async function fetchSas(input: FetchSasInput): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching SAS EuroBonus shops from ${input.apiUrl}`);

  const response = await fetch(input.apiUrl);

  if (!response.ok) {
    throw new Error(
      `SAS API returned ${response.status}: ${response.statusText}`,
    );
  }

  const body: unknown = await response.json();

  if (!isSasShopsResponse(body)) {
    throw new Error("SAS API returned unexpected data format");
  }

  const offers: CashbackOffer[] = [];

  for (const shop of body.data) {
    const overrideDomains = input.overrides.sas[shop.slug] ?? [];
    const discoveredDomains =
      overrideDomains.length > 0
        ? overrideDomains
        : await discoverDomains(shop, input.logger);

    const offer = parseSasShop(shop, discoveredDomains, input.generatedAt);

    if (offer.domains.length === 0) {
      input.logger.warn(
        `SAS offer has no domains and could not resolve: ${shop.slug}`,
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
    terms: "",
    updatedAt: generatedAt,
  };
}

async function discoverDomains(shop: SasShop, logger: Logger): Promise<string[]> {
  const slug = shop.slug;
  const name = shop.name.trim();

  const cleanSlug = slug.replace(/-\d+$/, "").replace(/-(?:no|se|dk)$/, "");
  const nameClean = name.toLowerCase().replace(/[^a-z0-9\-]/g, "");

  const candidates = new Set<string>();

  // If the store name itself looks like a domain (e.g. "Barbershop.no", "CDON.COM")
  if (/^[\w.\-]+\.(no|com|se|eu|net|io|dk|fi)$/i.test(name)) {
    candidates.add(name.toLowerCase());
  }

  // Try common TLDs with slug variants
  for (const base of [cleanSlug, slug]) {
    const baseLower = base.replace(/\s/g, "").toLowerCase();
    for (const tld of [".no", ".com", ".se"]) {
      candidates.add(`${baseLower}${tld}`);
    }
  }

  // Try cleaned store name as domain
  for (const tld of [".no", ".com"]) {
    candidates.add(`${nameClean}${tld}`);
  }

  const resolved: string[] = [];

  for (const candidate of [...candidates].sort()) {
    if (await canResolve(candidate)) {
      resolved.push(candidate);
    }
  }

  if (resolved.length > 0) {
    logger.info(`SAS ${slug}: resolved domains ${resolved.join(", ")}`);
  }

  return uniqueStrings(resolved);
}

async function canResolve(domain: string): Promise<boolean> {
  try {
    await dnsResolve(domain);
    return true;
  } catch {
    return false;
  }
}

function formatSasReward(shop: SasShop): string {
  if (shop.fixed_cashback_text !== null && shop.fixed_cashback_text.length > 0) {
    return shop.fixed_cashback_text;
  }

  if (shop.commission_type === "variable") {
    return `${shop.points} poeng per 100 kr`;
  }

  return `${formatPoints(shop.points)} poeng`;
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
    typeof value.points === "number"
  );
}
