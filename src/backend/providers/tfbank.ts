import type { CashbackOffer } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl } from "../../shared/cashback.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type DealpassDeal = {
  id: number;
  name: string;
  discount: { basic: number; premium: string; platinum: number };
  claim: { type: string; voucher?: { url?: string; code?: string | null } } | null;
  categories: { id: number; name: string }[];
  description: string;
  disclaimer: string;
};

type DealpassResponse = {
  deals: DealpassDeal[];
  summary: { total_deals_available: number };
};

export type FetchTfBankInput = {
  apiUrl: string;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

export async function fetchTfBank(
  input: FetchTfBankInput,
): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching TF Bank deals from ${input.apiUrl}`);

  const allDeals: DealpassDeal[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const url = `${input.apiUrl}?offset=${offset}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `TF Bank API returned ${response.status}: ${response.statusText}`,
      );
    }

    const body: unknown = await response.json();

    if (!isDealpassResponse(body)) {
      throw new Error("TF Bank API returned unexpected data format");
    }

    allDeals.push(...body.deals);

    if (body.deals.length < limit) {
      break;
    }

    offset += limit;
  }

  input.logger.info(`Fetched ${allDeals.length} total TF Bank deals`);

  const offers: CashbackOffer[] = [];

  for (const deal of allDeals) {
    const voucherUrl = deal.claim?.voucher?.url;

    if (voucherUrl === undefined || voucherUrl === null || voucherUrl.trim() === "") {
      continue;
    }

    const domain = extractDomain(voucherUrl);

    if (domain === undefined) {
      continue;
    }

    let finalDomains: string[];

    const slug = deal.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const overrideDomains = input.overrides.tfbank[slug];

    if (overrideDomains !== undefined && overrideDomains.length > 0) {
      finalDomains = overrideDomains;
    } else if (isRedirectDomain(domain)) {
      const resolved = await resolveRedirectDomain(voucherUrl, input.logger);
      finalDomains = resolved !== undefined ? [resolved] : [];
    } else {
      finalDomains = [domain];
    }

    if (finalDomains.length === 0) {
      input.logger.warn(`TF Bank deal has no resolvable domain: ${deal.name} (${voucherUrl})`);
      continue;
    }

    const discount = deal.discount.premium;

    if (discount === "" || discount === "0") {
      continue;
    }

    const merchantName = cleanMerchantName(deal.name);
    const firstDomain = finalDomains[0] ?? deal.name.toLowerCase();
    const searchParam = encodeURIComponent(firstDomain.replace(/\.(no|com|se)$/, ""));
    const dealUrl = `https://tfbank.dealpass.no/deal/${deal.id}?search=${searchParam}`;

    const voucherCode = deal.claim?.voucher?.code;
    const discountCode = typeof voucherCode === "string" && voucherCode.trim() !== ""
      ? voucherCode.trim()
      : undefined;

    offers.push({
      provider: "tfbank",
      merchantName,
      domains: finalDomains,
      reward: `${discount}%`,
      sourceUrl: dealUrl,
      activationUrl: dealUrl,
      terms: deal.disclaimer ?? "",
      ...(discountCode !== undefined ? { discountCode } : {}),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} TF Bank offers with domains`);
  return offers;
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
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });

      const location = response.headers.get("location");

      if (location === null) {
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
      logger.warn(`TF Bank: failed to follow redirect for ${currentUrl}`);
      break;
    }
  }

  return undefined;
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

function cleanMerchantName(name: string): string {
  return name
    .replace(/\s*[-–—]\s*inntil\s+\d+%\s*cashback/i, "")
    .replace(/\s*[-–—]\s*\d+%\s*rabatt.*$/i, "")
    .replace(/\s*[-–—]\s*Få\s+inntil\s+.*$/i, "")
    .trim();
}

function isDealpassResponse(value: unknown): value is DealpassResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return Array.isArray(record.deals);
}
