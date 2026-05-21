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

  const searchQueries = uniqueStrings([
    ...(message.codes ?? []).filter(isLikelyGtin),
    message.searchTerm,
  ]);

  for (const query of searchQueries) {
    const products = await fetchPrisradarProducts(query, requestJson);
    for (const product of products.slice(0, 3)) {
      const offer = await fetchPrisradarOfferForUrl(product.productUrl, requestText);
      if (offer !== undefined) return offer;
    }
  }

  return undefined;
}

type PrisradarProduct = {
  productUrl: string;
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
    .filter((product): product is PrisradarProduct => product !== undefined);
}

function readPrisradarProduct(value: unknown): PrisradarProduct | undefined {
  if (!isPlainRecord(value)) return undefined;
  const slug = readStringLike(value.slug);
  if (slug === undefined) return undefined;

  return {
    productUrl: `${PRISRADAR_PRODUCT_URL}${encodeURIComponent(slug)}`,
  };
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
  const offers = rawOffers
    .map(readPrisradarOffer)
    .filter((offer): offer is PrisradarOffer => offer !== undefined)
    .sort((first, second) => (first.sortAmount ?? first.amount) - (second.sortAmount ?? second.amount));
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
