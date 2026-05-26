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
    .slice(0, 5);
  const merchantKeys = message !== undefined ? getCurrentMerchantKeys(message) : [];
  for (const product of rankedProducts) {
    const offer = await fetchPrisradarOfferForUrl(product.productUrl, requestText);
    if (offer !== undefined && (message === undefined || priceMatchOfferIncludesMerchant(offer, merchantKeys))) return offer;
  }

  return undefined;
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
    .map(readPrisradarProduct)
    .filter((product): product is PrisradarProduct => product !== undefined)
    .sort((first, second) => second.matchScore - first.matchScore);
}

function readPrisradarProduct(value: unknown): PrisradarProduct | undefined {
  if (!isPlainRecord(value)) return undefined;
  const slug = readStringLike(value.slug);
  const title = readStringLike(value.title);
  if (slug === undefined || title === undefined) return undefined;

  return {
    productUrl: `${PRISRADAR_PRODUCT_URL}${encodeURIComponent(slug)}`,
    title,
    matchScore: 1,
  };
}

function buildPrisradarTextQueries(searchTerm: string): string[] {
  const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
  const withoutSize = normalizedSearchTerm
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg|stk|pk|pack)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return uniqueStrings([
    normalizedSearchTerm,
    withoutSize !== normalizedSearchTerm ? withoutSize : undefined,
  ]);
}

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

function priceMatchOfferIncludesMerchant(offer: PriceMatchOffer, merchantKeys: string[]): boolean {
  if (merchantKeys.length === 0) return false;
  const shopNames = [
    offer.shopName,
    ...(offer.alternatives?.map((alternative) => alternative.shopName) ?? []),
  ];

  return shopNames.some((shopName) => {
    const normalizedShopName = normalizeMerchantKey(shopName);
    if (normalizedShopName.length < 3) return false;
    return merchantKeys.some((merchantKey) => {
      return normalizedShopName.includes(merchantKey) || merchantKey.includes(normalizedShopName);
    });
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
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
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
