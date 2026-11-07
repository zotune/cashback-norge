import { isRecord } from "./cashback.js";
import { readPriceAmount } from "./price.js";
import { readKlarnaOffers } from "./klarna-price-match.js";
import type { ProductDeal } from "./product-deals.js";

export const KLARNA_DEALS_API = "https://www.klarna.com/no/api/deals-edge-rest/public/search/deals/products/v3/NO";
export const klarnaOffersUrl = (id: string) => `https://www.klarna.com/no/api/product-detail-edge-rest/public/product-detail/v0/offers/NO/${encodeURIComponent(id)}?af_ORIGIN=NATIONAL&af_ITEM_CONDITION=NEW,UNKNOWN&sortByPreset=PRICE`;
export type KlarnaDealCandidate = { id: string; name: string; productUrl: string; category?: string; imageUrl?: string; referencePrice: number; sourceRank: number };

/** Verified Nov 2026 against the sale page's dehydrated query and actual API
 * responses. Listing minima are candidates only; every row needs offer detail. */
export function readKlarnaDealCandidates(value: unknown, offset = 0): KlarnaDealCandidate[] {
  if (!isRecord(value) || !Array.isArray(value.products)) throw new Error("Klarna deals: missing products array");
  return value.products.flatMap((product, index) => {
    if (!isRecord(product) || product.condition !== "NEW" || product.outOfStock === true || typeof product.id !== "string" || !/^\d+$/.test(product.id) || typeof product.name !== "string" || typeof product.url !== "string") return [];
    const drop = isRecord(product.priceDrop) && isRecord(product.priceDrop.oldPrice) ? product.priceDrop.oldPrice : undefined;
    const referencePrice = drop?.currency === "NOK" ? readPriceAmount(drop.amount) : undefined;
    if (!referencePrice || !isRecord(product.lowestPrice) || product.lowestPrice.currency !== "NOK") return [];
    const productUrl = new URL(product.url, "https://www.klarna.com/no/shopping").href;
    // Klarna paths start /pl/, relative to /no/shopping, not to the origin.
    const url = product.url.startsWith("/pl/") ? `https://www.klarna.com/no/shopping${product.url}` : productUrl;
    if (!url.startsWith("https://www.klarna.com/no/shopping/pl/")) return [];
    const image = isRecord(product.image) ? product.image : undefined;
    const imageUrl = typeof image?.path === "string" && image.path.startsWith("/product/") ? `https://owp.klarna.com${image.path}` : undefined;
    return [{ id: product.id, name: product.name, productUrl: url, referencePrice, sourceRank: offset + index + 1,
      ...(isRecord(product.category) && typeof product.category.name === "string" ? { category: product.category.name } : {}), ...(imageUrl ? { imageUrl } : {}) }];
  });
}

export function readKlarnaDeal(candidate: KlarnaDealCandidate, value: unknown, updatedAt: string): ProductDeal | undefined {
  const offers = readKlarnaOffers(value, { requireInStock: true, productName: candidate.name });
  const best = offers[0];
  if (!best || best.amount >= candidate.referencePrice) return undefined;
  const { referencePrice, ...product } = candidate;
  return { ...product, source: "klarna", updatedAt, store: best.shopName, price: best.amount, currency: "NOK", referencePrice,
    referenceLabel: "Klarnas sammenligningspris før prisfallet", priceDrop: Math.round((referencePrice - best.amount) / referencePrice * 100), storeCount: offers.length,
    ...(best.offerUrl ? { offerUrl: best.offerUrl } : {}), ...(best.storeUrl ? { storeUrl: best.storeUrl } : {}),
    ...(best.shippingAmount !== undefined ? { shippingAmount: best.shippingAmount } : {}), ...(best.validTo ? { validTo: best.validTo } : {}) };
}
