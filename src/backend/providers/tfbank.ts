import type { CashbackOffer } from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

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

    const finalDomains = isRedirectDomain(domain)
      ? inferDomainsFromName(deal.name)
      : [domain];

    if (finalDomains.length === 0) {
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
]);

function isRedirectDomain(domain: string): boolean {
  return REDIRECT_DOMAINS.has(domain);
}

function inferDomainsFromName(name: string): string[] {
  const cleaned = name.toLowerCase().trim();

  if (/^[\w.-]+\.[a-z]{2,}$/.test(cleaned)) {
    return [cleaned];
  }

  const slug = cleaned
    .replace(/['']/g, "")
    .replace(/&/g, "and")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/ö/g, "o")
    .replace(/ä/g, "a")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]/g, "")
    .trim();

  if (slug.length === 0) {
    return [];
  }

  return [`${slug}.no`, `${slug}.com`];
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
