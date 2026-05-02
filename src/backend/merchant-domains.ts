import {
  normalizeDomainInput,
  toBaseDomain,
  uniqueStrings,
} from "../shared/cashback.js";

export function merchantDomainsFromUrl(input: string): string[] {
  try {
    const parsedUrl = new URL(input);
    return merchantDomainsFromHostname(parsedUrl.hostname);
  } catch {
    return [];
  }
}

export function merchantDomainsFromHostname(hostname: string): string[] {
  const normalizedDomain = normalizeDomainInput(hostname);

  if (!isDomainLike(normalizedDomain)) {
    return [];
  }

  const baseDomain = toBaseDomain(normalizedDomain);
  return uniqueStrings([normalizedDomain, baseDomain]);
}

export function isDomainLike(value: string): boolean {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value.trim());
}
