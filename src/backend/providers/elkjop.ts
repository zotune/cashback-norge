// This file extracts publicly available Elkjøp customer club partner benefits.
// Partner codes that require login are not extracted; users are sent to the
// public customer club page to activate or inspect the benefit.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractKrReward,
  extractPercentageReward,
  formatRewardNumber,
} from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const DEFAULT_TERMS = "Krever medlemskap i Elkjøps Kundeklubb.";

const BLOCKED_DOMAINS = new Set([
  "elkjop.no",
  "next-media.elkjop.com",
  "schema.org",
]);

const FALLBACK_DOMAINS: Record<string, string[]> = {
  "bjorn-borg": ["bjornborg.com"],
  bookbeat: ["bookbeat.no", "bookbeat.com"],
  e24: ["e24.no"],
  fabel: ["fabel.no"],
  flipp: ["flipp.no"],
  hellofresh: ["hellofresh.no", "hellofresh.com"],
  "lyd-bilde": ["lydogbilde.no"],
  nextory: ["nextory.no", "nextory.com"],
  "norsk-familieokonomi": ["norskfamilie.no"],
  storytel: ["storytel.com"],
  strim: ["strim.no"],
  viaplay: ["viaplay.no"],
};

const MERCHANT_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\bstrim\b/i, name: "Strim" },
  { pattern: /\bstorytel\b/i, name: "Storytel" },
  { pattern: /\bviaplay\b/i, name: "Viaplay" },
  { pattern: /\bhello\s*fresh\b/i, name: "HelloFresh" },
  { pattern: /\bnextory\b/i, name: "Nextory" },
  { pattern: /\bbook\s*beat\b|\bbookbeat\b/i, name: "BookBeat" },
  { pattern: /\bbj[øoö]rn\s*borg\b|\bbjornborg\b|\bbb_logo\b/i, name: "Björn Borg" },
  { pattern: /\blyd\s*&?\s*bilde\b|\bl&b\b|\blb\+\s*total\b/i, name: "Lyd & Bilde" },
  { pattern: /\be24\b/i, name: "E24" },
  { pattern: /\bnorsk\s*familie(?:okonomi|økonomi)?\b|\bnorskfamilie\b/i, name: "Norsk Familieøkonomi" },
  { pattern: /\bflipp\b/i, name: "Flipp" },
  { pattern: /\bfabel\b/i, name: "Fabel" },
];

type RawElkjopOffer = {
  merchantName: string;
  slug: string;
  heading: string;
  description: string;
  domains: string[];
};

export type CrawlElkjopInput = {
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
  proxyUrls?: string[];
  startUrl: string;
};

