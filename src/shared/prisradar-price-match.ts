import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import type { JsonRequest } from "./prisjakt-price-match.js";

type TextRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<string | undefined>;

const PRISRADAR_GRAPHQL_URL = "https://gql.prisradar.no";
const PRISRADAR_PRODUCT_URL = "https://prisradar.no/produkter/";
const PRISRADAR_PRODUCT_PATH_PATTERN = /^\/produkter\/[^/?#]+\/?$/;
const BAD_AVAILABILITY_STATUSES = new Set([
  "discontinued",
  "not_available",
  "not_in_stock",
  "out_of_stock",
]);
const SEARCH_SUGGESTIONS_QUERY = `
query SearchSuggestions($query: String!, $category: Int) {
  suggestions: SearchSuggestions(query: $query, category: $category) {
    products {
      id
      title
      price
      oldPrice
      slug
      image
    }
  }
}
`;

export async function findPrisradarPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
  requestText: TextRequest = fetchText,
): Promise<PriceMatchOffer | undefined> {
  if (!message.productPageClue && message.searchTerm.trim().length < 8) {
    return undefined;
  }

  const directProductUrl = readPrisradarProductUrl(message.url) ?? readPrisradarProductUrl(message.productUrl);
  if (directProductUrl !== undefined) {
    const directOffer = await fetchPrisradarOfferForUrl(directProductUrl, requestText);
    if (directOffer !== undefined) return directOffer;
  }

  const codeOffer = await fetchPrisradarOfferForQueries(
    uniqueStrings([...(message.codes ?? []).filter(isLikelyGtin)]),
    requestJson,
    requestText,
  );
  if (codeOffer !== undefined) return codeOffer;

  return fetchPrisradarOfferForQueries(
    buildPrisradarTextQueries(message.searchTerm),
    requestJson,
    requestText,
    message,
  );
}

async function fetchPrisradarOfferForQueries(
  queries: string[],
  requestJson: JsonRequest,
  requestText: TextRequest,
  message?: GetPriceMatchForProductMessage,
): Promise<PriceMatchOffer | undefined> {
  const candidates = new Map<string, PrisradarProduct>();

  for (const query of queries) {
    const products = await fetchPrisradarProducts(query, requestJson);
    for (const product of products) {
      const existing = candidates.get(product.productUrl);
      if (existing === undefined || product.matchScore > existing.matchScore) {
        candidates.set(product.productUrl, product);
      }
    }
  }

  const rankedProducts = [...candidates.values()]
    .sort((first, second) => second.matchScore - first.matchScore)
    .filter((product) => message === undefined || product.matchScore >= (message.price !== undefined ? 0.15 : 0.45))
    .slice(0, 8);
  const merchantKeys = message !== undefined ? getCurrentMerchantKeys(message) : [];
  const matchedOffers: PrisradarMatchedOffer[] = [];
  for (const product of rankedProducts) {
    const offer = await fetchPrisradarOfferForUrl(product.productUrl, requestText);
    if (offer === undefined) continue;
    if (message === undefined) return offer;

    const merchantPriceDistance = getMerchantPriceDistance(offer, merchantKeys, message.price);
    if (merchantPriceDistance !== undefined) {
      matchedOffers.push({ offer, product, merchantPriceDistance });
    }
  }

  matchedOffers.sort(comparePrisradarMatchedOffers);
  return matchedOffers[0]?.offer;
}

type PrisradarProduct = {
  productUrl: string;
  title: string;
  matchScore: number;
};

type PrisradarOffer = {
  shopName: string;
  amount: number;
  sortAmount?: number;
  currency: string;
  price: string;
  shippingPrice?: string;
  totalPrice?: string;
};

type PrisradarMatchedOffer = {
  offer: PriceMatchOffer;
  product: PrisradarProduct;
  merchantPriceDistance: number;
};

