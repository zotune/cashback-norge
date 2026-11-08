import { normalizeDomainInput } from "../../shared/cashback.js";
import { normalizeMerchantName, lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { ProviderOverrides } from "../provider-overrides.js";

export function promotionDomains(input: {
  provider: string; merchantName: string; destination: string;
  overrides: ProviderOverrides; domainLookup: DomainLookup;
}): string[] {
  const explicit = input.overrides[input.provider]?.[input.merchantName.toLowerCase()];
  if (explicit !== undefined) return [...new Set(explicit.map(normalizeDomainInput).filter(Boolean))];
  const known = lookupDomains(input.domainLookup, input.merchantName);
  if (known.length > 0) return known;
  let url: URL;
  try { url = new URL(input.destination); } catch { return []; }
  // Read an explicit destination without following/triggering affiliate clicks.
  // A tracking hostname is never itself merchant evidence.
  const target = url.searchParams.get("url");
  if (target?.startsWith("https://")) {
    try { url = new URL(target); } catch { return []; }
  }
  if (url.protocol !== "https:" || url.username || url.password) return [];
  const host = normalizeDomainInput(url.hostname);
  const brand = normalizeMerchantName(input.merchantName);
  // Require an exact brand label (not includes: ice must not match service.no).
  // Keep unproven mappings site-only rather than guessing a merchant domain.
  const parts = host.split(".");
  const brandLabel = parts.at(-2) ?? "";
  return brand && normalizeMerchantName(brandLabel) === brand ? [parts.slice(-2).join(".")] : [];
}
