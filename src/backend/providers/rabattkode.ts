// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
// Source: rabattkode.no's public Firestore collections `discounts` (codes) and
// `companies` (store names). The numeric `discount_amount` is a sort value
// that is often wrong for kr discounts and free shipping ("Få 300kr i
// avslag" is stored as 15), so the reward is read from the code's own title.
import { gotScraping } from "crawlee";
import type { CashbackOffer, RewardCalculationRules } from "../../shared/cashback.js";
import { extractKrReward, extractUpToPercentageReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const FIRESTORE_BASE_URL =
  "https://firestore.googleapis.com/v1/projects/rabattkode-784d5/databases/(default)/documents";
const PAGE_SIZE = 300;
const MAX_PAGES = 10;

// Domains that rabattkode stores with wrong TLD
const DOMAIN_CORRECTIONS: Record<string, string> = {
  "scandichotels.no": "scandichotels.com",
};

const CC_SUBDOMAINS = new Set(["no", "se", "dk", "fi", "de", "fr", "es", "it", "nl", "uk", "us", "eu"]);

export type CrawlRabattkodeInput = {
  generatedAt?: string;
  logger?: Logger;
  /** Firestore documents base URL; tests point it at a local server. */
  firestoreBaseUrl?: string;
};

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
  referenceValue?: string;
};

type FirestoreDoc = {
  name?: string;
  fields?: Record<string, FirestoreValue | undefined>;
};

export async function crawlRabattkode(input: CrawlRabattkodeInput = {}): Promise<CashbackOffer[]> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const now = Date.parse(generatedAt);
  const baseUrl = input.firestoreBaseUrl ?? FIRESTORE_BASE_URL;

  const docs = await fetchCollection(baseUrl, "discounts");
  // Store names are cosmetic; a failed lookup falls back to the domain.
  const companyNames = await fetchCollection(baseUrl, "companies")
    .then((companies) => new Map(companies.flatMap((company) => {
      const name = readString(company.fields?.name).trim();
      return company.name && name ? [[company.name, name] as const] : [];
    })))
    .catch((error: unknown) => {
      input.logger?.warn(`Rabattkode: ${describeError(error)}; using domain names`);
      return new Map<string, string>();
    });

  const offers: CashbackOffer[] = [];
  let expired = 0;
  let foreign = 0;

  for (const doc of docs) {
    const f = doc.fields ?? {};
    if (f.is_published?.booleanValue !== true) continue;
    if (f.is_reported?.booleanValue === true) continue;

    const expiresAt = Date.parse(f.expiration_ts?.timestampValue ?? "");
    if (Number.isFinite(expiresAt) && Number.isFinite(now) && expiresAt <= now) {
      expired++;
      continue;
    }

    // `country` names the market the code is valid in ("Norge", "Sverige").
    const country = readString(f.country).trim();
    if (country !== "" && !/^norge$/i.test(country)) {
      foreign++;
      continue;
    }

    const siteUrl = readString(f.url_no_data_tracking) || readString(f.url_plugin);
    const parsedUrl = parseSiteUrl(siteUrl);
    if (parsedUrl === undefined) continue;
    const merchantUrl = /^https?:\/\//i.test(siteUrl.trim()) ? siteUrl.trim() : parsedUrl.toString();

    const code = readString(f.discount_code).trim();
    if (!code) continue;

    const title = readString(f.title).trim();
    const subtitle = readString(f.subtitle).trim();

    let domain = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
    domain = DOMAIN_CORRECTIONS[domain] ?? domain;

    const companyName = companyNames.get(readString(f.company_id)) ?? readString(f.company_name).trim();
    const merchantName = companyName || merchantNameFromDomain(domain);
    const reward = extractCouponReward(title) ||
      (/\b(?:rabatt|avslag)/i.test(title) ? "Rabatt" : "Rabattkode");
    const rewardCalculation = extractCouponMinimumPurchase(`${title}\n${subtitle}`);
    const validUntil = Number.isFinite(expiresAt) ? `Gyldig til ${formatNorwegianDate(expiresAt)}` : "";
    const terms = [title, subtitle, validUntil].filter(Boolean).join("\n");

    offers.push({
      provider: "rabattkode",
      merchantName,
      domains: [domain],
      reward,
      ...(rewardCalculation === undefined ? {} : { rewardCalculation }),
      sourceUrl: merchantUrl,
      activationUrl: merchantUrl,
      discountCode: code,
      terms,
      updatedAt: generatedAt,
    });
  }

  input.logger?.info(
    `Rabattkode: ${docs.length} documents, ${offers.length} published codes, ${expired} expired, ${foreign} for other countries`,
  );
  return offers;
}

