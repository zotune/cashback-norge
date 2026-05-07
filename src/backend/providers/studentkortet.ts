import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const LIST_URL = "https://studentkortet.no/rabatter";
const DEFAULT_TERMS = "Krever Studentkortet-medlemskap (gratis for studenter).";
const DETAIL_CONCURRENCY = 6;

const SKIP_CATEGORIES = new Set(["lokale"]);

const SKIP_HOSTNAMES = new Set([
  "studentkortet.no",
  "facebook.com",
  "instagram.com",
  "google.com",
  "youtube.com",
  "apps.apple.com",
  "play.google.com",
  "linkedin.com",
]);

export type CrawlStudentkortetInput = {
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
  startUrl: string;
};

type RawOffer = {
  name: string;
  slug: string;
  category: string;
  rewardText: string;
  sourceUrl: string;
  terms: string;
  redirectDomain: string;
};

export async function crawlStudentkortet(input: CrawlStudentkortetInput): Promise<CashbackOffer[]> {
  input.logger.info("Studentkortet: fetching listing page...");

  const html = await fetchHtml(input.startUrl);
  const rawOffers = extractOffers(html);
  input.logger.info(`Studentkortet: found ${rawOffers.length} offers on listing page`);

  await enrichDetails(rawOffers, input.logger);

  const offers: CashbackOffer[] = [];
  let lookupCount = 0;
  let overrideCount = 0;
  let redirectCount = 0;
  let skippedNoReward = 0;

  for (const raw of rawOffers) {
    const reward = parseReward(raw.rewardText);
    if (!reward) {
      skippedNoReward++;
      continue;
    }

    const overrideDomains = input.overrides.studentkortet?.[raw.slug] ?? [];
    let domains = overrideDomains.map(normalizeDomainInput);
    if (domains.length > 0) {
      overrideCount++;
    }

    if (domains.length === 0 && raw.redirectDomain) {
      domains = [raw.redirectDomain];
      redirectCount++;
    }

    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, raw.name);
      if (domains.length > 0) lookupCount++;
    }

    if (domains.length === 0) {
      input.logger.warn(`Studentkortet: no domain for "${raw.name}" (${raw.slug})`);
      continue;
    }

    offers.push({
      provider: "studentkortet",
      merchantName: raw.name,
      domains: uniqueStrings(domains),
      reward,
      sourceUrl: raw.sourceUrl,
      activationUrl: raw.sourceUrl,
      terms: raw.terms || DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Studentkortet: ${redirectCount} via redirect, ${lookupCount} via lookup, ${overrideCount} via overrides, ${skippedNoReward} skipped (no reward)`);
  input.logger.info(`Studentkortet: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function extractOffers(html: string): RawOffer[] {
  const offers: RawOffer[] = [];

  // Match offer blocks: each has a link to /rabatter/{cat}/{subcat}/{slug}/ and an offer-title div
  const offerPattern = /<a\s+href="\/rabatter\/([^/]+)\/([^/]+)\/([^/]+)\/"[^>]*>[\s\S]*?<img[^>]+alt="([^"]*)\s*logo"[^>]*>[\s\S]*?<div\s+class="offer-title"[^>]*>([^<]*)<\/div>/gi;

  for (const match of html.matchAll(offerPattern)) {
    const category = match[1]!;
    const slug = match[3]!;
    const name = decodeHtmlEntities(match[4]!.trim());
    const rewardText = decodeHtmlEntities(match[5]!.trim());

    if (SKIP_CATEGORIES.has(category)) continue;
    if (!name) continue;

    offers.push({
      name,
      slug,
      category,
      rewardText,
      sourceUrl: `https://studentkortet.no/rabatter/${category}/${match[2]}/${slug}/`,
      terms: "",
      redirectDomain: "",
    });
  }

  // Deduplicate by slug (some offers appear in promoted sections too)
  const bySlug = new Map<string, RawOffer>();
  for (const offer of offers) {
    if (!bySlug.has(offer.slug)) {
      bySlug.set(offer.slug, offer);
    }
  }

  return [...bySlug.values()];
}

