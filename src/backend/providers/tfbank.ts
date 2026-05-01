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

    if (domain === undefined || isRedirectDomain(domain)) {
      continue;
    }

    const discount = deal.discount.premium;

    if (discount === "" || discount === "0") {
      continue;
    }

    const merchantName = cleanMerchantName(deal.name);

    offers.push({
      provider: "tfbank",
      merchantName,
      domains: [domain],
      reward: `${discount}%`,
      sourceUrl: `https://tfbank.dealpass.no/deal/${deal.id}`,
      activationUrl: `https://portal.dealpass.no/api/deals/${deal.id}/activate`,
      terms: deal.disclaimer ?? "",
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
