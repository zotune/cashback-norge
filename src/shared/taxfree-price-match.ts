import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import { scoreProductTitleAgainstSearchTerm } from "./product-title-match.js";
import type { JsonRequest } from "./prisjakt-price-match.js";

const TAXFREE_ORIGIN = "https://www.tax-free.no";
const TAXFREE_ALGOLIA_URL = "https://namx6ho175-dsn.algolia.net/1/indexes/*/queries";
const TAXFREE_ALGOLIA_APP_ID = "NAMX6HO175";
const TAXFREE_ALGOLIA_API_KEY = "55252987cc07b733b24f13fc4754f42e";
const TAXFREE_PRODUCT_INDEX = "prod_products";
const TAXFREE_MAX_HITS = 8;
const VINMONOPOLET_ORIGIN = "https://www.vinmonopolet.no";
const TAXFREE_IDENTIFIER_LOOKUP_LIMIT = 4;
const VINMONOPOLET_BARCODE_LOOKUP_LIMIT = 12;
const MIN_TAXFREE_TITLE_MATCH_SCORE = 0.70;
const MIN_TAXFREE_SAME_VOLUME_TITLE_MATCH_SCORE = 0.55;

type LocaleString = {
  no?: string;
  en?: string;
};

type TaxfreeCandidate = {
  amount: number;
  alcoholPercent?: number;
  brandName?: string;
  identifiers: string[];
  identifierMatch: boolean;
  productName: string;
  productUrl: string;
  score: number;
  titlePass: boolean;
  vinmonopoletBarcodeMatch?: boolean;
  vinmonopoletBarcodeMismatch?: boolean;
  volumeMl?: number;
};

export async function findTaxfreePriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
): Promise<PriceMatchOffer | undefined> {
  if (!isVinmonopoletProductUrl(message.url)) {
    return undefined;
  }

  if (message.price === undefined || message.volumeMl === undefined) {
    return undefined;
  }

  const queries = buildTaxfreeSearchQueries(message);
  if (queries.length === 0) {
    return undefined;
  }

  const response = await requestJson(TAXFREE_ALGOLIA_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Algolia-API-Key": TAXFREE_ALGOLIA_API_KEY,
      "X-Algolia-Application-Id": TAXFREE_ALGOLIA_APP_ID,
    },
    body: JSON.stringify({
      requests: queries.map((query) => ({
        indexName: TAXFREE_PRODUCT_INDEX,
        query,
        params: new URLSearchParams({ hitsPerPage: String(TAXFREE_MAX_HITS) }).toString(),
      })),
    }),
  });

  const candidates = (
    await validateTaxfreeCandidatesAgainstVinmonopolet(
      readTaxfreeHits(response)
        .map((hit) => readTaxfreeCandidate(hit, message))
        .filter((candidate): candidate is TaxfreeCandidate => candidate !== undefined),
      message,
      requestJson,
    )
  )
    .filter(isAllowedTaxfreeCandidate)
    .sort(compareTaxfreeCandidates);
  const best = candidates[0];
  if (best === undefined) {
    return undefined;
  }

  if (message.currency === "NOK" && message.price !== undefined && best.amount >= message.price) {
    return undefined;
  }

  return {
    source: "taxfree",
    sourceName: "Tax Free",
    shopName: "Tax Free Norway",
    amount: best.amount,
    sortAmount: best.amount,
    currency: "NOK",
    price: formatNokPrice(best.amount),
    productName: formatTaxfreeProductName(best),
    productUrl: best.productUrl,
  };
}

