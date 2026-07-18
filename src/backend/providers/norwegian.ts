// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl, stripHtml, toBaseDomain } from "../../shared/cashback.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type GridListItem = {
  url: string;
  heading: string;
};

export type FetchNorwegianRewardInput = {
  /** https://www.norwegian.com/api/gridlist */
  apiUrl: string;
  gridListId: number;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

// Partner pages that are Norwegian's own products, not external shops
const SKIP_SLUGS = new Set(["norwegian-kortet", "flybilletter", "norwegian-holidays"]);

const EXCLUDED_LINK_HOSTS =
  /norwegian\.com|norwegianreward\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|(^|\.)x\.com|cookielaw\.org|lc\.chat|apple\.com|google\.com|strompris\.no/;

export async function fetchNorwegianReward(
  input: FetchNorwegianRewardInput,
): Promise<CashbackOffer[]> {
  const listUrl = `${input.apiUrl}?languageCode=nb&marketCode=no&gridListId=${input.gridListId}`;
  input.logger.info(`Fetching Norwegian Reward partners from ${listUrl}`);

  const response = await gotScraping(listUrl, {
    responseType: "json",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `Norwegian Reward API returned ${response.statusCode}: ${response.statusMessage}`,
    );
  }

  const items = readGridListItems(response.body);

  if (items.length === 0) {
    throw new Error("Norwegian Reward API returned no partners");
  }

  input.logger.info(`Norwegian Reward: ${items.length} partners in grid list`);

  const offers: CashbackOffer[] = [];
  const CONCURRENCY = 4;

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((item) => buildPartnerOffer(item, input)),
    );
    for (const result of settled) {
      if (result.status === "fulfilled" && result.value !== undefined) {
        offers.push(result.value);
      } else if (result.status === "rejected") {
        input.logger.warn(`Norwegian Reward: partner fetch failed: ${result.reason}`);
      }
    }
  }

  input.logger.info(`Found ${offers.length} Norwegian Reward offers with domains`);
  return offers;
}

async function buildPartnerOffer(
  item: GridListItem,
  input: FetchNorwegianRewardInput,
): Promise<CashbackOffer | undefined> {
  const slug = readSlug(item.url);

  if (slug === undefined || SKIP_SLUGS.has(slug)) {
    return undefined;
  }

  const response = await gotScraping(item.url, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    input.logger.warn(`Norwegian Reward: ${slug} returned ${response.statusCode}`);
    return undefined;
  }

  // The footer repeats generic partner links on every page; only the
  // content above it belongs to this partner.
  const mainPart = response.body.split(/<footer/i)[0] ?? response.body;
  const text = stripHtml(mainPart);

  const rateMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:i\s+)?CashPoints/i);

  if (rateMatch === null) {
    input.logger.info(`Norwegian Reward: ${slug} has no percentage CashPoints rate, skipping`);
    return undefined;
  }

  const rate = (rateMatch[1] ?? "").replace(".", ",");
  const overrideDomains = (input.overrides["norwegian"] ?? {})[slug];
  const domains = overrideDomains !== undefined && overrideDomains.length > 0
    ? overrideDomains
    : findPartnerDomains(mainPart);

  if (domains.length === 0) {
    input.logger.warn(`Norwegian Reward: no partner domain found for ${slug}`);
    return undefined;
  }

  const merchantName = item.heading.trim() !== "" ? item.heading.trim() : slug;
  const title = readTitle(response.body);

  return {
    provider: "norwegian",
    merchantName,
    domains,
    reward: `${rate}%`,
    sourceUrl: item.url,
    activationUrl: item.url,
    terms: title ?? "",
    updatedAt: input.generatedAt,
  };
}

function findPartnerDomains(mainPart: string): string[] {
  const candidates: { domain: string; score: number; order: number }[] = [];
  const seen = new Set<string>();
  let order = 0;

  for (const match of mainPart.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const href = (match[1] ?? "").replace(/&amp;/g, "&");
    const parsed = parseUrl(href);

    if (parsed === undefined || EXCLUDED_LINK_HOSTS.test(parsed.hostname)) {
      continue;
    }

    const domain = toBaseDomain(normalizeDomainInput(parsed.hostname));

    if (seen.has(domain)) {
      continue;
    }

    seen.add(domain);
    // Tracking parameters mark the partner CTA link; plain links may be
    // login pages or unrelated references.
    let score = 0;
    if (href.includes("rewardno")) score += 3;
    if (/utm_/.test(href)) score += 2;
    if (/partner|norwegian/i.test(href)) score += 1;
    candidates.push({ domain, score, order: order++ });
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const bestCandidate = candidates[0];
  return bestCandidate !== undefined ? [bestCandidate.domain] : [];
}

function readSlug(url: string): string | undefined {
  const parsed = parseUrl(url);
  const segments = parsed?.pathname.split("/").filter((s) => s.length > 0) ?? [];
  return segments[segments.length - 1];
}

function readTitle(body: string): string | undefined {
  const match = body.match(/<title>([^<]*)<\/title>/i);

  if (match === null) {
    return undefined;
  }

  return stripHtml(match[1] ?? "").replace(/\s*\|\s*Norwegian\s*$/i, "").trim();
}

function readGridListItems(body: unknown): GridListItem[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return [];
  }

  const items = (body as Record<string, unknown>).items;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const record = item as Record<string, unknown>;

    if (typeof record.url !== "string" || !record.url.includes("/vare-partnere/")) {
      return [];
    }

    return [{
      url: record.url,
      heading: typeof record.heading === "string" ? record.heading : "",
    }];
  });
}