function parseReward(text: string): string {
  // "Spar 10%" → "10 %"
  // "Spar 500 kr" / "Spar 500kr" → "500 kr"
  // "Spar 40,-" / "Spar 2400,-" → "40 kr" / "2400 kr"
  // "Opptil 26%" → "opptil 26 %"
  // "20% rabatt" → "20 %"
  // "Spar 5-10 %" → "5-10 %"

  const pct = extractPercentageReward(text);
  if (pct) {
    const lower = text.toLowerCase();
    if (lower.includes("opptil") || lower.includes("opp til")) {
      return `opptil ${pct}`;
    }
    return pct;
  }

  const kr = extractKrReward(`${text} rabatt`);
  if (kr) return kr;

  // Handle "Spar 40,-" pattern
  const dashMatch = text.match(/(\d[\d\s]*)(?:,-|,-\s)/);
  if (dashMatch) {
    const value = dashMatch[1]!.replace(/\s/g, "");
    return `${value} kr`;
  }

  return "";
}

async function enrichDetails(offers: RawOffer[], logger: Logger): Promise<void> {
  let completed = 0;

  async function enrich(offer: RawOffer): Promise<void> {
    try {
      const html = await fetchHtml(offer.sourceUrl);
      const terms = extractTerms(html);
      if (terms) {
        offer.terms = terms;
      }
      // Extract redirect URL domain from the videresending page
      const redirectUrl = extractRedirectLink(html);
      if (redirectUrl) {
        const domain = await resolveRedirectDomain(redirectUrl);
        if (domain) {
          offer.redirectDomain = domain;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`Studentkortet detail failed for ${offer.slug}: ${message}`);
    } finally {
      completed++;
      process.stdout.write(`\r  Studentkortet detail ${completed}/${offers.length}: ${offer.slug.slice(0, 50)}  `);
    }
  }

  for (let i = 0; i < offers.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(offers.slice(i, i + DETAIL_CONCURRENCY).map(enrich));
  }

  if (offers.length > 0) process.stdout.write("\n");
}

function extractTerms(html: string): string {
  const match = html.match(/class="ac-content"[^>]*>([\s\S]*?)<\/div>/i);
  if (!match?.[1]) return "";

  const raw = match[1]
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  if (!raw) return "";
  return `${raw}\nKrever Studentkortet-medlemskap.`;
}

function extractRedirectLink(html: string): string {
  // Detail pages contain a link to /videresending/{slug}/{slug}/
  const match = html.match(/href="(\/videresending\/[^"]+)"/i);
  if (!match?.[1]) return "";
  return `https://studentkortet.no${match[1]}`;
}

const AFFILIATE_HOSTNAMES = new Set([
  "awin1.com", "www.awin1.com",
  "clk.tradedoubler.com", "tradedoubler.com",
  "track.adtraction.com", "adtraction.com",
  "partner-ads.com", "www.partner-ads.com",
  "click.linksynergy.com", "linksynergy.com",
  "prf.hn", "track.webgains.com",
  "ad.doubleclick.net", "clickserve.dartsearch.net",
]);

async function resolveRedirectDomain(redirectUrl: string): Promise<string> {
  try {
    const html = await fetchHtml(redirectUrl);
    // Extract URL from redirectAfterSeconds("https://...")
    const match = html.match(/redirectAfterSeconds\("([^"]+)"/);
    if (!match?.[1]) return "";

    const targetUrl = match[1].replace(/&amp;/g, "&");
    const url = new URL(targetUrl);
    const hostname = url.hostname.replace(/^www\./, "");

    // Skip affiliate network URLs
    if (AFFILIATE_HOSTNAMES.has(hostname) || AFFILIATE_HOSTNAMES.has(url.hostname)) {
      return "";
    }
    if (SKIP_HOSTNAMES.has(hostname)) return "";

    return hostname;
  } catch {
    return "";
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

async function fetchHtml(url: string): Promise<string> {
  const response = await gotScraping(url, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
    followRedirect: true,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Studentkortet returned ${response.statusCode}: ${response.statusMessage}`);
  }

  return response.body;
}
