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

const GODPRIS_PRODUCT_URL = "https://godpris.no/produkt/";
const BAD_AVAILABILITY_STATUSES = new Set([
  "discontinued",
  "not_available",
  "not_in_stock",
  "out_of_stock",
]);

export async function findGodprisPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
  requestText: TextRequest = fetchText,
): Promise<PriceMatchOffer | undefined> {
  if (!message.productPageClue && message.searchTerm.trim().length < 8) {
    return undefined;
  }

  const searchQueries = uniqueStrings([
    ...(message.codes ?? []).filter((code) => code.trim().length >= 5),
    message.searchTerm,
  ]);

  for (const query of searchQueries) {
    const productId = await fetchGodprisProductId(query, requestJson);
    if (productId === undefined) continue;

    const html = await requestText(`${GODPRIS_PRODUCT_URL}${encodeURIComponent(productId)}`, {
      headers: { "Accept": "text/html,application/xhtml+xml" },
    });
    const offer = html !== undefined ? readGodprisProductPage(html, productId) : undefined;
    if (offer !== undefined) return offer;
  }

  return undefined;
}

async function fetchGodprisProductId(
  query: string,
  requestJson: JsonRequest,
): Promise<string | undefined> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 4) return undefined;

  const params = new URLSearchParams({ q: normalizedQuery });
  const value = await requestJson(`https://godpris.no/api/product/search?${params.toString()}`, {
    headers: { "Accept": "application/json" },
  });
  if (!isPlainRecord(value) || !Array.isArray(value.results)) return undefined;

  for (const result of value.results) {
    if (!isPlainRecord(result)) continue;
    const id = readStringLike(result.id);
    if (id !== undefined) return id;
  }

  return undefined;
}

function readGodprisProductPage(html: string, fallbackProductId: string): PriceMatchOffer | undefined {
  const page = readGodprisDataPage(html);
  const props = isPlainRecord(page?.props) ? page.props : undefined;
  const product = isPlainRecord(props?.product) ? props.product : undefined;
  const prices = Array.isArray(props?.prices) ? props.prices : [];
  if (product === undefined || prices.length === 0) return undefined;

  const productId = readStringLike(product.id) ?? fallbackProductId;
  const productName = readStringLike(product.title) ?? readStringLike(product.name) ?? "Godpris-produkt";
  const offers = prices
    .map(readGodprisOffer)
    .filter((offer): offer is Omit<PriceMatchOffer, "productName" | "productUrl" | "source" | "sourceName"> => offer !== undefined)
    .sort((first, second) => first.amount - second.amount);
  const best = offers[0];
  if (best === undefined) return undefined;

  return {
    ...best,
    source: "godpris",
    sourceName: "Godpris",
    productName,
    productUrl: `${GODPRIS_PRODUCT_URL}${encodeURIComponent(productId)}`,
  };
}

function readGodprisDataPage(html: string): Record<string, unknown> | undefined {
  const match = html.match(/<div id="app" data-page="([^"]*)"/);
  if (match?.[1] === undefined) return undefined;

  try {
    return JSON.parse(decodeHtmlAttribute(match[1])) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readGodprisOffer(value: unknown): Omit<PriceMatchOffer, "productName" | "productUrl" | "source" | "sourceName"> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const shop = isPlainRecord(value.shop) ? value.shop : undefined;
  const amount = readNumberLike(value.price);
  const shopName = readStringLike(shop?.title) ?? readStringLike(value.shop_title);
  const availability = readStringLike(value.availability)?.toLowerCase();
  if (amount === undefined || amount <= 0 || shopName === undefined) return undefined;
  if (availability !== undefined && BAD_AVAILABILITY_STATUSES.has(availability)) return undefined;

  const offerUrl = readStringLike(value.click_url) ?? readStringLike(value.url);
  return {
    shopName,
    amount,
    currency: "NOK",
    price: formatNokPrice(amount),
    ...(offerUrl !== undefined ? { offerUrl } : {}),
  };
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

function formatNokPrice(amount: number): string {
  const formatted = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
  return `${formatted} kr`;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readStringLike(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