export async function crawlElkjop(input: CrawlElkjopInput): Promise<CashbackOffer[]> {
  input.logger.info(`Elkjøp: fetching customer club partner benefits from ${input.startUrl}`);

  const html = await fetchHtml(input.startUrl, input.proxyUrls ?? [], input.logger);
  const rawOffers = extractElkjopOffers(html);
  input.logger.info(`Elkjøp: found ${rawOffers.length} partner benefit cards`);

  const offers: CashbackOffer[] = [];
  let skippedNoReward = 0;
  let skippedNoDomain = 0;
  let lookupCount = 0;
  let fallbackCount = 0;
  let overrideCount = 0;

  for (const raw of rawOffers) {
    const text = `${raw.heading}\n${raw.description}`;
    const reward = extractElkjopReward(text);

    if (!reward) {
      skippedNoReward++;
      input.logger.warn(`Elkjøp: no reward for "${raw.merchantName}" (${raw.heading})`);
      continue;
    }

    const overrideDomains = input.overrides.elkjop?.[raw.slug] ?? [];
    if (overrideDomains.length > 0) overrideCount++;

    let domains = uniqueStrings([
      ...overrideDomains,
      ...raw.domains,
    ].map(normalizeDomainInput));

    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, raw.merchantName);
      if (domains.length > 0) lookupCount++;
    }

    if (domains.length === 0) {
      domains = FALLBACK_DOMAINS[raw.slug] ?? [];
      if (domains.length > 0) fallbackCount++;
    }

    domains = uniqueStrings(domains.map(normalizeDomainInput));

    if (domains.length === 0) {
      skippedNoDomain++;
      input.logger.warn(`Elkjøp: no domain for "${raw.merchantName}" (${raw.slug})`);
      continue;
    }

    offers.push({
      provider: "elkjop",
      merchantName: raw.merchantName,
      domains,
      reward,
      sourceUrl: input.startUrl,
      activationUrl: input.startUrl,
      terms: buildTerms(raw),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Elkjøp: produced ${offers.length} offers (${lookupCount} via lookup, ${fallbackCount} fallback domains, ${overrideCount} overrides, ${skippedNoReward} skipped no reward, ${skippedNoDomain} skipped no domain)`,
  );
  return uniqueOffers(offers);
}

function extractElkjopOffers(html: string): RawElkjopOffer[] {
  const cards = [...html.matchAll(
    /<article\b(?=[^>]*\bcms-module-container\b)(?=[^>]*\bhas-bg\b)[^>]*>[\s\S]*?<\/article>/gi,
  )].map((match) => match[0] ?? "");

  const bySlug = new Map<string, RawElkjopOffer>();

  for (const card of cards) {
    const heading = normalizeText(readFirstTagText(card, "h3"));
    const description = normalizeText(readFirstClassText(card, "text-sm"));
    if (!heading && !description) continue;

    const imageLabels = readImageLabels(card);
    const merchantName = extractMerchantName([
      heading,
      description,
      ...imageLabels,
    ]);
    if (!merchantName) continue;

    const slug = slugify(merchantName);
    if (!slug || bySlug.has(slug)) continue;

    bySlug.set(slug, {
      merchantName,
      slug,
      heading,
      description,
      domains: extractDomains(`${heading}\n${description}`),
    });
  }

  return [...bySlug.values()];
}

function extractMerchantName(parts: string[]): string {
  const haystack = parts.join("\n");
  for (const entry of MERCHANT_PATTERNS) {
    if (entry.pattern.test(haystack)) return entry.name;
  }

  const imageCandidate = parts
    .map(cleanImageMerchantLabel)
    .find((part) => part.length > 1);

  return imageCandidate ?? "";
}

function cleanImageMerchantLabel(value: string): string {
  const cleaned = normalizeText(value)
    .replace(/^cc\s*[-–]\s*/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:logo|data|partner|deal|icon|special|offer|banner|image|bilde|hovedbilde)\b/gi, " ")
    .replace(/\b\d{2,4}x\d{2,4}\b/gi, " ")
    .replace(/\b(?:red|neutral|pos|rgb|no|mobile|tablet|desktop)\b/gi, " ")
    .replace(/\.(?:png|jpe?g|webp|svg)\b/gi, " ")
    .replace(/[_@+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /^(?:el|l|bb)$/i.test(cleaned)) return "";
  return cleaned;
}

function extractElkjopReward(text: string): string {
  const percentageReward = extractPercentageReward(text);
  if (percentageReward) return percentageReward;

  const krReward = extractKrReward(text);
  if (krReward) return krReward;

  const offerPrice = extractOfferPriceReward(text);
  if (offerPrice) return offerPrice;

  return extractFreePeriodReward(text);
}

function extractOfferPriceReward(text: string): string {
  const match = text.match(
    /\b\d+\s*(?:dag(?:er)?|uke(?:r)?|mnd|måned(?:er)?)\s+for\s+(?:kun\s+)?(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*(?:kr|,-)?\b/i,
  );
  if (match === null) return "";

  const value = parseLocalizedNumber(match[1] ?? "");
  if (value <= 0) return "";

  return `${formatRewardNumber(value)} kr`;
}

function extractFreePeriodReward(text: string): string {
  const forPriceMatch = text.match(
    /\b(\d+)\s*(dag(?:er)?|uke(?:r)?|mnd|måned(?:er)?)\b[^.\n]{0,80}\bfor\s+prisen\s+av\s+(\d+)\b/i,
  );
  if (forPriceMatch !== null) {
    const total = Number.parseInt(forPriceMatch[1] ?? "0", 10);
    const paid = Number.parseInt(forPriceMatch[3] ?? "0", 10);
    const free = total - paid;
    if (free > 0) {
      return `${free} ${normalizePeriodUnit(forPriceMatch[2] ?? "måned", free)} gratis`;
    }
  }

  const freeMatch = text.match(/\b(\d+)\s*(dag(?:er)?|uke(?:r)?|mnd|måned(?:er)?)\b[^.\n]{0,80}\bgratis\b/i);
  if (freeMatch === null) return "";

  const value = Number.parseInt(freeMatch[1] ?? "0", 10);
  if (value <= 0) return "";

  return `${value} ${normalizePeriodUnit(freeMatch[2] ?? "dag", value)} gratis`;
}

function normalizePeriodUnit(unit: string, value: number): string {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith("dag")) return value === 1 ? "dag" : "dager";
  if (normalized.startsWith("uke")) return value === 1 ? "uke" : "uker";
  return value === 1 ? "måned" : "måneder";
}

function buildTerms(raw: RawElkjopOffer): string {
  return [
    DEFAULT_TERMS,
    raw.heading,
    raw.description,
  ].filter((part) => part.length > 0).join("\n");
}

function extractDomains(text: string): string[] {
  const domains: string[] = [];
  const pattern = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})(?:\/[^\s<>"')]+)?/gi;

  for (const match of text.matchAll(pattern)) {
    const rawDomain = match[1] ?? "";
    const normalizedDomain = normalizeDomainInput(rawDomain);
    if (!normalizedDomain || BLOCKED_DOMAINS.has(normalizedDomain)) continue;
    domains.push(normalizedDomain);
  }

  return uniqueStrings(domains);
}

function readFirstTagText(html: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = html.match(pattern);
  return match?.[1] === undefined ? "" : normalizeText(stripHtml(match[1]));
}

function readFirstClassText(html: string, className: string): string {
  const pattern = new RegExp(
    `<[^>]+class="[^"]*\\b${escapeRegExp(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i",
  );
  const match = html.match(pattern);
  return match?.[1] === undefined ? "" : normalizeText(stripHtml(match[1]));
}

function readImageLabels(html: string): string[] {
  const labels: string[] = [];

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0] ?? "";
    const alt = readAttribute(tag, "alt");
    const name = readAttribute(tag, "name");
    if (alt) labels.push(alt);
    if (name) labels.push(name);
  }

  return uniqueStrings(labels.map(normalizeText));
}

