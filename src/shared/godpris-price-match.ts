import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import {
  buildProductMatchAnchor,
  hasProductVariantConflict,
  isLikelyGtin,
  isLikelyMpn,
  scoreProductCandidateMatch,
  MIN_PRODUCT_MATCH_SCORE,
  type ProductMatchAnchor,
} from "./product-match.js";
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

export type GodprisPriceMatchOptions = {
  anchorSearchTerms?: string[];
};

export async function findGodprisPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
  requestText: TextRequest = fetchText,
  options: GodprisPriceMatchOptions = {},
): Promise<PriceMatchOffer | undefined> {
  if (!message.productPageClue && message.searchTerm.trim().length < 8) {
    return undefined;
  }

  const codes = message.codes ?? [];
  const searchQueries = uniqueStrings([
    ...codes.filter(isLikelyGtin),
    ...codes.filter(isLikelyMpn),
    message.searchTerm,
    ...(options.anchorSearchTerms ?? []),
  ]);
  const anchor = buildProductMatchAnchor(message);

  const visitedProductIds = new Set<string>();
  for (const query of searchQueries) {
    // Prøv alle godkjente kandidater i scorerekkefølge, ikke bare den beste:
    // første kandidat kan ha utilgjengelig side eller feile variant-guarden.
    const productIds = await fetchGodprisProductIds(query, requestJson, anchor);
    for (const productId of productIds) {
      if (visitedProductIds.has(productId)) continue;
      visitedProductIds.add(productId);

      const html = await requestText(`${GODPRIS_PRODUCT_URL}${encodeURIComponent(productId)}`, {
        headers: { "Accept": "text/html,application/xhtml+xml" },
      });
      const offer = html !== undefined ? readGodprisProductPage(html, productId, anchor) : undefined;
      if (offer !== undefined) return offer;
    }
  }

  return undefined;
}

async function fetchGodprisProductIds(
  query: string,
  requestJson: JsonRequest,
  anchor: ProductMatchAnchor,
): Promise<string[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 4) return [];

  const params = new URLSearchParams({ q: normalizedQuery });
  const value = await requestJson(`https://godpris.no/api/product/search?${params.toString()}`, {
    headers: { "Accept": "application/json" },
  });
  if (!isPlainRecord(value) || !Array.isArray(value.results)) return [];

  // Kodesøk (GTIN/MPN) skal fortsatt tittelvalideres mot sidens egen tittel.
  const isCodeQuery = isLikelyGtin(normalizedQuery) || isLikelyMpn(normalizedQuery);
  const matchAnchor = isCodeQuery ? anchor : { ...anchor, searchTerm: normalizedQuery };
  const matches: Array<{ id: string; score: number }> = [];
  for (const result of value.results) {
    if (!isPlainRecord(result)) continue;
    const id = readStringLike(result.id);
    if (id === undefined) continue;

    const title = readStringLike(result.title);
    const groupTitle = readStringLike(result.group_title);
    const brand = readStringLike(result.brand);
    const score = Math.max(
      title !== undefined ? scoreProductCandidateMatch(matchAnchor, { title, brand }) : 0,
      groupTitle !== undefined ? scoreProductCandidateMatch(matchAnchor, { title: groupTitle, brand }) : 0,
    );
    if (score >= MIN_PRODUCT_MATCH_SCORE) {
      matches.push({ id, score });
    }
  }

  return matches
    .sort((first, second) => second.score - first.score)
    .slice(0, 3)
    .map((match) => match.id);
}

function readGodprisProductPage(
  html: string,
  fallbackProductId: string,
  anchor: ProductMatchAnchor,
): PriceMatchOffer | undefined {
  const page = readGodprisDataPage(html);
  const props = isPlainRecord(page?.props) ? page.props : undefined;
  const product = isPlainRecord(props?.product) ? props.product : undefined;
  const prices = Array.isArray(props?.prices) ? props.prices : [];
  if (product === undefined || prices.length === 0) return undefined;

  const productId = readStringLike(product.id) ?? fallbackProductId;
  const rawProductName = readStringLike(product.title) ?? readStringLike(product.name);
  const productBrand = readStringLike(product.brand);
  const productName = withLeadingBrand(rawProductName, productBrand) ?? "Godpris-produkt";
  if (hasProductVariantConflict(anchor, productName)) return undefined;

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
    alternatives: offers.slice(0, 8).map((offer) => ({
      shopName: offer.shopName,
      amount: offer.amount,
      currency: offer.currency,
      price: offer.price,
    })),
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

function withLeadingBrand(productName: string | undefined, brandName: string | undefined): string | undefined {
  if (productName === undefined) return undefined;
  if (brandName === undefined || productName.toLowerCase().includes(brandName.toLowerCase())) return productName;
  return `${brandName} ${productName}`;
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
