// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  type OfferPromotion,
  type RewardCalculationRules,
  normalizeDomainInput,
  toBaseDomain,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { readFreePromotion } from "../../shared/free-promotions.js";
import { extractExplicitTotalPriceReward, extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

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
  detailRewardText: string;
};

export async function crawlStudentkortet(input: CrawlStudentkortetInput): Promise<CashbackOffer[]> {
  input.logger.info("Studentkortet: fetching listing page...");

  const html = await fetchHtml(input.startUrl);
  // Detail and redirect pages live on the listing's own origin.
  const origin = new URL(input.startUrl).origin;
  const rawOffers = extractOffers(html, origin);
  input.logger.info(`Studentkortet: found ${rawOffers.length} offers on listing page`);

  await enrichDetails(rawOffers, input.logger, origin);

  const offers: CashbackOffer[] = [];
  let lookupCount = 0;
  let overrideCount = 0;
  let redirectCount = 0;
  let skippedNoReward = 0;

  for (const raw of rawOffers) {
    // A free trial ("90 dager gratis") is a free period, not a discount.
    const promotion = readTrialPromotion(raw.rewardText, raw.terms);
    const reward = promotion ? "0 kr totalsum" : parseReward(raw.detailRewardText || raw.rewardText);
    if (!reward) {
      skippedNoReward++;
      continue;
    }
    const rewardCalculation = promotion ? undefined : readMinimumPurchase(raw.terms);

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
      // Other providers' data can carry a tracking host for the same name
      // (Autodude: adt291.com); it is never the merchant's domain.
      domains = lookupDomains(input.domainLookup, raw.name).filter((domain) => !isTrackingHost(domain));
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
      ...(rewardCalculation ? { rewardCalculation } : {}),
      ...(promotion ? { promotion } : {}),
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

function extractOffers(html: string, origin: string): RawOffer[] {
  const offers: RawOffer[] = [];

  // One card per offer: <div class="offer panel"> with a logo link to
  // /rabatter/{cat}/{subcat}/{slug}/, "<Name> logo" alt text and an
  // offer-title. Parse each card on its own: promoted navbar logos (alt
  // "Logo", no title) once made a page-wide match swallow the next card and
  // drop Nelly.
  for (const card of html.split(/class="offer panel"/).slice(1)) {
    const link = card.match(/href="\/rabatter\/([^/"]+)\/([^/"]+)\/([^/"]+)\/"/);
    const alt = card.match(/<img[^>]+alt="([^"]*)"/);
    const title = card.match(/<div\s+class="offer-title"[^>]*>([^<]*)<\/div>/);
    if (!link || !title) continue;
    // Paths can carry entities ("tjenester/&#248;konomi/revolut"): the
    // literal entity in the URL returned HTTP 400.
    const category = decodeHtmlEntities(link[1]!);
    const subcategory = decodeHtmlEntities(link[2]!);
    const slug = decodeHtmlEntities(link[3]!);
    const name = decodeHtmlEntities((alt?.[1] ?? "").replace(/\s*logo\s*$/i, "").trim());
    const rewardText = decodeHtmlEntities(title[1]!.trim());

    if (SKIP_CATEGORIES.has(category)) continue;
    if (!name) continue;

    offers.push({
      name,
      slug,
      category,
      rewardText,
      sourceUrl: encodeURI(`${origin}/rabatter/${category}/${subcategory}/${slug}/`),
      terms: "",
      redirectDomain: "",
      detailRewardText: "",
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

  // "3 år for kun 100 kr" is the price of the subscription, not money off.
  const price = text.match(/\bfor\s+(?:kun\s+|bare\s+)?(?:kr\.?\s*)?(\d[\d\s]*)\s*(?:kr|kroner|,-)/i);
  if (price && !/\b(?:spar|rabatt|få)\b/i.test(text)) {
    return `${price[1]!.replace(/\s/g, "")} kr totalsum`;
  }
  const statedPrice = extractExplicitTotalPriceReward(text);
  if (statedPrice) return statedPrice;

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

async function enrichDetails(offers: RawOffer[], logger: Logger, origin: string): Promise<void> {
  let completed = 0;

  async function enrich(offer: RawOffer): Promise<void> {
    try {
      const html = await fetchHtml(offer.sourceUrl);
      const terms = extractTerms(html);
      if (terms) {
        offer.terms = terms;
      }
      // Extract reward range from codebutton labels on detail page
      const detailReward = extractDetailReward(html);
      if (detailReward) {
        offer.detailRewardText = detailReward;
      }
      // Extract redirect URL domain from the videresending page
      const redirectUrl = extractRedirectLink(html, origin);
      if (redirectUrl) {
        const domain = await resolveRedirectDomain(redirectUrl, logger);
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
  const contentMatches = [...html.matchAll(/class="ac-content"[^>]*>([\s\S]*?)<\/div>/gi)];
  if (contentMatches.length === 0) return "";

  // Extract codebutton labels to use as headers for multi-tier offers
  const buttonLabels = [...html.matchAll(/class="[^"]*codebutton[^"]*"[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((m) => {
      const text = m[1]!.replace(/<[^>]+>/g, " ").trim();
      return decodeHtmlEntities(text.replace(/Vis rabattkode\s*/i, "").trim());
    })
    // Deduplicate (buttons appear twice — mobile + desktop)
    .filter((label, i, arr) => arr.indexOf(label) === i);

  const sections: string[] = [];

  for (let i = 0; i < contentMatches.length; i++) {
    const raw = contentMatches[i]![1]!
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");

    if (!raw) continue;

    // Add codebutton label as header if there are multiple tiers
    if (contentMatches.length > 1 && buttonLabels[i]) {
      sections.push(`${buttonLabels[i]}:\n${raw}`);
    } else {
      sections.push(raw);
    }
  }

  if (sections.length === 0) return "";
  return `${sections.join("\n\n")}\nKrever Studentkortet-medlemskap.`;
}

function extractDetailReward(html: string): string {
  // Extract percentage values from codebutton elements like:
  // <button class="codebutton ...">Vis rabattkode 25% Rabatt</button>
  const codebuttonMatches = [...html.matchAll(/class="[^"]*codebutton[^"]*"[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((m) => m[1]!.replace(/<[^>]+>/g, " ").trim());

  const percentages = new Set<number>();
  // "Opptil 15% Rabatt" is a maximum and stays one in the combined range.
  const upTo = codebuttonMatches.some((text) => /\b(?:opptil|opp til|inntil)\b/i.test(text));

  for (const text of codebuttonMatches) {
    for (const m of text.matchAll(/(\d{1,3})\s*%/g)) {
      const value = Number(m[1]);
      if (value > 0 && value <= 100) {
        percentages.add(value);
      }
    }
  }

  if (percentages.size <= 1) return "";

  const sorted = [...percentages].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  if (min === max) return "";

  return `${upTo ? "Opptil" : "Spar"} ${min}-${max}%`;
}

function extractRedirectLink(html: string, origin: string): string {
  // Detail pages contain a link to /videresending/{slug}/{slug}/
  const match = html.match(/href="(\/videresending\/[^"]+)"/i);
  if (!match?.[1]) return "";
  return `${origin}${match[1]}`;
}

// Affiliate networks and their tracking hosts (including per-merchant
// subdomains such as edblad.sjv.io, arket.prf.hn or go.adt291.com). Their
// host is never the merchant's domain; the destination may be in a query or
// path parameter, otherwise the merchant is looked up by name.
const TRACKING_HOST_SUFFIXES = [
  "awin1.com", "tradedoubler.com", "adtraction.com", "partner-ads.com", "linksynergy.com",
  "prf.hn", "webgains.com", "doubleclick.net", "dartsearch.net", "tradetracker.net",
  "trackmytarget.com", "sjv.io", "pxf.io", "evyy.net", "a9yw.net", "tkqlhce.com",
  "anrdoezrs.net", "jdoqocy.com", "kqzyfj.com", "dpbolvw.net", "emjcd.com", "ftjcfx.com",
  "lduhtrp.net", "qksrv.net", "addrevenue.io", "skimresources.com", "go2cloud.org",
];
// Adtraction (go.adt291.com) and Impact custom domains (imp.i222351.net).
const TRACKING_HOST_PATTERNS = [/^(?:go\.)?adt\d+\.(?:com|net)$/, /^(?:imp\.)?i\d+\.net$/];
const DESTINATION_PARAMS = ["ued", "url", "u", "murl", "destination", "dest", "redirect", "htmlurl", "r"];

export function isTrackingHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return TRACKING_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ||
    TRACKING_HOST_PATTERNS.some((pattern) => pattern.test(host) || pattern.test(host.split(".").slice(-2).join(".")));
}

/** The merchant domain behind a Studentkortet redirect target, or "". */
export function merchantDomainFromTarget(targetUrl: string): string {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return "";
  }
  if (isTrackingHost(url.hostname)) {
    const candidates = DESTINATION_PARAMS.map((name) => url.searchParams.get(name) ?? "");
    // Partnerize: /click/camref:…/destination:https%3A%2F%2F…
    const partnerize = url.pathname.match(/\/destination:([^/]+)/)?.[1];
    if (partnerize) candidates.unshift(safeDecode(partnerize));
    for (const candidate of candidates) {
      if (/^https?:\/\//i.test(candidate)) return merchantDomainFromTarget(candidate);
      // Adtraction also takes a bare "voltfashion.com/no/…".
      if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|$)/i.test(candidate)) return merchantDomainFromTarget(`https://${candidate}`);
    }
    return "";
  }
  const hostname = normalizeDomainInput(url.hostname);
  if (SKIP_HOSTNAMES.has(hostname) || SKIP_HOSTNAMES.has(toBaseDomain(hostname))) return "";
  // A merchant's own tracking/landing subdomain (to.haglofs.com,
  // partner.bergwatches.no, no-pin.loccitane.com) stands for the whole shop.
  return toBaseDomain(hostname);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveRedirectDomain(redirectUrl: string, logger: Logger): Promise<string> {
  let html: string;
  try {
    html = await fetchHtml(redirectUrl);
  } catch (error) {
    logger.warn(`Studentkortet: redirect page ${redirectUrl} failed: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
  // Extract URL from redirectAfterSeconds("https://...")
  const match = html.match(/redirectAfterSeconds\("([^"]+)"/);
  if (!match?.[1]) return "";
  return merchantDomainFromTarget(match[1].replace(/&amp;/g, "&"));
}

// "6 uker gratis", "90 dager gratis": a free period on a subscription.
function readTrialPromotion(rewardText: string, terms: string): OfferPromotion | undefined {
  if (!/\b\d+\s*(?:dager?|uker?|måneder?|mnd)\s+gratis\b/i.test(rewardText)) return undefined;
  const promotion = readFreePromotion(rewardText, terms);
  return promotion?.priceNok === 0 ? promotion : undefined;
}

// "Gjelder ved kjøp over 500 kr", "12% på ordre over 200NOK", "minimumsordre
// på 700kr", "minst 299 kr". Only kroner; a free-shipping threshold or a
// minimum in another currency or of products/persons is not this rule. Tiers
// with different thresholds leave the rule unset.
function readMinimumPurchase(terms: string): RewardCalculationRules | undefined {
  const rules = new Map<string, RewardCalculationRules>();
  for (const line of terms.split("\n")) {
    if (/\b(?:frakt|levering)\b/i.test(line)) continue;
    const amount = "(\\d{1,3}(?:[ .]\\d{3})+|\\d+)\\s*(?:kr\\b|kroner\\b|nok\\b|,-)";
    const exclusive = line.match(new RegExp(`\\b(?:kjøp|ordre|bestilling(?:er)?|handler|kjøper)\\s+(?:på\\s+|for\\s+)?over\\s+(?:kr\\.?\\s*)?${amount}`, "i"));
    const inclusive = line.match(new RegExp(`\\b(?:minimumsordre\\s+på|minimum\\s+ordre|ordre\\s+på\\s+minimum|minst|minimum)\\s+(?:kr\\.?\\s*)?${amount}`, "i")) ??
      line.match(new RegExp(`\\b${amount}\\s+eller\\s+mer\\b`, "i"));
    const match = exclusive ?? inclusive;
    if (!match) continue;
    const minimumPurchaseNok = Number.parseInt(match[1]!.replace(/[ .]/g, ""), 10);
    if (!(minimumPurchaseNok > 0)) continue;
    const rule = exclusive ? { minimumPurchaseNok, minimumPurchaseExclusive: true } : { minimumPurchaseNok };
    rules.set(JSON.stringify(rule), rule);
  }
  return rules.size === 1 ? [...rules.values()][0] : undefined;
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
    throw new Error(`Studentkortet: GET ${url} returned HTTP ${response.statusCode} ${response.statusMessage ?? ""}`.trim());
  }

  return response.body;
}