async function fetchPrisradarProducts(
  query: string,
  requestJson: JsonRequest,
): Promise<PrisradarProduct[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 4 || normalizedQuery.length > 120) return [];

  const value = await requestJson(PRISRADAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName: "SearchSuggestions",
      query: SEARCH_SUGGESTIONS_QUERY,
      variables: { query: normalizedQuery },
    }),
  });
  const suggestions = isPlainRecord(value) && isPlainRecord(value.data) && isPlainRecord(value.data.suggestions)
    ? value.data.suggestions
    : undefined;
  if (!Array.isArray(suggestions?.products)) return [];

  return suggestions.products
    .map((product) => readPrisradarProduct(product, normalizedQuery))
    .filter((product): product is PrisradarProduct => product !== undefined)
    .sort((first, second) => second.matchScore - first.matchScore);
}

function readPrisradarProduct(value: unknown, query: string): PrisradarProduct | undefined {
  if (!isPlainRecord(value)) return undefined;
  const slug = readStringLike(value.slug);
  const title = readStringLike(value.title);
  if (slug === undefined || title === undefined) return undefined;

  return {
    productUrl: `${PRISRADAR_PRODUCT_URL}${encodeURIComponent(slug)}`,
    title,
    matchScore: scorePrisradarProductMatch(query, title),
  };
}

function buildPrisradarTextQueries(searchTerm: string): string[] {
  const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
  const cleanedSearchTerm = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(normalizedSearchTerm));
  const withoutSize = normalizedSearchTerm
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg|stk|pk|pack)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanedWithoutSize = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(withoutSize));
  const cleanedWithoutStandaloneNumbers = removeStandaloneNumberTokens(cleanedSearchTerm);
  const cleanedWithoutSizeOrStandaloneNumbers = removeStandaloneNumberTokens(cleanedWithoutSize);

  return uniqueStrings([
    normalizedSearchTerm,
    cleanedSearchTerm,
    withoutSize !== normalizedSearchTerm ? withoutSize : undefined,
    cleanedWithoutSize !== cleanedSearchTerm ? cleanedWithoutSize : undefined,
    cleanedWithoutStandaloneNumbers !== cleanedSearchTerm ? cleanedWithoutStandaloneNumbers : undefined,
    cleanedWithoutSizeOrStandaloneNumbers !== cleanedWithoutSize ? cleanedWithoutSizeOrStandaloneNumbers : undefined,
  ]);
}

