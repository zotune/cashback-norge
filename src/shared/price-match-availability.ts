import type { PriceMatchAlternative, PriceMatchOffer } from "./extension-messages.js";
import { normalizePriceMatchShopName } from "./product-match.js";
import { isSameTcgProductTitle } from "./tcg-product-match.js";

export type VerifiedPriceMatchAvailability = Pick<PriceMatchOffer, "productName" | "productUrl"> & {
  preorders: Array<Pick<PriceMatchAlternative, "shopName" | "amount" | "currency">>;
};

export function isExplicitPreorder(...values: unknown[]): boolean {
  return values.some((value) => value === true || typeof value === "string" &&
    /^(?:pre[\s_-]?order(?:ed|able)?|forh[aå]ndsbestilling)$/i.test(value.trim()));
}

// Apply only verified facts for this product, merchant, currency and exact price.
export function excludeVerifiedPreorders(offer: PriceMatchOffer, facts: VerifiedPriceMatchAvailability[]): PriceMatchOffer | undefined {
  const preorders = facts.filter((fact) => isSameTcgProductTitle(offer.productName, fact.productName)).flatMap((fact) => fact.preorders);
  if (preorders.length === 0) return offer;
  const blocked = (item: Pick<PriceMatchAlternative, "shopName" | "amount" | "currency">) => preorders.some((preorder) =>
    normalizePriceMatchShopName(preorder.shopName) === normalizePriceMatchShopName(item.shopName) &&
    preorder.amount === item.amount && preorder.currency === item.currency);
  const alternatives = offer.alternatives?.length ? offer.alternatives : [{ shopName: offer.shopName, price: offer.price, amount: offer.amount, currency: offer.currency }];
  const remaining = alternatives.filter((alternative) => !blocked(alternative));
  if (remaining.length === alternatives.length) return offer;
  const best = remaining[0];
  if (best === undefined) return undefined;
  const details = [offer.details, "Bekreftet forhåndsbestilling er utelatt."].filter(Boolean).join(" ");
  if (!blocked(offer)) return { ...offer, alternatives: remaining, details };
  const { offerUrl: _offerUrl, sortAmount: _sortAmount, ...base } = offer;
  return { ...base, shopName: best.shopName, amount: best.amount, price: best.price, currency: best.currency,
    ...(best.sortAmount !== undefined ? { sortAmount: best.sortAmount } : {}), alternatives: remaining, details };
}