function readAttribute(tag: string, attributeName: string): string {
  const pattern = new RegExp(`\\b${escapeRegExp(attributeName)}="([^"]*)"`, "i");
  const match = tag.match(pattern);
  return match?.[1] === undefined ? "" : normalizeText(stripHtml(match[1]));
}

function normalizeText(value: string): string {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/ö/g, "o")
    .replace(/ä/g, "a")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseLocalizedNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchHtml(
  url: string,
  proxyUrls: string[],
  logger: Logger,
): Promise<string> {
  const attempts = buildFetchAttempts(url, proxyUrls);
  let lastFailure = "no response";

  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index]!;

    if (attempt.proxyLabel !== undefined) {
      logger.info(`Elkjøp: blocked (${lastFailure}), retrying via ${attempt.proxyLabel}`);
    }

    let response;
    try {
      response = await gotScraping(attempt.url, {
        responseType: "text",
        throwHttpErrors: false,
        timeout: { request: attempt.proxyUrl === undefined ? 30_000 : 70_000 },
        ...(attempt.proxyUrl === undefined
          ? {}
          : {
            proxyUrl: attempt.proxyUrl,
            // ScraperAPI terminates TLS with its own certificate in proxy mode.
            https: { rejectUnauthorized: false },
          }),
        ...(attempt.headerGeneratorOptions === undefined
          ? {}
          : { headerGeneratorOptions: attempt.headerGeneratorOptions }),
      });
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "request failed";
      continue;
    }

    if (
      response.statusCode >= 200 &&
      response.statusCode < 300 &&
      !isVercelChallenge(response.body, response.headers)
    ) {
      return response.body;
    }

    lastFailure = `${response.statusCode} ${response.statusMessage}`;
    if (isVercelChallenge(response.body, response.headers)) {
      lastFailure += " (Vercel challenge)";
    }

    if (index < attempts.length - 1) {
      await sleep(500);
    }
  }

  throw new Error(`Elkjøp returned ${lastFailure}`);
}

type FetchAttempt = {
  url: string;
  headerGeneratorOptions?: {
    browsers: Array<{ name: "chrome"; minVersion: number }>;
    devices: Array<"desktop">;
    operatingSystems: Array<"windows">;
  };
  proxyUrl?: string;
  proxyLabel?: string;
};

function buildFetchAttempts(url: string, proxyUrls: string[]): FetchAttempt[] {
  const browserHeaderGeneratorOptions = {
    browsers: [{ name: "chrome" as const, minVersion: 120 }],
    devices: ["desktop" as const],
    operatingSystems: ["windows" as const],
  };

  return [
    { url },
    { url: appendQueryParameter(url, "utm_source", "cashbacknorge") },
    {
      url,
      headerGeneratorOptions: browserHeaderGeneratorOptions,
    },
    ...proxyUrls.map((proxyUrl, index) => ({
      url,
      headerGeneratorOptions: browserHeaderGeneratorOptions,
      proxyUrl,
      proxyLabel: `proxy ${index + 1}/${proxyUrls.length}`,
    })),
  ];
}

function appendQueryParameter(url: string, name: string, value: string): string {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set(name, value);
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function isVercelChallenge(
  body: string,
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return headers["x-vercel-mitigated"] === "challenge" ||
    body.includes("Vercel Security Checkpoint");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
