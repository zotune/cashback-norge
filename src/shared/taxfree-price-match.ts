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
const VINMONOPOLET_SEARCH_LOOKUP_LIMIT = 20;
const MIN_TAXFREE_TITLE_MATCH_SCORE = 0.70;
const MIN_TAXFREE_SAME_VOLUME_TITLE_MATCH_SCORE = 0.55;
const MIN_VINMONOPOLET_TITLE_MATCH_SCORE = 0.65;

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
  productCode?: string;
  productUrl: string;
  score: number;
  titlePass: boolean;
  vintageYear?: number;
  vinmonopoletBarcodeMatch?: boolean;
  vinmonopoletBarcodeMismatch?: boolean;
  volumeMl?: number;
};

type VinmonopoletProductOffer = {
  alcoholPercent?: number;
  amount: number;
  productName: string;
  productUrl: string;
  score?: number;
  vintageYear?: number;
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

export async function findVinmonopoletPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
): Promise<PriceMatchOffer | undefined> {
  if (!isTaxfreeProductUrl(message.url)) {
    return undefined;
  }

  const currentTaxfreeCandidate = await findCurrentTaxfreeCandidate(message, requestJson);
  if (currentTaxfreeCandidate === undefined) {
    return undefined;
  }

  const vinmonopoletOffer = await findVinmonopoletOfferForTaxfreeCandidate(currentTaxfreeCandidate, requestJson);
  return vinmonopoletOffer !== undefined
    ? buildVinmonopoletPriceMatchOffer(vinmonopoletOffer)
    : undefined;
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

export function isTaxfreeProductUrl(rawUrl: string | undefined): boolean {
  if (rawUrl === undefined) return false;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "tax-free.no" && /^\/(?:no\/)?product\d+(?:\/|$)/i.test(url.pathname);
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

  const vintageYear = readVintageYear(readLocalizedString(value.year) ?? readString(value.year));
  const messageVintageYear = readVintageYear(cleanTaxfreeSearchTerm(message.searchTerm))
    ?? readVintageYear(readVinmonopoletProductSlugSearchTerm(message.url));
  if (!hasCompatibleVintage(messageVintageYear, vintageYear)) {
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

  const productCode = readTaxfreeProductCode(productUrl);
  return {
    amount,
    ...(alcoholPercent !== undefined ? { alcoholPercent } : {}),
    ...(brandName !== undefined ? { brandName } : {}),
    identifiers,
    identifierMatch,
    productName,
    ...(productCode !== undefined ? { productCode } : {}),
    productUrl,
    score: identifierMatch ? Math.max(score, 1) : score,
    titlePass,
    ...(vintageYear !== undefined ? { vintageYear } : {}),
    ...(volumeMl !== undefined ? { volumeMl } : {}),
  };
}

async function findCurrentTaxfreeCandidate(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest,
): Promise<TaxfreeCandidate | undefined> {
  const queries = buildCurrentTaxfreeProductQueries(message);
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

  const taxfreeProductCode = readTaxfreeProductCode(message.url) ?? readTaxfreeProductCode(message.productUrl);
  const candidates = readTaxfreeHits(response)
    .map((hit) => readTaxfreeCandidate(hit, message))
    .filter((candidate): candidate is TaxfreeCandidate => candidate !== undefined)
    .sort((first, second) => {
      const rankDifference =
        getCurrentTaxfreeCandidateRank(first, taxfreeProductCode, message) -
        getCurrentTaxfreeCandidateRank(second, taxfreeProductCode, message);
      if (rankDifference !== 0) return rankDifference;
      return second.score - first.score;
    });

  return candidates[0];
}

async function findVinmonopoletOfferForTaxfreeCandidate(
  candidate: TaxfreeCandidate,
  requestJson: JsonRequest,
): Promise<VinmonopoletProductOffer | undefined> {
  for (const identifier of candidate.identifiers.slice(0, VINMONOPOLET_BARCODE_LOOKUP_LIMIT)) {
    const barcodeResponse = await fetchVinmonopoletProductForBarcode(identifier, requestJson);
    const barcodeOffer = readVinmonopoletProductOffer(barcodeResponse);
    if (barcodeOffer !== undefined && hasCompatibleTaxfreeOffer(candidate, barcodeOffer)) {
      return barcodeOffer;
    }

    const productCode = readVinmonopoletProductCodeFromResponse(barcodeResponse);
    if (productCode === undefined) continue;

    const productResponse = await fetchVinmonopoletProductByCode(productCode, requestJson);
    const productOffer = readVinmonopoletProductOffer(productResponse);
    if (productOffer !== undefined && hasCompatibleTaxfreeOffer(candidate, productOffer)) {
      return productOffer;
    }
  }

  return findVinmonopoletOfferBySearch(candidate, requestJson);
}

function hasCompatibleTaxfreeOffer(
  candidate: TaxfreeCandidate,
  offer: VinmonopoletProductOffer,
): boolean {
  return (
    hasCompatibleTaxfreeVolume(candidate, offer) &&
    hasCompatibleVintage(candidate.vintageYear, offer.vintageYear)
  );
}

function hasCompatibleTaxfreeVolume(
  candidate: TaxfreeCandidate,
  offer: VinmonopoletProductOffer,
): boolean {
  return (
    candidate.volumeMl === undefined ||
    offer.volumeMl === undefined ||
    hasSameVolume(candidate.volumeMl, offer.volumeMl)
  );
}

function hasCompatibleVintage(
  firstYear: number | undefined,
  secondYear: number | undefined,
): boolean {
  return firstYear === undefined || firstYear === secondYear;
}

async function findVinmonopoletOfferBySearch(
  candidate: TaxfreeCandidate,
  requestJson: JsonRequest,
): Promise<VinmonopoletProductOffer | undefined> {
  const queries = buildVinmonopoletSearchQueries(candidate);
  if (queries.length === 0) return undefined;

  const offers: VinmonopoletProductOffer[] = [];
  for (const query of queries) {
    const response = await fetchVinmonopoletProductsBySearchTerm(query, requestJson);
    offers.push(
      ...readVinmonopoletSearchOffers(response)
        .map((offer) => scoreVinmonopoletSearchOffer(candidate, offer))
        .filter((offer): offer is VinmonopoletProductOffer => offer !== undefined),
    );
  }

  return offers.sort(compareVinmonopoletSearchOffers)[0];
}

function scoreVinmonopoletSearchOffer(
  candidate: TaxfreeCandidate,
  offer: VinmonopoletProductOffer,
): VinmonopoletProductOffer | undefined {
  if (candidate.volumeMl !== undefined && offer.volumeMl !== undefined && !hasSameVolume(candidate.volumeMl, offer.volumeMl)) {
    return undefined;
  }
  if (candidate.volumeMl !== undefined && offer.volumeMl === undefined) {
    return undefined;
  }

  if (
    candidate.alcoholPercent !== undefined &&
    offer.alcoholPercent !== undefined &&
    Math.abs(candidate.alcoholPercent - offer.alcoholPercent) > 0.5
  ) {
    return undefined;
  }
  if (!hasCompatibleVintage(candidate.vintageYear, offer.vintageYear)) {
    return undefined;
  }

  const title = withLeadingBrand(candidate.productName, candidate.brandName);
  const score = Math.max(
    scoreProductTitleAgainstSearchTerm(title, offer.productName),
    scoreProductTitleAgainstSearchTerm(candidate.productName, offer.productName),
    ...buildVinmonopoletSearchQueries(candidate).map((query) => scoreProductTitleAgainstSearchTerm(query, offer.productName)),
  );
  if (score < MIN_VINMONOPOLET_TITLE_MATCH_SCORE) {
    return undefined;
  }

  return {
    ...offer,
    score,
  };
}

function compareVinmonopoletSearchOffers(
  first: VinmonopoletProductOffer,
  second: VinmonopoletProductOffer,
): number {
  return (second.score ?? 0) - (first.score ?? 0);
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

function buildVinmonopoletPriceMatchOffer(
  offer: VinmonopoletProductOffer,
): PriceMatchOffer {
  return {
    source: "vinmonopolet",
    sourceName: "Vinmonopolet",
    shopName: "Vinmonopolet",
    amount: offer.amount,
    sortAmount: offer.amount,
    currency: "NOK",
    price: formatNokPrice(offer.amount),
    productName: formatVinmonopoletProductName(offer),
    productUrl: offer.productUrl,
  };
}

function formatVinmonopoletProductName(offer: VinmonopoletProductOffer): string {
  const size = offer.volumeMl !== undefined ? formatVolume(offer.volumeMl) : undefined;
  return size !== undefined ? `${offer.productName} (${size})` : offer.productName;
}

function getCurrentTaxfreeCandidateRank(
  candidate: TaxfreeCandidate,
  taxfreeProductCode: string | undefined,
  message: GetPriceMatchForProductMessage,
): number {
  if (
    taxfreeProductCode !== undefined &&
    candidate.productCode !== undefined &&
    candidate.productCode === taxfreeProductCode
  ) {
    return 0;
  }
  if (candidate.identifierMatch) return 1;
  if (message.volumeMl !== undefined && candidate.volumeMl !== undefined && hasSameVolume(message.volumeMl, candidate.volumeMl)) {
    return 2;
  }
  return 3;
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

async function fetchVinmonopoletProductForBarcode(
  identifier: string,
  requestJson: JsonRequest,
): Promise<unknown | undefined> {
  return requestJson(
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
}

async function fetchVinmonopoletProductByCode(
  productCode: string,
  requestJson: JsonRequest,
): Promise<unknown | undefined> {
  return requestJson(
    `${VINMONOPOLET_ORIGIN}/vmpws/v3/vmp/products/${encodeURIComponent(productCode)}?fields=FULL`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    },
  );
}

async function fetchVinmonopoletProductsBySearchTerm(
  searchTerm: string,
  requestJson: JsonRequest,
): Promise<unknown | undefined> {
  const params = new URLSearchParams({
    query: searchTerm,
    currentPage: "0",
    pageSize: String(VINMONOPOLET_SEARCH_LOOKUP_LIMIT),
    fields: "FULL",
  });

  return requestJson(
    `${VINMONOPOLET_ORIGIN}/vmpws/v2/vmp/products/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    },
  );
}

function readVinmonopoletProductCodeFromResponse(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const directCode = normalizeVinmonopoletProductCode(readString(value.code));
  if (directCode !== undefined) return directCode;

  const product = isRecord(value.product) ? value.product : undefined;
  return normalizeVinmonopoletProductCode(readString(product?.code));
}

function readVinmonopoletProductOffer(value: unknown): VinmonopoletProductOffer | undefined {
  const product = readVinmonopoletProductRecord(value);
  if (product === undefined) return undefined;

  const amount = readVinmonopoletProductPrice(product);
  const productName = readLocalizedString(product.name) ?? readString(product.name);
  const productUrl = readVinmonopoletProductUrlFromRecord(product);
  if (amount === undefined || productName === undefined || productUrl === undefined) {
    return undefined;
  }

  const volumeMl = readVinmonopoletProductVolumeMl(product);
  const alcoholPercent = readVinmonopoletAlcoholPercent(product);
  const vintageYear = readVinmonopoletVintageYear(product, productName);
  return {
    amount,
    ...(alcoholPercent !== undefined ? { alcoholPercent } : {}),
    productName,
    productUrl,
    ...(vintageYear !== undefined ? { vintageYear } : {}),
    ...(volumeMl !== undefined ? { volumeMl } : {}),
  };
}

function readVinmonopoletProductRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.product)) return value.product;
  if (isRecord(value.data)) return value.data;
  return value;
}

function readVinmonopoletSearchOffers(value: unknown): VinmonopoletProductOffer[] {
  if (!isRecord(value) || !Array.isArray(value.products)) return [];
  return value.products
    .map(readVinmonopoletProductOffer)
    .filter((offer): offer is VinmonopoletProductOffer => offer !== undefined);
}

function readVinmonopoletProductPrice(product: Record<string, unknown>): number | undefined {
  return [
    product.price,
    product.currentPrice,
    product.salesPrice,
    product.basicPrice,
  ].map(readVinmonopoletPriceValue).find((amount): amount is number => amount !== undefined);
}

function readVinmonopoletPriceValue(value: unknown): number | undefined {
  if (isRecord(value)) {
    return (
      readNumber(value.value) ??
      readNumber(value.amount) ??
      readNumber(value.price) ??
      readNumber(value.formattedValue)
    );
  }

  return readNumber(value);
}

function readVinmonopoletProductUrlFromRecord(product: Record<string, unknown>): string | undefined {
  const directUrl = readString(product.url) ?? readString(product.productUrl);
  if (directUrl !== undefined) {
    return new URL(directUrl, VINMONOPOLET_ORIGIN).toString();
  }

  const code = readVinmonopoletProductCodeFromResponse(product);
  return code !== undefined ? new URL(`/p/${encodeURIComponent(code)}`, VINMONOPOLET_ORIGIN).toString() : undefined;
}

function readVinmonopoletProductVolumeMl(product: Record<string, unknown>): number | undefined {
  const stringVolume = [
    readFormattedValue(product.volume),
    product.volume,
    product.volumeFormatted,
    product.volumeString,
    product.productVolume,
    product.bottleVolume,
  ].map(readString).find((value): value is string => value !== undefined);
  const parsedStringVolume = readVolumeMl(stringVolume);
  if (parsedStringVolume !== undefined) return parsedStringVolume;

  const volumeRecordValue = readValueFromRecord(product.volume);
  if (volumeRecordValue !== undefined && volumeRecordValue > 0) {
    return volumeRecordValue * 10;
  }

  const numericLiterVolume = [
    product.volumeInLiters,
    product.literVolume,
  ].map(readNumber).find((value): value is number => value !== undefined && value > 0);
  if (numericLiterVolume !== undefined) return numericLiterVolume * 1000;

  const numericVolume = [
    product.volumeValue,
    product.bottleVolume,
    product.volume,
  ].map(readNumber).find((value): value is number => value !== undefined && value > 0);
  if (numericVolume === undefined) return undefined;
  return numericVolume <= 20 ? numericVolume * 1000 : numericVolume;
}

function readVinmonopoletAlcoholPercent(product: Record<string, unknown>): number | undefined {
  return [
    readValueFromRecord(product.alcohol),
    readNumber(product.alcohol),
    readNumber(product.alcoholPercent),
    readNumber(product.alcoholPercentage),
    readNumber(product.alcoholByVolume),
  ].find((value): value is number => value !== undefined);
}

function readVinmonopoletVintageYear(
  product: Record<string, unknown>,
  productName: string,
): number | undefined {
  return [
    product.vintage,
    product.vintageYear,
    product.year,
    product.harvestYear,
    productName,
  ].map(readString).map(readVintageYear).find((year): year is number => year !== undefined);
}

function readFormattedValue(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return readString(value.formattedValue) ?? readString(value.readableValue);
}

function readValueFromRecord(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  return readNumber(value.value);
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
  const cleanSearchTerm = cleanTaxfreeSearchTerm(message.searchTerm);
  return uniqueValues([
    cleanSearchTerm,
    stripWineVintage(cleanSearchTerm),
    readVinmonopoletProductSlugSearchTerm(message.url),
    ...(message.codes?.map(normalizeProductIdentifier) ?? []),
  ]).filter((query) => query.length >= 4);
}

function buildCurrentTaxfreeProductQueries(message: GetPriceMatchForProductMessage): string[] {
  const cleanSearchTerm = cleanTaxfreeSearchTerm(message.searchTerm);
  return uniqueValues([
    readTaxfreeProductCode(message.url),
    readTaxfreeProductCode(message.productUrl),
    cleanSearchTerm,
    stripWineVintage(cleanSearchTerm),
    readTaxfreeProductSlugSearchTerm(message.url),
    ...(message.codes?.map(normalizeProductIdentifier) ?? []),
  ]).filter((query) => query.length >= 4);
}

function buildTaxfreeMatchTerms(message: GetPriceMatchForProductMessage): string[] {
  const cleanSearchTerm = cleanTaxfreeSearchTerm(message.searchTerm);
  return uniqueValues([
    cleanSearchTerm,
    stripWineVintage(cleanSearchTerm),
    readVinmonopoletProductSlugSearchTerm(message.url),
  ]).filter((query) => query.length >= 4);
}

function buildVinmonopoletSearchQueries(candidate: TaxfreeCandidate): string[] {
  const title = withLeadingBrand(candidate.productName, candidate.brandName);
  return uniqueValues([
    title,
    stripWineVintage(title),
    candidate.productName,
    stripWineVintage(candidate.productName),
    candidate.brandName,
  ]).filter((query) => query.length >= 4);
}

function stripWineVintage(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const withoutVintage = value
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return withoutVintage.length > 0 && withoutVintage !== value ? withoutVintage : undefined;
}

function readVintageYear(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = value.match(/\b((?:19|20)\d{2})\b/);
  if (match === null) return undefined;
  const year = Number.parseInt(match[1] ?? "", 10);
  return year >= 1900 && year <= 2099 ? year : undefined;
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

function readTaxfreeProductSlugSearchTerm(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl, TAXFREE_ORIGIN);
    const segments = url.pathname.split("/").filter(Boolean);
    const productSegment = segments.find((segment) => /^product\d+/i.test(segment));
    if (productSegment === undefined) return undefined;
    const slug = segments[segments.indexOf(productSegment) + 1];
    return slug !== undefined
      ? decodeURIComponent(slug)
        .replace(/[-_]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
      : undefined;
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

function readTaxfreeProductCode(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl, TAXFREE_ORIGIN);
    const match = url.pathname.match(/\/(?:no\/)?product(\d+)(?:\/|$)/i);
    return normalizeTaxfreeProductCode(match?.[1]);
  } catch {
    return undefined;
  }
}

function normalizeVinmonopoletProductCode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

function normalizeTaxfreeProductCode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

function readVinmonopoletProductNameFromUrl(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl, VINMONOPOLET_ORIGIN);
    const segments = url.pathname.split("/").filter(Boolean);
    const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "p");
    if (productIndex <= 0) return undefined;
    return decodeURIComponent(segments[productIndex - 1] ?? "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\s+/g, " ") || undefined;
  } catch {
    return undefined;
  }
}

function withLeadingBrand(productName: string, brandName: string | undefined): string {
  if (brandName === undefined || productName.toLowerCase().includes(brandName.toLowerCase())) {
    return productName;
  }
  return `${brandName} ${productName}`;
}

function formatTaxfreeProductName(candidate: TaxfreeCandidate): string {
  const title = appendVintageYear(
    withLeadingBrand(candidate.productName, candidate.brandName),
    candidate.vintageYear,
  );
  const size = candidate.volumeMl !== undefined ? formatVolume(candidate.volumeMl) : undefined;
  return size !== undefined ? `${title} (${size})` : title;
}

function appendVintageYear(title: string, vintageYear: number | undefined): string {
  if (vintageYear === undefined || new RegExp(`\\b${vintageYear}\\b`).test(title)) {
    return title;
  }
  return `${title} ${vintageYear}`;
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
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
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
