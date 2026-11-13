// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
// Shared crawler for Dealpass-based benefit programs (TF Bank, Santander, ...).
// Source: the public JSON list behind <bank>.dealpass.no (/ajax/deals,
// paginated with offset/limit). The site shows the "premium" discount to the
// banks' cardholders. Only deals with an online voucher URL are used; in-store
// ("dropin") deals without a shop URL have no domain to match.
import { Configuration, HttpCrawler, MemoryStorage, gotScraping } from "crawlee";
import type { CashbackOffer, CashbackProvider, OfferPromotion } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl, stripHtml } from "../../shared/cashback.js";
import { readFreePromotion } from "../../shared/free-promotions.js";
import { extractPercentageValues, extractUpToPercentageReward, formatRewardNumber } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type DealpassDeal = {
  id: number;
  name: string;
  supplier?: { name?: string | null; website?: string | null } | null;
  discount: { basic: number | string; premium: number | string; platinum: number | string };
  claim: { type: string; voucher?: { url?: string | null; code?: string | null } } | null;
  categories: { id: number; name: string }[];
  description: string | null;
  disclaimer: string | null;
  expires?: string | null;
};

type DealpassResponse = {
  deals: DealpassDeal[];
};

export type FetchDealpassInput = {
  provider: CashbackProvider;
  label: string;
  /** e.g. "https://tfbank.dealpass.no" */
  siteBaseUrl: string;
  apiUrl: string;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
  /** Upper bound on API pages (50 deals each). */
  maxPages?: number;
};

const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 30;

export async function fetchDealpass(
  input: FetchDealpassInput,
): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching ${input.label} deals from ${input.apiUrl}`);
  const allDeals = await fetchDeals(input);
  input.logger.info(`Fetched ${allDeals.length} total ${input.label} deals`);

  const offers: CashbackOffer[] = [];
  const now = Date.parse(input.generatedAt);

  for (const deal of allDeals) {
    const voucherUrl = deal.claim?.voucher?.url;

    if (voucherUrl === undefined || voucherUrl === null || voucherUrl.trim() === "") {
      continue;
    }

    const expires = deal.expires ? Date.parse(deal.expires.replace(" ", "T")) : Number.NaN;
    if (Number.isFinite(expires) && Number.isFinite(now) && expires + 24 * 60 * 60 * 1000 <= now) {
      continue;
    }

    const domain = extractDomain(voucherUrl);

    if (domain === undefined) {
      continue;
    }

    let finalDomains: string[];

    const slug = deal.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const overrideDomains = (input.overrides[input.provider] ?? {})[slug];

    if (overrideDomains !== undefined && overrideDomains.length > 0) {
      finalDomains = overrideDomains;
    } else if (isRedirectDomain(domain)) {
      const resolved = await resolveRedirectDomain(voucherUrl, input.label, input.logger);
      finalDomains = resolved !== undefined ? [resolved] : [];
    } else if (isThirdPartyPlatformDomain(domain)) {
      // A ticket shop or hotel booking engine sells for many businesses; the
      // deal only belongs on the supplier's own site, when Dealpass names one.
      const website = extractDomain(deal.supplier?.website ?? "");
      finalDomains = website !== undefined && !isRedirectDomain(website) && !isThirdPartyPlatformDomain(website)
        ? [website]
        : [];
    } else {
      finalDomains = [domain];
    }

    if (finalDomains.length === 0) {
      input.logger.warn(`${input.label} deal has no resolvable domain: ${deal.name} (${voucherUrl})`);
      continue;
    }

    const reward = readDealReward(deal);
    if (reward === undefined) {
      if (readPremiumDiscount(deal) !== undefined) {
        input.logger.warn(`${input.label} deal ${deal.id} (${deal.name}): 100 % discount without a recognisable free offer, skipping`);
      }
      continue;
    }

    const merchantName = cleanMerchantName(deal.name, deal.supplier?.name ?? "");
    const firstDomain = finalDomains[0] ?? deal.name.toLowerCase();
    const searchParam = encodeURIComponent(firstDomain.replace(/\.(no|com|se)$/, ""));
    const dealUrl = `${input.siteBaseUrl}/deal/${deal.id}?search=${searchParam}`;

    const voucherCode = deal.claim?.voucher?.code;
    const discountCode = typeof voucherCode === "string" && voucherCode.trim() !== ""
      ? voucherCode.trim()
      : undefined;

    offers.push({
      provider: input.provider,
      merchantName,
      domains: finalDomains,
      reward: reward.reward,
      ...(reward.promotion !== undefined ? { promotion: reward.promotion } : {}),
      sourceUrl: dealUrl,
      activationUrl: dealUrl,
      terms: buildTerms(deal, merchantName),
      ...(discountCode !== undefined ? { discountCode } : {}),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} ${input.label} offers with domains`);
  return offers;
}

