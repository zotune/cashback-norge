import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import {
  buildProductMatchAnchor,
  isLikelyGtin,
  pickBestProductCandidate,
  type ProductMatchAnchor,
} from "./product-match.js";
import type { JsonRequest } from "./prisjakt-price-match.js";

const KLARNA_PRODUCT_URL = "https://www.klarna.com/no/shopping";
const KLARNA_SEARCH_URL = "https://www.klarna.com/no/api/instant-search-edge-rest/public/search/suggest/NO";
const KLARNA_OFFERS_URL = "https://www.klarna.com/no/api/product-detail-edge-rest/public/product-detail/v0/offers/NO";
const KLARNA_PRODUCT_PATH_PATTERN = /\/shopping\/pl\/(?:cl\d+\/)?(\d+)\//;
const BAD_AVAILABILITY_STATUSES = new Set(["UNAVAILABLE", "UNAVAILABLE_ON_REQUEST", "TEMPORARILY_UNAVAILABLE"]);
const BAD_STOCK_STATUSES = new Set(["OUT_OF_STOCK", "NOT_IN_STOCK"]);
const CODE_QUERY_MIN_MATCH_SCORE = 0.3;

export async function findKlarnaPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
): Promise<PriceMatchOffer | undefined> {
  if (!message.productPageClue && message.searchTerm.trim().length < 8) {
    return undefined;
  }

  const directProductId = readKlarnaProductIdFromUrl(message.url) ?? readKlarnaProductIdFromUrl(message.productUrl);
  if (directProductId !== undefined) {
    const directOffer = await fetchKlarnaOfferForProduct({
      id: directProductId,
      name: message.searchTerm,
      productUrl: `${KLARNA_PRODUCT_URL}/pl/${directProductId}/`,
    }, requestJson);
    if (directOffer !== undefined) return directOffer;
  }

  const searchQueries = uniqueStrings([
    ...(message.codes ?? []).filter(isLikelyGtin),
    message.searchTerm,
  ]);
  const anchor = buildProductMatchAnchor(message);

  for (const query of searchQueries) {
    const product = await fetchKlarnaProduct(query, requestJson, anchor, isLikelyGtin(query));
    if (product === undefined) continue;

    const offer = await fetchKlarnaOfferForProduct(product, requestJson);
    if (offer !== undefined) return offer;
  }

  return undefined;
}

type KlarnaProduct = {
  id: string;
  name: string;
  productUrl: string;
};

type KlarnaOffer = {
  shopName: string;
  amount: number;
  sortAmount: number;
  shippingAmount: number;
  currency: string;
  price: string;
  offerUrl?: string;
};

async function fetchKlarnaProduct(
  query: string,
  requestJson: JsonRequest,
  anchor: ProductMatchAnchor,
  isCodeQuery: boolean,
): Promise<KlarnaProduct | undefined> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 4 || normalizedQuery.length > 100) return undefined;

  const params = new URLSearchParams({ q: normalizedQuery });
  const value = await requestJson(`${KLARNA_SEARCH_URL}?${params.toString()}`, {
    headers: { "Accept": "application/json" },
  });
  if (!isPlainRecord(value) || !Array.isArray(value.products)) return undefined;

  const candidates: KlarnaProduct[] = [];
  for (const product of value.products) {
    if (!isPlainRecord(product)) continue;
    const id = readStringLike(product.id);
    const name = readStringLike(product.name);
    const path = readStringLike(product.url);
    const lowestPrice = isPlainRecord(product.lowestPrice) ? product.lowestPrice : undefined;
    const currency = readStringLike(lowestPrice?.currency);
    const outOfStock = product.outOfStock === true;
    if (id !== undefined && name !== undefined && path !== undefined && currency === "NOK" && !outOfStock) {
      candidates.push({
        id,
        name,
        productUrl: `${KLARNA_PRODUCT_URL}${path}`,
      });
    }
  }

  // Kodesøk (GTIN) treffer eksakt hos Klarna, men en feilhøstet kode gir eksakt
  // feil produkt — også kodetreff må ligne på sidens tittel (lavere terskel,
  // siden GTIN-treff kan ha annet språk/kortform).
  if (isCodeQuery) {
    return pickBestProductCandidate(anchor, candidates, (candidate) => ({ title: candidate.name }), CODE_QUERY_MIN_MATCH_SCORE);
  }

  return pickBestProductCandidate(anchor, candidates, (candidate) => ({ title: candidate.name }));
}

