import { normalizeDomainInput, type CashbackIndex } from "./cashback.js";
import { normalizePriceMatchShopName } from "./product-match.js";

/** Shared favicon source for the home page and the daily offer image snapshot. */
export function getMerchantFaviconUrl(value: string): string | undefined {
  const domain = normalizeDomainInput(value);
  if (!domain || !domain.includes(".")) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

/** Reuse verified merchant/domain links, accepting a name only when it is unambiguous.
 * A CDN logo or a click tracking hostname never supplies a merchant domain.
 */
export function createDealMerchantLookup(index: Pick<CashbackIndex, "offers">): (name: string) => string | undefined {
  const domains = new Map<string, Set<string>>();
  for (const offer of index.offers) {
    for (const raw of offer.domains) {
      const domain = normalizeDomainInput(raw);
      if (!domain || !domain.includes(".")) continue;
      const keys = [normalizePriceMatchShopName(offer.merchantName), normalizePriceMatchShopName(domain)];
      for (const key of keys) {
        if (!domains.has(key)) domains.set(key, new Set());
        domains.get(key)!.add(domain);
      }
    }
  }
  return (name) => {
    const candidates = domains.get(normalizePriceMatchShopName(name));
    return candidates?.size === 1 ? [...candidates][0] : undefined;
  };
}