function cleanPrisradarSearchQuery(value: string): string {
  return value
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+[-–—:|/]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeDerivedAcronymTokens(value: string): string {
  const keptTokens: string[] = [];
  const previousParts: string[] = [];

  for (const token of value.split(/\s+/)) {
    const normalizedToken = normalizeMatchToken(token);
    if (normalizedToken === undefined) continue;

    if (!isDerivedAcronymToken(normalizedToken, previousParts)) {
      keptTokens.push(token);
    }

    previousParts.push(...splitTokenParts(token));
  }

  return keptTokens.join(" ").replace(/\s+/g, " ").trim();
}

function removeStandaloneNumberTokens(value: string): string {
  return value
    .split(/\s+/)
    .filter((token) => !/^\d{1,2}$/.test(token))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDerivedAcronymToken(token: string, previousParts: string[]): boolean {
  const letters = token.replace(/\d/g, "");
  const digits = token.replace(/\D/g, "");
  if (letters.length < 2 || letters.length > 5 || previousParts.length === 0) return false;

  const alphaParts = previousParts.filter((part) => /[a-z]/.test(part));
  const recentInitials = alphaParts
    .slice(-letters.length)
    .map((part) => part[0])
    .join("");
  if (recentInitials !== letters) return false;

  if (digits.length === 0) return true;
  const previousDigits = previousParts.join("").replace(/\D/g, "");
  return [...digits].every((digit) => previousDigits.includes(digit));
}

function splitTokenParts(value: string): string[] {
  return value
    .replace(/([a-zæøå])([A-ZÆØÅ])/g, "$1 $2")
    .split(/[^A-Za-z0-9ÆØÅæøå]+/)
    .map(normalizeMatchToken)
    .filter((part): part is string => part !== undefined);
}

function scorePrisradarProductMatch(query: string, title: string): number {
  const queryTokens = tokenizeMatchText(query);
  const titleTokens = new Set(tokenizeMatchText(title));
  if (queryTokens.length === 0 || titleTokens.size === 0) return 0;

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const token of queryTokens) {
    const weight = token.length >= 6 ? 2 : token.length >= 4 ? 1.5 : 1;
    totalWeight += weight;
    if (titleTokens.has(token)) {
      matchedWeight += weight;
      continue;
    }

    if ([...titleTokens].some((titleToken) => titleToken.length >= 4 && (titleToken.startsWith(token) || token.startsWith(titleToken)))) {
      matchedWeight += weight * 0.5;
    }
  }

  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  return hasUnrequestedConditionVariant(queryTokens, titleTokens) ? score * 0.2 : score;
}

function hasUnrequestedConditionVariant(queryTokens: string[], titleTokens: Set<string>): boolean {
  return CONDITION_VARIANT_TOKENS.some((token) => titleTokens.has(token) && !queryTokens.includes(token));
}

const CONDITION_VARIANT_TOKENS = ["fornyet", "refurbished", "renewed", "brukt", "used", "preowned"];

function tokenizeMatchText(value: string): string[] {
  return uniqueStrings(splitTokenParts(value)
    .map(canonicalizeMatchToken)
    .filter((token) => token.length >= 2));
}

function normalizeMatchToken(value: string): string | undefined {
  const normalized = transliterateNorwegianCharacters(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function canonicalizeMatchToken(token: string): string {
  return CANONICAL_MATCH_TOKENS.get(token) ?? token;
}

const CANONICAL_MATCH_TOKENS = new Map<string, string>([
  ["wireless", "tradlos"],
  ["controller", "kontroller"],
  ["console", "konsoll"],
  ["white", "hvit"],
  ["black", "svart"],
  ["red", "rod"],
  ["blue", "bla"],
  ["green", "gronn"],
  ["yellow", "gul"],
  ["pink", "rosa"],
  ["purple", "lilla"],
  ["silver", "solv"],
  ["gold", "gull"],
  ["gray", "gra"],
  ["grey", "gra"],
  ["brown", "brun"],
  ["orange", "oransje"],
]);

async function fetchPrisradarOfferForUrl(
  productUrl: string,
  requestText: TextRequest,
): Promise<PriceMatchOffer | undefined> {
  const html = await requestText(productUrl, {
    headers: { "Accept": "text/html,application/xhtml+xml" },
  });
  return html !== undefined ? readPrisradarProductPage(html, productUrl) : undefined;
}

function readPrisradarProductPage(html: string, fallbackProductUrl: string): PriceMatchOffer | undefined {
  const product = readPrisradarProductFromNextFlight(html);
  if (!isPlainRecord(product)) return undefined;

  const productName = readStringLike(product.title) ?? readStringLike(product.name) ?? "Prisradar-produkt";
  const productUrl = readStringLike(product.url) ?? fallbackProductUrl;
  const rawOffers = Array.isArray(product.offers) ? product.offers : [];
  const offers = dedupePrisradarOffersByShop(rawOffers
    .map(readPrisradarOffer)
    .filter((offer): offer is PrisradarOffer => offer !== undefined)
    .sort(comparePrisradarOffersByPrice));
  const best = offers[0];
  if (best === undefined) return undefined;

  return {
    source: "prisradar",
    sourceName: "Prisradar",
    shopName: best.shopName,
    amount: best.amount,
    ...(best.sortAmount !== undefined ? { sortAmount: best.sortAmount } : {}),
    currency: best.currency,
    price: best.price,
    productName,
    productUrl,
    alternatives: offers.slice(0, 8).map((offer) => ({
      shopName: offer.shopName,
      amount: offer.amount,
      ...(offer.sortAmount !== undefined ? { sortAmount: offer.sortAmount } : {}),
      currency: offer.currency,
      price: offer.price,
      ...(offer.shippingPrice !== undefined ? { shippingPrice: offer.shippingPrice } : {}),
      ...(offer.totalPrice !== undefined ? { totalPrice: offer.totalPrice } : {}),
    })),
  };
}

function dedupePrisradarOffersByShop(offers: PrisradarOffer[]): PrisradarOffer[] {
  const bestByShopName = new Map<string, PrisradarOffer>();
  for (const offer of offers) {
    const key = normalizeShopName(offer.shopName);
    const existing = bestByShopName.get(key);
    if (
      existing === undefined ||
      offer.amount < existing.amount ||
      (offer.amount === existing.amount && (offer.sortAmount ?? offer.amount) < (existing.sortAmount ?? existing.amount))
    ) {
      bestByShopName.set(key, offer);
    }
  }

  return [...bestByShopName.values()].sort(comparePrisradarOffersByPrice);
}

function comparePrisradarOffersByPrice(first: PrisradarOffer, second: PrisradarOffer): number {
  const priceDifference = first.amount - second.amount;
  return priceDifference !== 0 ? priceDifference : (first.sortAmount ?? first.amount) - (second.sortAmount ?? second.amount);
}

function normalizeShopName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function comparePrisradarMatchedOffers(first: PrisradarMatchedOffer, second: PrisradarMatchedOffer): number {
  const distanceDifference = first.merchantPriceDistance - second.merchantPriceDistance;
  if (distanceDifference !== 0) return distanceDifference;

  const scoreDifference = second.product.matchScore - first.product.matchScore;
  if (scoreDifference !== 0) return scoreDifference;

  return first.offer.amount - second.offer.amount;
}

function getMerchantPriceDistance(
  offer: PriceMatchOffer,
  merchantKeys: string[],
  currentPrice: number | undefined,
): number | undefined {
  if (merchantKeys.length === 0) return undefined;
  const merchantAmounts = [
    { shopName: offer.shopName, amount: offer.amount },
    ...(offer.alternatives?.map((alternative) => ({ shopName: alternative.shopName, amount: alternative.amount })) ?? []),
  ]
    .filter((alternative) => isCurrentMerchantName(alternative.shopName, merchantKeys))
    .map((alternative) => alternative.amount);
  if (merchantAmounts.length === 0) return undefined;
  if (currentPrice === undefined || currentPrice <= 0) return 0;

  return Math.min(...merchantAmounts.map((amount) => Math.abs(amount - currentPrice) / currentPrice));
}

function isCurrentMerchantName(shopName: string, merchantKeys: string[]): boolean {
  const normalizedShopName = normalizeMerchantKey(shopName);
  if (normalizedShopName.length < 3) return false;
  return merchantKeys.some((merchantKey) => {
    return normalizedShopName.includes(merchantKey) || merchantKey.includes(normalizedShopName);
  });
}

function getCurrentMerchantKeys(message: GetPriceMatchForProductMessage): string[] {
  const hostKey = readMerchantKeyFromUrl(message.url);
  const organizationKey = message.organizationName !== undefined
    ? normalizeMerchantKey(message.organizationName)
    : undefined;

  return uniqueStrings([hostKey, organizationKey])
    .filter((key) => key.length >= 3 && !GENERIC_MERCHANT_KEYS.has(key));
}

function readMerchantKeyFromUrl(rawUrl: string): string | undefined {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
    const labels = hostname.split(".").filter((label) => label.length > 0);
    const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    return label !== undefined ? normalizeMerchantKey(label) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeMerchantKey(value: string): string {
  return transliterateNorwegianCharacters(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function transliterateNorwegianCharacters(value: string): string {
  return value
    .replace(/[Ææ]/g, "ae")
    .replace(/[Øø]/g, "o")
    .replace(/[Åå]/g, "a");
}

const GENERIC_MERCHANT_KEYS = new Set(["butikk", "shop", "store", "nettbutikk", "online", "norge", "norway"]);

function readPrisradarProductFromNextFlight(html: string): Record<string, unknown> | undefined {
  const scripts = html.matchAll(/<script[^>]*>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g);

  for (const match of scripts) {
    const encodedPayload = match[1];
    if (encodedPayload === undefined || !encodedPayload.includes("\\\"product\\\":")) continue;

    const payload = decodeNextFlightString(encodedPayload);
    if (payload === undefined) continue;

    const productJson = extractJsonObjectAfter(payload, "\"product\":");
    if (productJson === undefined) continue;

    try {
      const product = JSON.parse(productJson.replace(/"\$undefined"/g, "null")) as unknown;
      if (isPlainRecord(product)) return product;
    } catch {
      continue;
    }
  }

  return undefined;
}

function readPrisradarOffer(value: unknown): PrisradarOffer | undefined {
  if (!isPlainRecord(value)) return undefined;
  const shop = isPlainRecord(value.shop) ? value.shop : undefined;
  const amount = readNumberLike(value.price);
  const shopName = readStringLike(shop?.title) ?? readStringLike(value.shopTitle);
  const availability = readStringLike(value.availability)?.toLowerCase();
  const isUsed = value.isUsed === true;
  if (amount === undefined || amount <= 0 || shopName === undefined || isUsed) return undefined;
  if (availability !== undefined && BAD_AVAILABILITY_STATUSES.has(availability)) return undefined;

  const shippingAmount = readShippingAmount(value);
  const sortAmount = shippingAmount !== undefined ? amount + shippingAmount : undefined;
  return {
    shopName,
    amount,
    ...(sortAmount !== undefined ? { sortAmount } : {}),
    currency: "NOK",
    price: formatNokPrice(amount),
    ...(shippingAmount !== undefined ? { shippingPrice: formatShippingPrice(shippingAmount) } : {}),
    ...(shippingAmount !== undefined && shippingAmount > 0 ? { totalPrice: formatNokPrice(amount + shippingAmount) } : {}),
  };
}

function readShippingAmount(value: Record<string, unknown>): number | undefined {
  if (value.isFreeShipping === true) return 0;

  const amount = readNumberLike(value.shippingPrice);
  return amount !== undefined && amount >= 0 ? amount : undefined;
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

async function fetchText(url: string, init?: Parameters<TextRequest>[1]): Promise<string | undefined> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.text();
  } catch {
    return undefined;
  }
}

function readPrisradarProductUrl(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.replace(/^www\./, "").toLowerCase().endsWith("prisradar.no")) return undefined;
    return PRISRADAR_PRODUCT_PATH_PATTERN.test(url.pathname) ? `${url.origin}${url.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

function decodeNextFlightString(value: string): string | undefined {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return undefined;
  }
}

function extractJsonObjectAfter(value: string, marker: string): string | undefined {
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return undefined;

  const objectStart = value.indexOf("{", markerIndex + marker.length);
  if (objectStart < 0) return undefined;

  let depth = 0;
  let escaped = false;
  let inString = false;
  for (let index = objectStart; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(objectStart, index + 1);
    }
  }

  return undefined;
}

function formatNokPrice(amount: number): string {
  const formatted = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
  return `${formatted} kr`;
}

function formatShippingPrice(amount: number): string {
  return amount <= 0 ? "fri frakt" : `frakt ${formatNokPrice(amount)}`;
}

function readStringLike(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (normalized === "$undefined") return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isLikelyGtin(value: string): boolean {
  const normalized = value.trim();
  return /^(?:\d{8}|\d{12,14})$/.test(normalized);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