// TF Bank and Santander share one HTTP/2 server; Daily crawl failed on a
// GOAWAY ("New streams cannot be created after receiving a GOAWAY") while
// both programmes were paginated at once. The small JSON API is fetched over
// HTTP/1.1 with retries instead. Certificate checks stay on.
async function fetchDeals(input: FetchDealpassInput): Promise<DealpassDeal[]> {
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;
  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  const pages = new Map<number, DealpassDeal[]>();
  const failures: string[] = [];
  let pageLimitReached = false;

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: maxPages,
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 30,
    ignoreSslErrors: false,
    useSessionPool: false,
    // Let error pages reach the handler so their status is reported.
    additionalMimeTypes: ["text/plain"],
    preNavigationHooks: [(_context, gotOptions) => {
      gotOptions.http2 = false;
      gotOptions.headers = { ...gotOptions.headers, Accept: "application/json" };
    }],
    requestHandler: async ({ request, response, body, crawler: running }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        if (status !== 429 && status < 500) request.noRetry = true;
        throw new Error(`HTTP ${status}`);
      }
      let value: unknown;
      try {
        value = JSON.parse(body.toString());
      } catch (error) {
        request.noRetry = true;
        throw new Error(`invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      }
      if (!isDealpassResponse(value)) {
        request.noRetry = true;
        throw new Error("unexpected data format (no deals array)");
      }
      const offset = Number(request.userData.offset);
      pages.set(offset, value.deals);
      if (value.deals.length >= PAGE_SIZE) {
        const nextOffset = offset + PAGE_SIZE;
        if (nextOffset / PAGE_SIZE >= maxPages) {
          pageLimitReached = true;
        } else {
          await running.addRequests([{ url: pageUrl(input.apiUrl, nextOffset), userData: { offset: nextOffset } }]);
        }
      }
    },
    failedRequestHandler: async ({ request }, error) => {
      failures.push(`${request.url} failed after ${request.retryCount + 1} attempt(s): ${error.message.slice(0, 300)}`);
    },
  }, config);

  await crawler.run([{ url: pageUrl(input.apiUrl, 0), userData: { offset: 0 } }]);

  if (failures.length > 0) {
    throw new Error(`${input.label} API: ${failures.join("; ")}`);
  }
  if (pageLimitReached) {
    throw new Error(`${input.label} API: more than ${maxPages} pages of ${PAGE_SIZE} deals; catalogue would be incomplete`);
  }
  if (!pages.has(0)) {
    throw new Error(`${input.label} API: no response for ${pageUrl(input.apiUrl, 0)}`);
  }
  return [...pages.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, deals]) => deals);
}

function pageUrl(apiUrl: string, offset: number): string {
  const url = new URL(apiUrl);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(PAGE_SIZE));
  return url.toString();
}

function readPremiumDiscount(deal: DealpassDeal): number | undefined {
  const value = Number(String(deal.discount?.premium ?? "").trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

// The structured premium rate is what the site shows. Its texts say whether
// that rate is a maximum ("Booking.com – inntil 4% cashback"); a 100 % deal is
// a free trial or gift ("Lytt og les gratis i 8 uker"), not money back.
function readDealReward(deal: DealpassDeal): { reward: string; promotion?: OfferPromotion } | undefined {
  const premium = readPremiumDiscount(deal);
  if (premium === undefined) return undefined;
  if (premium >= 100) {
    const promotion = readFreePromotion(deal.name, cleanText(deal.description ?? ""));
    if (promotion === undefined) return undefined;
    return { reward: promotion.priceNok === 0 ? "0 kr totalsum" : "Prøvetilbud", promotion };
  }
  const sentences = `${deal.name}\n${cleanText(deal.description ?? "")}\n${cleanText(deal.disclaimer ?? "")}`
    .split(SENTENCE_BREAK);
  const isUpTo = sentences.some((sentence) =>
    extractPercentageValues(sentence).includes(premium) &&
    extractUpToPercentageReward(sentence).startsWith("opptil"));
  return { reward: `${isUpTo ? "opptil " : ""}${formatRewardNumber(premium)} %` };
}

function buildTerms(deal: DealpassDeal, merchantName: string): string {
  const name = deal.name.replace(/\s+/g, " ").trim();
  const disclaimer = cleanText(deal.disclaimer ?? "");
  const parts = [
    // The headline carries the benefit when the name is more than the shop
    // ("Hurtigruten Expeditions 10% + 100€ kreditt om bord").
    name !== merchantName ? name : "",
    disclaimer || summarizeText(benefitSentences(cleanText(deal.description ?? "")), 600),
    deal.expires ? `Gyldig til ${deal.expires.slice(0, 10).split("-").reverse().join(".")}.` : "",
  ];
  return [...new Set(parts.filter(Boolean))].join("\n");
}

// A sentence ends before a capital letter, not inside "kr. 1290,-".
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-ZÆØÅ"«*])|\n+/;

function cleanText(value: string): string {
  return stripHtml(value)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// Without a disclaimer, only the description's sentences about the benefit
// and how to use it; the rest is marketing copy.
function benefitSentences(value: string): string {
  return value
    .split(SENTENCE_BREAK)
    .filter((sentence) => /\d\s*%|\brabatt|\bgratis\b|\bkode\b|rabattkode|\bgjelder\b|\btilbud/i.test(sentence))
    .join(" ");
}

// Whole sentences only; never cut a word.
function summarizeText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const sentences = value.split(SENTENCE_BREAK);
  let summary = "";
  for (const sentence of sentences) {
    if ((summary ? summary.length + 1 : 0) + sentence.length > maxLength) break;
    summary = summary ? `${summary} ${sentence}` : sentence;
  }
  if (summary) return summary;
  const cut = value.slice(0, maxLength);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trim()}…`;
}

function extractDomain(url: string): string | undefined {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const hostname = parsed.hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return undefined;
  }
}

const REDIRECT_DOMAINS = new Set([
  "clk.tradedoubler.com",
  "www.getgifted.com",
  "getgifted.com",
  "click.linksynergy.com",
  "track.adtraction.com",
  "dpbolvw.net",
  "anrdoezrs.net",
  "kqzyfj.com",
  "tkqlhce.com",
  "awin1.com",
  "prf.hn",
]);

function isRedirectDomain(domain: string): boolean {
  return REDIRECT_DOMAINS.has(domain) || domain.endsWith(".tradedoubler.com") || domain.endsWith(".adtraction.com");
}

async function resolveRedirectDomain(
  url: string,
  label: string,
  logger: Logger,
  maxRedirects = 8,
): Promise<string | undefined> {
  const embedded = extractEmbeddedUrl(url);

  if (embedded !== undefined) {
    return embedded;
  }

  let currentUrl = url;

  for (let i = 0; i < maxRedirects; i++) {
    try {
      const response = await gotScraping(currentUrl, {
        method: "HEAD",
        followRedirect: false,
        responseType: "text",
        throwHttpErrors: false,
        timeout: { request: 5_000 },
      });

      const location = readHeader(response.headers.location);

      if (location === undefined) {
        break;
      }

      const resolved = parseUrl(location) ?? parseUrl(new URL(location, currentUrl).toString());

      if (resolved === undefined) {
        break;
      }

      const hostname = normalizeDomainInput(resolved.hostname);

      if (!isRedirectDomain(hostname)) {
        return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
      }

      currentUrl = resolved.toString();
    } catch {
      logger.warn(`${label}: failed to follow redirect for ${currentUrl}`);
      break;
    }
  }

  return undefined;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function extractEmbeddedUrl(url: string): string | undefined {
  const parsed = parseUrl(url);

  if (parsed === undefined) {
    return undefined;
  }

  const paramNames = ["url", "dest", "destination", "redirect", "redirect_url", "target", "u"];

  for (const param of paramNames) {
    const value = parsed.searchParams.get(param);

    if (value === null) {
      continue;
    }

    const embedded = parseUrl(value);

    if (embedded !== undefined && !isRedirectDomain(normalizeDomainInput(embedded.hostname))) {
      const hostname = normalizeDomainInput(embedded.hostname);
      return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    }
  }

  return undefined;
}

const BENEFIT_TEXT = /\d\s*%|\bgratis\b|\brabatt\b|\bcashback\b|\bkreditt\b/i;

// Deal names are sometimes headlines ("AVIS - Få inntil 20% rabatt på alle
// bookinger", "Lytt og les gratis i 8 uker med Nextory og TF Bank Mastercard").
function cleanMerchantName(name: string, supplierName: string): string {
  let cleaned = name.replace(/\s+/g, " ").trim();
  const separated = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (separated?.[1] && separated[2] && BENEFIT_TEXT.test(separated[2])) {
    cleaned = separated[1].trim();
  }
  if (!BENEFIT_TEXT.test(cleaned)) return cleaned;

  const supplier = supplierName
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+(?:AS|ASA|AB|A\/S|Ltd\.?|GmbH)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (supplier.length >= 2 && cleaned.toLowerCase().includes(supplier.toLowerCase())) {
    return supplier;
  }
  const beforeRate = cleaned.split(/\s+\d+(?:[,.]\d+)?\s*%/)[0]?.trim();
  return beforeRate || cleaned;
}

// Ticket shops and hotel booking engines that sell for many businesses.
const THIRD_PARTY_PLATFORM_DOMAINS = [
  "billetto.no", "billetto.com", "synxis.com", "ticketmaster.no", "ticketmaster.com",
  "eventbrite.com", "eventbrite.no", "tikkio.com", "ticketco.events", "hoopla.no",
  "checkin.no", "facebook.com", "instagram.com",
];

function isThirdPartyPlatformDomain(domain: string): boolean {
  return THIRD_PARTY_PLATFORM_DOMAINS.some((platform) => domain === platform || domain.endsWith(`.${platform}`));
}

function isDealpassResponse(value: unknown): value is DealpassResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return Array.isArray(record.deals);
}