async function fetchKlarnaOfferForProduct(
  product: KlarnaProduct,
  requestJson: JsonRequest,
): Promise<PriceMatchOffer | undefined> {
  const params = new URLSearchParams({
    af_ORIGIN: "NATIONAL",
    af_ITEM_CONDITION: "NEW,UNKNOWN",
    sortByPreset: "PRICE",
  });
  const value = await requestJson(`${KLARNA_OFFERS_URL}/${encodeURIComponent(product.id)}?${params.toString()}`, {
    headers: { "Accept": "application/json" },
  });
  if (!isPlainRecord(value) || !Array.isArray(value.offers)) return undefined;

  const merchants = isPlainRecord(value.merchants) ? value.merchants : {};
  const offers = dedupeKlarnaOffersByShop(value.offers
    .map((offer) => readKlarnaOffer(offer, merchants))
    .filter((offer): offer is KlarnaOffer => offer !== undefined)
    .sort(compareKlarnaOffersByPrice));
  const best = offers[0];
  if (best === undefined) return undefined;

  return {
    source: "klarna",
    sourceName: "Klarna",
    shopName: best.shopName,
    amount: best.amount,
    sortAmount: best.sortAmount,
    currency: best.currency,
    price: best.price,
    productName: product.name,
    productUrl: product.productUrl,
    ...(best.offerUrl !== undefined ? { offerUrl: best.offerUrl } : {}),
    alternatives: offers.slice(0, 8).map((offer) => ({
      shopName: offer.shopName,
      amount: offer.amount,
      sortAmount: offer.sortAmount,
      currency: offer.currency,
      price: offer.price,
      shippingPrice: formatShippingPrice(offer.shippingAmount),
      ...(offer.shippingAmount > 0 ? { totalPrice: formatNokPrice(offer.sortAmount) } : {}),
    })),
  };
}

function dedupeKlarnaOffersByShop(offers: KlarnaOffer[]): KlarnaOffer[] {
  const bestByShopName = new Map<string, KlarnaOffer>();
  for (const offer of offers) {
    const key = normalizeShopName(offer.shopName);
    const existing = bestByShopName.get(key);
    if (
      existing === undefined ||
      offer.amount < existing.amount ||
      (offer.amount === existing.amount && offer.sortAmount < existing.sortAmount)
    ) {
      bestByShopName.set(key, offer);
    }
  }

  return [...bestByShopName.values()].sort(compareKlarnaOffersByPrice);
}

function compareKlarnaOffersByPrice(first: KlarnaOffer, second: KlarnaOffer): number {
  const priceDifference = first.amount - second.amount;
  return priceDifference !== 0 ? priceDifference : first.sortAmount - second.sortAmount;
}

function normalizeShopName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function readKlarnaOffer(value: unknown, merchants: Record<string, unknown>): KlarnaOffer | undefined {
  if (!isPlainRecord(value)) return undefined;
  const price = isPlainRecord(value.price) ? value.price : undefined;
  const campaignPrice = isPlainRecord(value.campaignPrice) ? value.campaignPrice : undefined;
  const campaignPriceValue = isPlainRecord(campaignPrice?.price) && isActiveKlarnaCampaignPrice(campaignPrice)
    ? campaignPrice.price
    : undefined;
  const effectivePrice = campaignPriceValue ?? price;
  const shippingCost = isPlainRecord(value.shippingCost) ? value.shippingCost : undefined;
  const amount = readNumberLike(effectivePrice?.amount);
  const shippingAmount = readNumberLike(shippingCost?.amount) ?? 0;
  const currency = readStringLike(effectivePrice?.currency);
  const merchantId = readStringLike(value.merchantId);
  const merchant = merchantId !== undefined && isPlainRecord(merchants[merchantId]) ? merchants[merchantId] : undefined;
  const shopName = readStringLike(merchant?.name);
  const availability = readStringLike(value.availability)?.toUpperCase();
  const stockStatus = readStringLike(value.stockStatus)?.toUpperCase();
  if (amount === undefined || amount <= 0 || currency !== "NOK" || shopName === undefined) return undefined;
  if (availability !== undefined && BAD_AVAILABILITY_STATUSES.has(availability)) return undefined;
  if (stockStatus !== undefined && BAD_STOCK_STATUSES.has(stockStatus)) return undefined;

  const offerUrl = toAbsoluteKlarnaUrl(readStringLike(value.url));
  return {
    shopName,
    amount,
    sortAmount: amount + shippingAmount,
    shippingAmount,
    currency,
    price: formatNokPrice(amount),
    ...(offerUrl !== undefined ? { offerUrl } : {}),
  };
}

function isActiveKlarnaCampaignPrice(campaignPrice: Record<string, unknown>): boolean {
  const effectiveDate = isPlainRecord(campaignPrice.salePriceEffectiveDate)
    ? campaignPrice.salePriceEffectiveDate
    : undefined;
  const startTime = readTimeValue(effectiveDate?.start);
  const endTime = readTimeValue(effectiveDate?.end);
  const now = Date.now();
  if (startTime !== undefined && now < startTime) return false;
  if (endTime !== undefined && now > endTime) return false;
  return true;
}

function readTimeValue(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
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

function readKlarnaProductIdFromUrl(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    return url.hostname.endsWith("klarna.com") ? url.pathname.match(KLARNA_PRODUCT_PATH_PATTERN)?.[1] : undefined;
  } catch {
    return undefined;
  }
}

function toAbsoluteKlarnaUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return new URL(value, "https://www.klarna.com").toString();
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
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
