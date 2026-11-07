import { normalizeDomainInput, type CashbackIndex } from "./cashback.js";
import { normalizePriceMatchShopName } from "./product-match.js";

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