export function isVinmonopoletProductUrl(rawUrl: string | undefined): boolean {
  if (rawUrl === undefined) return false;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "vinmonopolet.no" && /\/p\/\d+(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function readTaxfreeCandidate(
  value: unknown,
  message: GetPriceMatchForProductMessage,
): TaxfreeCandidate | undefined {
  if (!isRecord(value)) return undefined;

  const productType = readString(value.type);
  if (productType !== undefined && productType !== "ALCOHOL") return undefined;
  if (!hasTaxfreeStock(value)) return undefined;

  const amount = readNokPrice(value.price);
  const productName = readLocalizedString(value.name) ?? readString(value.name);
  const brandName = readLocalizedString(value.brandName) ?? readString(value.brandName);
  const productUrl = readTaxfreeProductUrl(value);
  const identifiers = readTaxfreeProductIdentifiers(value);
  const identifierMatch = hasSharedProductIdentifier(message.codes, identifiers);
  if (amount === undefined || productName === undefined || productUrl === undefined) {
    return undefined;
  }

  const volumeMl = readVolumeMl(readString(value.sizeName) ?? readString(value.size));
  const hasMatchingVolume = message.volumeMl !== undefined && volumeMl !== undefined && hasSameVolume(message.volumeMl, volumeMl);
  if (message.volumeMl !== undefined && volumeMl !== undefined && !hasMatchingVolume) {
    return undefined;
  }

  const title = withLeadingBrand(productName, brandName);
  const matchTerms = buildTaxfreeMatchTerms(message);
  const score = Math.max(
    ...matchTerms.flatMap((term) => [
      scoreProductTitleAgainstSearchTerm(term, title),
      scoreProductTitleAgainstSearchTerm(term, productName),
    ]),
  );
  const minTitleScore = hasMatchingVolume
    ? MIN_TAXFREE_SAME_VOLUME_TITLE_MATCH_SCORE
    : MIN_TAXFREE_TITLE_MATCH_SCORE;
  const titlePass = score >= minTitleScore;
  if (!identifierMatch && !titlePass && identifiers.length === 0) {
    return undefined;
  }

  const alcoholPercent = readNumber(value.alcoholByVolume);
  if (
    message.alcoholPercent !== undefined &&
    alcoholPercent !== undefined &&
    Math.abs(message.alcoholPercent - alcoholPercent) > 0.5
  ) {
    return undefined;
  }

  return {
    amount,
    ...(alcoholPercent !== undefined ? { alcoholPercent } : {}),
    ...(brandName !== undefined ? { brandName } : {}),
    identifiers,
    identifierMatch,
    productName,
    productUrl,
    score: identifierMatch ? Math.max(score, 1) : score,
    titlePass,
    ...(volumeMl !== undefined ? { volumeMl } : {}),
  };
}

async function validateTaxfreeCandidatesAgainstVinmonopolet(
  candidates: TaxfreeCandidate[],
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest,
): Promise<TaxfreeCandidate[]> {
  const vinmonopoletProductCode = readVinmonopoletProductCode(message.url);
  if (vinmonopoletProductCode === undefined) {
    return candidates;
  }

  const lookupCache = new Map<string, string | undefined>();
  let lookupCount = 0;

  const validatedCandidates: TaxfreeCandidate[] = [];
  for (const candidate of candidates) {
    let matchedCandidate: TaxfreeCandidate | undefined;
    let sawBarcodeMismatch = false;

    for (const identifier of candidate.identifiers.slice(0, TAXFREE_IDENTIFIER_LOOKUP_LIMIT)) {
      if (lookupCount >= VINMONOPOLET_BARCODE_LOOKUP_LIMIT) break;

      let matchedProductCode = lookupCache.get(identifier);
      if (!lookupCache.has(identifier)) {
        lookupCount += 1;
        matchedProductCode = await fetchVinmonopoletProductCodeForBarcode(identifier, requestJson);
        lookupCache.set(identifier, matchedProductCode);
      }

      if (matchedProductCode === undefined) continue;
      if (matchedProductCode === vinmonopoletProductCode) {
        matchedCandidate = {
          ...candidate,
          score: Math.max(candidate.score, 1),
          vinmonopoletBarcodeMatch: true,
        };
        sawBarcodeMismatch = false;
        break;
      }

      sawBarcodeMismatch = true;
    }

    if (matchedCandidate !== undefined) {
      validatedCandidates.push(matchedCandidate);
      continue;
    }

    validatedCandidates.push({
      ...candidate,
      ...(sawBarcodeMismatch ? { vinmonopoletBarcodeMismatch: true } : {}),
    });
  }

  return validatedCandidates;
}

function isAllowedTaxfreeCandidate(candidate: TaxfreeCandidate): boolean {
  if (candidate.vinmonopoletBarcodeMatch === true) return true;
  if (candidate.vinmonopoletBarcodeMismatch === true) return false;
  return candidate.identifierMatch || candidate.titlePass;
}

function compareTaxfreeCandidates(first: TaxfreeCandidate, second: TaxfreeCandidate): number {
  const rankDifference = getTaxfreeCandidateRank(first) - getTaxfreeCandidateRank(second);
  if (rankDifference !== 0) return rankDifference;

  const amountDifference = first.amount - second.amount;
  if (amountDifference !== 0) return amountDifference;

  return second.score - first.score;
}

function getTaxfreeCandidateRank(candidate: TaxfreeCandidate): number {
  if (candidate.vinmonopoletBarcodeMatch === true) return 0;
  if (candidate.identifierMatch) return 1;
  return 2;
}

async function fetchVinmonopoletProductCodeForBarcode(
  identifier: string,
  requestJson: JsonRequest,
): Promise<string | undefined> {
  const value = await requestJson(
    `${VINMONOPOLET_ORIGIN}/vmpws/v2/vmp/products/barCodeSearch/${encodeURIComponent(identifier)}`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    },
  );
  return readVinmonopoletProductCodeFromResponse(value);
}

function readVinmonopoletProductCodeFromResponse(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const directCode = normalizeVinmonopoletProductCode(readString(value.code));
  if (directCode !== undefined) return directCode;

  const product = isRecord(value.product) ? value.product : undefined;
  return normalizeVinmonopoletProductCode(readString(product?.code));
}

function readTaxfreeHits(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.results)) return [];
  return value.results
    .filter(isRecord)
    .flatMap((result) => Array.isArray(result.hits) ? result.hits : []);
}

