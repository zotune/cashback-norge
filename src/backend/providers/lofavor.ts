// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
// LO Favør has no open API; benefits are server-rendered pages linked from
// the front page as /<category>/<benefit> paths.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl, stripHtml, toBaseDomain } from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

export type FetchLofavorInput = {
  /** Front page listing all benefit links, e.g. https://www.lofavor.no/home */
  startUrl: string;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

const DEFAULT_TERMS = "Krever LO-medlemskap (LOfavør).";

// Categories with external merchant benefits. Bank and insurance products
// (SpareBank 1/Fremtind) are LO Favør's own products, not shop discounts.
const BENEFIT_CATEGORIES = new Set([
  "ferie-og-opplevelser",
  "ferie-og-fritid",
  "hus-og-hjem",
  "juridisk",
]);

const EXCLUDED_LINK_HOSTS =
  /lofavor\.no|fremtind\.no|sparebank1\.no|facebook\.com|instagram\.com|youtube\.com|linkedin\.com|twitter\.com|(^|\.)x\.com|google\.com|cookieinformation\.com|adobedtm\.com|weglot\.com|boost\.ai|compendia\.no|seenthis\.se/;

export async function fetchLofavor(input: FetchLofavorInput): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching LO Favør benefits from ${input.startUrl}`);

  const startResponse = await gotScraping(input.startUrl, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (startResponse.statusCode < 200 || startResponse.statusCode >= 300) {
    throw new Error(
      `LO Favør returned ${startResponse.statusCode}: ${startResponse.statusMessage}`,
    );
  }

  const benefitUrls = collectBenefitUrls(startResponse.body);

  if (benefitUrls.length === 0) {
    throw new Error("LO Favør front page contained no benefit links");
  }

  input.logger.info(`LO Favør: ${benefitUrls.length} benefit pages to fetch`);

  const offers: CashbackOffer[] = [];
  const CONCURRENCY = 4;

  for (let i = 0; i < benefitUrls.length; i += CONCURRENCY) {
    const batch = benefitUrls.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((url) => buildBenefitOffer(url, input)),
    );
    for (const result of settled) {
      if (result.status === "fulfilled" && result.value !== undefined) {
        offers.push(result.value);
      } else if (result.status === "rejected") {
        input.logger.warn(`LO Favør: benefit fetch failed: ${result.reason}`);
      }
    }
  }

  input.logger.info(`Found ${offers.length} LO Favør offers with domains`);
  return offers;
}

function collectBenefitUrls(body: string): string[] {
  const urls = new Set<string>();

  for (const match of body.matchAll(/href=["'](https:\/\/www\.lofavor\.no\/([a-z-]+)\/([^"'\/?#]+))["']/g)) {
    const category = match[2] ?? "";

    if (BENEFIT_CATEGORIES.has(category)) {
      urls.add(match[1] ?? "");
    }
  }

  return [...urls].sort();
}

async function buildBenefitOffer(
  url: string,
  input: FetchLofavorInput,
): Promise<CashbackOffer | undefined> {
  const response = await gotScraping(url, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    input.logger.warn(`LO Favør: ${url} returned ${response.statusCode}`);
    return undefined;
  }

  const mainPart = readMainContent(response.body);
  const text = stripHtml(mainPart);
  const merchantName = readHeading(response.body) ?? readSlugName(url);
  const reward = extractBenefitReward(text);

  if (reward === "") {
    input.logger.info(`LO Favør: no parseable reward for ${merchantName}, skipping`);
    return undefined;
  }

  const slug = url.split("/").filter((s) => s !== "").pop() ?? "";
  const overrideDomains = (input.overrides["lofavor"] ?? {})[slug];
  const domains = overrideDomains !== undefined && overrideDomains.length > 0
    ? overrideDomains
    : findPartnerDomains(mainPart);

  if (domains.length === 0) {
    input.logger.info(`LO Favør: no partner domain for ${merchantName}, skipping`);
    return undefined;
  }

  return {
    provider: "lofavor",
    merchantName,
    domains,
    reward,
    sourceUrl: url,
    activationUrl: url,
    terms: buildTerms(text),
    updatedAt: input.generatedAt,
  };
}

// The footer repeats category links and campaign banners on every page; only
// the content before it belongs to this benefit.
function readMainContent(body: string): string {
  return body.split(/<footer/i)[0] ?? body;
}

function readHeading(body: string): string | undefined {
  const match = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  if (match === null) {
    return undefined;
  }

  const heading = stripHtml(match[1] ?? "").replace(/\s+/g, " ").trim();
  return heading !== "" ? heading : undefined;
}

function readSlugName(url: string): string {
  const slug = decodeURIComponent(url.split("/").filter((s) => s !== "").pop() ?? "");
  const name = slug.replace(/-/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function findPartnerDomains(mainPart: string): string[] {
  const counts = new Map<string, number>();

  for (const match of mainPart.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)) {
    const href = (match[1] ?? "").replace(/&amp;/g, "&");
    const parsed = parseUrl(href);

    if (parsed === undefined || EXCLUDED_LINK_HOSTS.test(parsed.hostname)) {
      continue;
    }

    const domain = toBaseDomain(normalizeDomainInput(parsed.hostname));
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best !== undefined ? [best[0]] : [];
}

function buildTerms(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12 && line.length <= 220 &&
      /\b(?:rabatt|medlemspris|tilbud|gjelder|spar|bonus|kode)\b/i.test(line))
    .slice(0, 4);

  return [...lines, DEFAULT_TERMS].join("\n");
}
