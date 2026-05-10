// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const API_URL =
  "https://web-api.getdreams.co/v1/cashback/shops?market_id=NO&token=VM2eGPxhL3KK5IzpxjVytABvnqHUF9DAd3IuQxyny4Q";

const CATEGORY_LABELS: Record<string, string> = {
  fashion: "Mote",
  health_and_beauty: "Helse og skjønnhet",
  home_and_lifestyle: "Hjem og livsstil",
  travel_and_transport: "Reise",
  family_and_kids: "Familie og barn",
  food_and_beverages: "Matvarer",
  sports_and_recreation: "Sport og fritid",
  gifts_and_special_occasions: "Gaver og feiring",
  technology_and_media: "Teknologi og media",
  business_and_finance: "Økonomi",
  other: "Annet",
};

type DreamsShop = {
  id: string;
  name: string;
  link: string;
  categories: string[];
  enabled: boolean;
  featured: boolean;
  cashbackType: "%" | "fixed";
  cashbackValue: number;
};

export type FetchDreamsInput = {
  generatedAt: string;
  logger: Logger;
};

export async function fetchDreams(
  input: FetchDreamsInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Dreams: fetching shops...");

  const response = await fetch(API_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Dreams API returned ${response.status}`);
  }

  const shops = (await response.json()) as DreamsShop[];
  const enabled = shops.filter((s) => s.enabled);
  input.logger.info(`Dreams: ${enabled.length} enabled shops (of ${shops.length} total)`);

  const offers: CashbackOffer[] = [];

  for (const shop of enabled) {
    const domain = extractDomain(shop.link);
    if (!domain) {
      input.logger.warn(`Dreams: no domain for ${shop.name} (${shop.link})`);
      continue;
    }

    const reward = buildReward(shop);
    if (!reward) {
      input.logger.warn(`Dreams: no reward for ${shop.name}`);
      continue;
    }

    const terms = buildTerms(shop);

    offers.push({
      provider: "dreams",
      merchantName: shop.name,
      domains: [domain],
      reward,
      sourceUrl: "https://www.getdreams.com/no/butiker",
      activationUrl: "https://www.getdreams.com/no/butiker",
      terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Dreams: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function extractDomain(link: string): string | null {
  try {
    const url = new URL(link);
    return normalizeDomainInput(url.hostname);
  } catch {
    return null;
  }
}

function buildReward(shop: DreamsShop): string {
  if (shop.cashbackValue <= 0) return "";

  if (shop.cashbackType === "fixed") {
    return `${formatValue(shop.cashbackValue)} kr`;
  }

  return `${formatValue(shop.cashbackValue)} %`;
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return `${value}`;
  return `${value}`.replace(".", ",");
}

function buildTerms(shop: DreamsShop): string {
  const parts: string[] = [];

  const cats = shop.categories
    .map((c) => CATEGORY_LABELS[c] ?? c)
    .join(", ");
  if (cats) parts.push(cats);

  if (shop.featured) parts.push("Utvalgt butikk");

  parts.push("Cashback via Dreams-appen");

  return parts.join("\n");
}