function readTaxfreeProductUrl(value: Record<string, unknown>): string | undefined {
  const localizedUrls = isRecord(value.localizedUrls) ? value.localizedUrls : undefined;
  const url = readString(localizedUrls?.no) ?? readString(value.url);
  if (url !== undefined) {
    return new URL(withNorwegianPathPrefix(url), TAXFREE_ORIGIN).toString();
  }

  const code = readString(value.code);
  return code !== undefined ? new URL(`/no/product${encodeURIComponent(code)}`, TAXFREE_ORIGIN).toString() : undefined;
}

function withNorwegianPathPrefix(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    url.pathname = withNorwegianPathPrefix(url.pathname);
    return url.toString();
  }

  return /^\/no(?:\/|$)/i.test(path) ? path : `/no${path.startsWith("/") ? "" : "/"}${path}`;
}

function readNokPrice(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  return readNumber(value.NOK);
}

function readLocalizedString(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return readString(value.no) ?? readString(value.en);
}

function readTaxfreeProductIdentifiers(value: Record<string, unknown>): string[] {
  return uniqueValues([
    normalizeProductIdentifier(readString(value.ean)),
    ...(Array.isArray(value.eanAliases)
      ? value.eanAliases.map((identifier) => normalizeProductIdentifier(readString(identifier)))
      : []),
  ]);
}

function hasSharedProductIdentifier(
  sourceIdentifiers: string[] | undefined,
  candidateIdentifiers: string[],
): boolean {
  if (sourceIdentifiers === undefined || candidateIdentifiers.length === 0) return false;
  const normalizedSourceIdentifiers = new Set(
    sourceIdentifiers
      .map((identifier) => normalizeProductIdentifier(identifier))
      .filter((identifier): identifier is string => identifier !== undefined),
  );
  return candidateIdentifiers.some((identifier) => normalizedSourceIdentifiers.has(identifier));
}