async function fetchCollection(baseUrl: string, collection: string): Promise<FirestoreDoc[]> {
  const docs: FirestoreDoc[] = [];
  let pageToken = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${baseUrl}/${collection}?pageSize=${PAGE_SIZE}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const response = await gotScraping(url, {
      responseType: "json",
      throwHttpErrors: false,
      retry: { limit: 2 },
      timeout: { request: 30_000 },
    }).catch((error: unknown) => {
      throw new Error(`Rabattkode Firestore request ${url} failed: ${describeError(error)}`, { cause: error });
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Rabattkode Firestore request ${url} responded HTTP ${response.statusCode}`);
    }
    const body = response.body as { documents?: unknown; nextPageToken?: unknown };
    if (body.documents !== undefined && !Array.isArray(body.documents)) {
      throw new Error(`Rabattkode Firestore request ${url} returned no documents array`);
    }
    docs.push(...((body.documents ?? []) as FirestoreDoc[]));
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : "";
    if (!pageToken) return docs;
  }

  throw new Error(`Rabattkode Firestore ${collection} has more than ${MAX_PAGES} pages`);
}

/**
 * Reward of a single coupon from its own headline ("Få 300kr i avslag",
 * "Få opptil 40% studentrabatt", "Få gratis frakt"). Returns "" when the
 * headline states no amount, e.g. "Få 20 måltider fra kun 54kr per porsjon".
 * Shared by the coupon-site adapters (Rabattkode, CupoNation, TrustDeals,
 * Kickback).
 */
export function extractCouponReward(text: string): string {
  const percentage = extractUpToPercentageReward(text);
  if (percentage) return percentage;

  const kr = extractKrReward(text, { totalsum: false });
  if (kr && !kr.includes("/")) {
    return /\b(?:opptil|inntil)\s+(?:kr\.?\s*)?\d/i.test(text) ? `opptil ${kr}` : kr;
  }

  // "Få 300kr" / "40Kr rabatt" without a clause the kr parser recognises.
  const fixed = text.match(/\b(?:få|gir|spar)\s+(?:deg\s+)?(?:hele\s+)?(\d[\d ]*)\s*kr\b(?!\s*(?:per|\/))/i);
  if (fixed?.[1] !== undefined && /\b(?:rabatt|avslag)/i.test(text)) {
    return `${Number.parseInt(fixed[1].replace(/\s/g, ""), 10).toLocaleString("nb-NO").replace(/\s/g, " ")} kr`;
  }

  if (/\b(?:gratis|fri)\s+frakt\b/i.test(text)) return "Gratis frakt";
  return "";
}

/**
 * A single unambiguous minimum purchase in kr ("ved kjøp over 1000kr",
 * "Gjelder kjøp på minst 600 kr", "minimumsbestillingsverdi på NOK130").
 * "over" excludes the amount itself; "minst"/"min." include it. Amounts in
 * other currencies, item counts and maximum prices are ignored.
 */
export function extractCouponMinimumPurchase(text: string): RewardCalculationRules | undefined {
  const rules = new Map<string, RewardCalculationRules>();
  const add = (raw: string, exclusive: boolean) => {
    const minimumPurchaseNok = Number.parseInt(raw.replace(/[\s.]/g, ""), 10);
    if (!(minimumPurchaseNok > 0)) return;
    const rule = exclusive ? { minimumPurchaseNok, minimumPurchaseExclusive: true } : { minimumPurchaseNok };
    rules.set(JSON.stringify(rule), rule);
  };

  const clauses = text.split(/[\n;|]+|\.\s+(?=[A-ZÆØÅ])/);
  for (const clause of clauses) {
    const purchaseContext = /\b(?:kjøp|ordre|ordrer|bestilling(?:en|er)?|handel|handlekurv|ordreverdi|bestillingsverdi|handlesum)\b/i;
    const pattern =
      /(?:^|[\s(])(over|minst|min\.)\s*(min\.\s*|minst\s*|totalt\s*)?(?:(?:kr\.?|nok)\s*)?(\d[\d .]*\d|\d)\s*(?=kr\b|kroner\b|,-|nok\b)/gi;
    for (const match of clause.matchAll(pattern)) {
      const before = clause.slice(0, match.index ?? 0);
      const atStart = before.trim() === "";
      if (!atStart && !purchaseContext.test(before)) continue;
      const keyword = (match[1] ?? "").toLowerCase();
      add(match[3] ?? "", keyword === "over" && !/^min/i.test(match[2] ?? ""));
    }
    for (const match of clause.matchAll(/\bminimums?\w*\s+(?:på\s+)?(?:(?:kr\.?|nok)\s*(\d[\d .]*\d|\d)|(\d[\d .]*\d|\d)\s*(?:kr\b|kroner\b|nok\b))/gi)) {
      add(match[1] ?? match[2] ?? "", false);
    }
  }

  return rules.size === 1 ? [...rules.values()][0] : undefined;
}

function parseSiteUrl(value: string): URL | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname) ? url : undefined;
  } catch {
    return undefined;
  }
}

function merchantNameFromDomain(domain: string): string {
  const parts = domain.split(".");
  const firstPart = parts[0] ?? "";
  const namePart = (parts.length >= 3 && CC_SUBDOMAINS.has(firstPart) ? parts[1] : parts[0]) ?? domain;
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}

function formatNorwegianDate(time: number): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Oslo",
  }).format(new Date(time));
}

function readString(value: FirestoreValue | undefined): string {
  return value?.stringValue ?? value?.referenceValue ?? "";
}

function describeError(error: unknown): string {
  const describe = (value: unknown) => value instanceof Error ? value.message || value.name : String(value);
  return error instanceof AggregateError ? error.errors.map(describe).join("; ") : describe(error);
}
