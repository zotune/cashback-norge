import { type CashbackOffer } from "../shared/cashback.js";

export type DomainLookup = ReadonlyMap<string, string[]>;

export function buildDomainLookup(offers: CashbackOffer[]): DomainLookup {
  const lookup = new Map<string, string[]>();

  for (const offer of offers) {
    if (offer.domains.length === 0) {
      continue;
    }

    const keys = extractLookupKeys(offer.merchantName);

    for (const key of keys) {
      if (key.length === 0) {
        continue;
      }

      const existing = lookup.get(key);

      if (existing === undefined) {
        lookup.set(key, [...offer.domains]);
      } else {
        for (const domain of offer.domains) {
          if (!existing.includes(domain)) {
            existing.push(domain);
          }
        }
      }
    }
  }

  return lookup;
}

export function lookupDomains(
  lookup: DomainLookup,
  merchantName: string,
): string[] {
  const keys = extractLookupKeys(merchantName);

  for (const key of keys) {
    const domains = lookup.get(key);

    if (domains !== undefined) {
      return domains;
    }
  }

  return [];
}

function extractLookupKeys(merchantName: string): string[] {
  const parts = merchantName.split(/\s*[\/|]\s*/);
  return parts.map(normalizeMerchantName).filter((key) => key.length > 0);
}

function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(com|no|se|dk|fi|eu|net|io|org|de|co\.uk)$/i, "")
    .replace(/[^a-z0-9æøåäöü]/g, "")
    .trim();
}