function normalizeProductIdentifier(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : undefined;
}

function uniqueValues<T>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))];
}

function hasTaxfreeStock(value: Record<string, unknown>): boolean {
  const stockLists = [
    value.inOnlineStockIn,
    value.inStockIn,
    value.availableIn,
    value.availableInCodes,
    value.availableInAirportCodes,
  ].filter(Array.isArray);

  return stockLists.length === 0 || stockLists.some((stockList) => stockList.length > 0);
}

function cleanTaxfreeSearchTerm(value: string): string {
  return value
    .replace(/\s+\|\s+.*$/g, "")
    .replace(/\s+-\s+Vinmonopolet$/i, "")
    .trim()
    .replace(/\s+/g, " ");
}

function buildTaxfreeSearchQueries(message: GetPriceMatchForProductMessage): string[] {
  return uniqueValues([
    cleanTaxfreeSearchTerm(message.searchTerm),
    readVinmonopoletProductSlugSearchTerm(message.url),
    ...(message.codes?.map(normalizeProductIdentifier) ?? []),
  ]).filter((query) => query.length >= 4);
}

function buildTaxfreeMatchTerms(message: GetPriceMatchForProductMessage): string[] {
  return uniqueValues([
    cleanTaxfreeSearchTerm(message.searchTerm),
    readVinmonopoletProductSlugSearchTerm(message.url),
  ]).filter((query) => query.length >= 4);
}

function readVinmonopoletProductSlugSearchTerm(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "p");
    if (productIndex <= 0) return undefined;
    return decodeURIComponent(segments[productIndex - 1] ?? "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  } catch {
    return undefined;
  }
}

function readVinmonopoletProductCode(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/\/p\/(\d+)(?:\/|$)/i);
    return normalizeVinmonopoletProductCode(match?.[1]);
  } catch {
    return undefined;
  }
}

function normalizeVinmonopoletProductCode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

function withLeadingBrand(productName: string, brandName: string | undefined): string {
  if (brandName === undefined || productName.toLowerCase().includes(brandName.toLowerCase())) {
    return productName;
  }
  return `${brandName} ${productName}`;
}

function formatTaxfreeProductName(candidate: TaxfreeCandidate): string {
  const title = withLeadingBrand(candidate.productName, candidate.brandName);
  const size = candidate.volumeMl !== undefined ? formatVolume(candidate.volumeMl) : undefined;
  return size !== undefined ? `${title} (${size})` : title;
}

function formatVolume(volumeMl: number): string {
  if (volumeMl >= 1000 && volumeMl % 1000 === 0) {
    return `${volumeMl / 1000} l`;
  }
  if (volumeMl >= 1000) {
    return `${formatNumber(volumeMl / 1000)} l`;
  }
  if (volumeMl % 10 === 0) {
    return `${volumeMl / 10} cl`;
  }
  return `${formatNumber(volumeMl)} ml`;
}

function readVolumeMl(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = value.match(/\b(\d+(?:[,.]\d+)?)\s*(ml|cl|l)\b/i);
  if (match === null) return undefined;

  const amount = parseLocalizedNumber(match[1] ?? "");
  const unit = match[2]?.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0 || unit === undefined) return undefined;
  if (unit === "ml") return amount;
  if (unit === "cl") return amount * 10;
  return amount * 1000;
}

function hasSameVolume(firstMl: number, secondMl: number): boolean {
  return Math.abs(firstMl - secondMl) <= Math.max(5, Math.min(firstMl, secondMl) * 0.03);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = parseLocalizedNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLocalizedNumber(value: string): number {
  return Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
}

function formatNokPrice(amount: number): string {
  return `${formatNumber(amount)} kr`;
}

function formatNumber(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

async function fetchJson(url: string, init?: Parameters<JsonRequest>[1]): Promise<unknown | undefined> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
