// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { formatPercentageReward, formatRewardNumber } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import { isAffiliateTrackingUrl } from "./spareborsen.js";

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
  /** Local verification only. */
  apiUrl?: string;
  /** Verified merchant domains by Dreams shop id (data/provider-overrides.json). */
  overrides?: Record<string, string[]>;
};

// The shop list the app and https://www.getdreams.com/no/cashback/butikker
// read; the old /no/butiker path only redirects to the landing page.
const SOURCE_URL = "https://www.getdreams.com/no/cashback/butikker";
const MAX_FETCH_ATTEMPTS = 3;

export async function fetchDreams(
  input: FetchDreamsInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Dreams: fetching shops...");

  const shops = await fetchShops(input.apiUrl ?? API_URL, input.logger);
  const enabled = shops.filter((s) => s.enabled);
  input.logger.info(`Dreams: ${enabled.length} enabled shops (of ${shops.length} total)`);

  // The market list can hold the same store twice (two networks, or a
  // Swedish and a Norwegian storefront); they become one offer per name.
  const groups = new Map<string, { shop: DreamsShop; domains: string[]; reward: string }[]>();

  for (const shop of enabled) {
    const domains = shopDomains(shop, input.overrides?.[shop.id]);
    if (domains === undefined) {
      input.logger.warn(`Dreams: no domain for ${shop.name} (${shop.link})`);
      continue;
    }
    if (domains.length === 0) {
      input.logger.warn(`Dreams: ${shop.name} links to a tracking URL (${new URL(shop.link).hostname}); keeping the offer without domains`);
    }

    const reward = buildReward(shop);
    if (!reward) {
      input.logger.warn(`Dreams: no reward for ${shop.name}`);
      continue;
    }

    const name = cleanMerchantName(shop.name);
    const key = name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), { shop, domains, reward }]);
  }

  const offers: CashbackOffer[] = [];

  for (const entries of groups.values()) {
    const first = entries[0];
    if (first === undefined) continue;
    const merged = mergeEntries(entries);
    offers.push({
      provider: "dreams",
      merchantName: cleanMerchantName(first.shop.name),
      domains: merged.domains,
      reward: merged.reward,
      sourceUrl: SOURCE_URL,
      activationUrl: SOURCE_URL,
      terms: [merged.rateLines, buildTerms(entries.map((entry) => entry.shop))].filter(Boolean).join("\n"),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Dreams: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchShops(apiUrl: string, logger: Logger): Promise<DreamsShop[]> {
  // The token is the public one from Dreams' web client; keep it out of logs.
  const requestLabel = redactToken(apiUrl);
  const errors: string[] = [];

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await gotScraping(apiUrl, {
        headers: { Accept: "application/json" },
        http2: false,
        responseType: "json",
        throwHttpErrors: false,
        timeout: { request: 30_000 },
      });
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`HTTP ${response.statusCode} ${response.statusMessage ?? ""}`.trim());
      }
      if (!Array.isArray(response.body)) {
        throw new Error("unexpected response format (expected an array of shops)");
      }
      return response.body as DreamsShop[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`attempt ${attempt}/${MAX_FETCH_ATTEMPTS}: ${message}`);
      if (attempt < MAX_FETCH_ATTEMPTS) {
        logger.warn(`Dreams: ${requestLabel} failed (${message}); retrying`);
        await new Promise((resolveValue) => setTimeout(resolveValue, 1_000 * attempt));
      }
    }
  }

  throw new Error(`Dreams API ${requestLabel} failed: ${errors.join("; ")}`);
}

function redactToken(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("token")) parsed.searchParams.set("token", "***");
    return parsed.toString();
  } catch {
    return "Dreams shops API";
  }
}

/** Undefined = unusable link; [] = affiliate tracking link without a shop domain. */
function shopDomains(shop: DreamsShop, overrideDomains: string[] | undefined): string[] | undefined {
  if (overrideDomains !== undefined && overrideDomains.length > 0) return overrideDomains;

  let url: URL;
  try {
    url = new URL(shop.link);
  } catch {
    return undefined;
  }

  // Some "links" are network click URLs (ad.doubleclick.net, nespresso.prf.hn).
  if (isAffiliateTrackingUrl(url)) return [];
  const domain = normalizeDomainInput(url.hostname);
  return domain ? [domain] : undefined;
}

function mergeEntries(entries: { shop: DreamsShop; domains: string[]; reward: string }[]): {
  domains: string[];
  reward: string;
  rateLines: string;
} {
  const domains = uniqueStrings(entries.flatMap((entry) => entry.domains));
  const types = uniqueStrings(entries.map((entry) => entry.shop.cashbackType));
  const best = [...entries].sort((a, b) => b.shop.cashbackValue - a.shop.cashbackValue)[0]!;
  const rewards = uniqueStrings(entries.map((entry) => entry.reward));

  if (rewards.length === 1 || types.length > 1) {
    return { domains: types.length > 1 ? best.domains : domains, reward: best.reward, rateLines: "" };
  }

  const entryDomains = uniqueStrings(entries.map((entry) => entry.domains.join(", ")));
  if (entryDomains.length === 1) {
    // Two programmes for the same shop: the app lists both, so the higher
    // rate is available.
    return { domains, reward: best.reward, rateLines: "" };
  }

  // Different storefronts with their own rates: show the range and say
  // which rate belongs to which storefront.
  const values = entries.map((entry) => entry.shop.cashbackValue);
  const reward = types[0] === "fixed"
    ? formatFixedRange(values)
    : formatPercentageReward(values);
  const rateLines = entries
    .map((entry) => `${entry.reward} – ${entry.domains.join(", ") || "ukjent nettbutikk"}`)
    .join("\n");
  return { domains, reward, rateLines };
}

function formatFixedRange(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min < max ? `${formatRewardNumber(min)}-${formatRewardNumber(max)} kr` : `${formatRewardNumber(max)} kr`;
}

// Network programme names leak into the list ("MICAS AFFILIATE PROGRAM",
// "NN Hotels(GLOBAL)", "Philips Hue NO - AFF", "Wolt NOR").
function cleanMerchantName(name: string): string {
  const cleaned = name
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\((?:GLOBAL|NO|NOR|NORWAY|NORGE|EU)\)$/i, "")
    .replace(/\s+(?:Global\s+)?(?:Travel\s+)?(?:Affiliate|Partner)\s+Program(?:me)?$/i, "")
    .replace(/\s+-\s+AFF$/i, "")
    .replace(/\s+(?:-\s+)?(?:NO|NOR|Norway|Norge)$/, "")
    .replace(/\s+(?:AS|AB)$/, "")
    .trim();
  return cleaned || name.trim();
}

function buildReward(shop: DreamsShop): string {
  if (!Number.isFinite(shop.cashbackValue) || shop.cashbackValue <= 0) return "";

  if (shop.cashbackType === "fixed") {
    return `${formatRewardNumber(shop.cashbackValue)} kr`;
  }

  return formatPercentageReward([shop.cashbackValue]);
}

function buildTerms(shops: DreamsShop[]): string {
  const parts: string[] = [];

  const cats = uniqueStrings(shops.flatMap((shop) => shop.categories))
    .map((c) => CATEGORY_LABELS[c] ?? c)
    .join(", ");
  if (cats) parts.push(cats);

  if (shops.some((shop) => shop.featured)) parts.push("Utvalgt butikk");

  parts.push("Cashback via Dreams-appen");

  return parts.join("\n");
}
