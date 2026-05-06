import { normalizeRewardLabel } from "./reward.js";

const EB_PER_TRUMF_KR = 13.5;

export type CashbackProvider = "trumf" | "klarna" | "remember" | "sas" | "tfbank" | "dnb" | "curve" | "rabattkode" | "norskfamilie" | "obos" | "logbuy" | "naf" | "sparebank1" | "cbn";

export type CashbackOffer = {
  provider: CashbackProvider;
  merchantName: string;
  domains: string[];
  reward: string;
  sourceUrl: string;
  activationUrl: string;
  terms: string;
  discountCode?: string;
  updatedAt: string;
};

export type CashbackIndex = {
  version: number;
  generatedAt: string;
  offers: CashbackOffer[];
  domainIndex: Record<string, CashbackOffer[]>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCashbackProvider(value: unknown): value is CashbackProvider {
  return value === "trumf" || value === "klarna" || value === "remember" || value === "sas" || value === "tfbank" || value === "dnb" || value === "curve" || value === "rabattkode" || value === "norskfamilie" || value === "obos" || value === "logbuy" || value === "naf" || value === "sparebank1" || value === "cbn";
}

export function isCashbackOffer(value: unknown): value is CashbackOffer {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isCashbackProvider(value.provider) &&
    typeof value.merchantName === "string" &&
    Array.isArray(value.domains) &&
    value.domains.every((domain) => typeof domain === "string") &&
    typeof value.reward === "string" &&
    typeof value.sourceUrl === "string" &&
    typeof value.activationUrl === "string" &&
    typeof value.terms === "string" &&
    (value.discountCode === undefined || typeof value.discountCode === "string") &&
    typeof value.updatedAt === "string"
  );
}

export function isCashbackIndex(value: unknown): value is CashbackIndex {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.version !== "number" ||
    typeof value.generatedAt !== "string" ||
    !Array.isArray(value.offers) ||
    !isRecord(value.domainIndex)
  ) {
    return false;
  }

  return (
    value.offers.every(isCashbackOffer) &&
    Object.values(value.domainIndex).every((offers) => {
      return Array.isArray(offers) && offers.every(isCashbackOffer);
    })
  );
}

export function normalizeHostname(hostname: string): string {
  const lowerCaseHostname = hostname.trim().toLowerCase();
  const withoutTrailingDot = lowerCaseHostname.endsWith(".")
    ? lowerCaseHostname.slice(0, -1)
    : lowerCaseHostname;

  if (withoutTrailingDot.startsWith("www.")) {
    return withoutTrailingDot.slice(4);
  }

  return withoutTrailingDot;
}

export function normalizeDomainInput(input: string): string {
  const trimmedInput = input.trim();
  const urlLikeInput = trimmedInput.includes("://")
    ? trimmedInput
    : `https://${trimmedInput}`;
  const parsedUrl = parseUrl(urlLikeInput);

  if (parsedUrl !== undefined) {
    return normalizeHostname(parsedUrl.hostname);
  }

  const firstSlashIndex = trimmedInput.indexOf("/");
  const hostPart =
    firstSlashIndex === -1 ? trimmedInput : trimmedInput.slice(0, firstSlashIndex);
  return normalizeHostname(hostPart);
}

const COMPOUND_TLDS = ["co.uk", "com.au", "co.jp", "com.br"];

export function toBaseDomain(domain: string): string {
  for (const tld of COMPOUND_TLDS) {
    if (domain.endsWith(`.${tld}`)) {
      const prefix = domain.slice(0, -(tld.length + 1));
      const lastDot = prefix.lastIndexOf(".");
      return lastDot === -1 ? domain : domain.slice(lastDot + 1);
    }
  }
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join(".");
}

export function parseUrl(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

export function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedDomain = normalizeDomainInput(domain);

  return (
    normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

export function findOffersForHostname(
  cashbackIndex: CashbackIndex,
  hostname: string,
): CashbackOffer[] {
  const normalizedHostname = normalizeHostname(hostname);

  // Also check alternate TLDs: visiting cdon.no should find offers for cdon.com
  const altDomains = getAlternateTldDomains(normalizedHostname);
  // Also check country-code subdomains: visiting lookfantastic.com should find no.lookfantastic.com
  const ccSubdomains = CC_SUBDOMAINS.map((cc) => `${cc}.${normalizedHostname}`);
  // Also check parent domain when on a CC subdomain: visiting no.jbl.com should find jbl.com
  const ccParentDomains = CC_SUBDOMAINS.flatMap((cc) =>
    normalizedHostname.startsWith(`${cc}.`) ? [normalizedHostname.slice(cc.length + 1)] : []
  );
  const lookupDomains = [normalizedHostname, ...altDomains, ...ccSubdomains, ...ccParentDomains];

  const indexMatches: CashbackOffer[] = [];
  for (const domain of lookupDomains) {
    const matches = cashbackIndex.domainIndex[domain] ?? [];
    indexMatches.push(...matches);
  }

  const hasExactMatches = (cashbackIndex.domainIndex[normalizedHostname] ?? []).length > 0;

  const suffixMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return (
        normalizedDomain !== normalizedHostname &&
        normalizedHostname.endsWith(`.${normalizedDomain}`)
      );
    });
  });

  const childDomainMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return lookupDomains.some((lookupDomain) => {
        return (
          normalizedDomain !== lookupDomain &&
          normalizedDomain.endsWith(`.${lookupDomain}`)
        );
      });
    });
  });

  const all = sortOffersByReward(
    uniqueOffers([...indexMatches, ...suffixMatches, ...childDomainMatches]),
  );

  // Keep only the best offer per provider (highest reward wins),
  // but discount codes are always kept individually regardless of provider
  const bestByProvider = new Map<string, CashbackOffer>();
  const discountCodeOffers: CashbackOffer[] = [];
  for (const offer of all) {
    if (offer.discountCode !== undefined && offer.discountCode.length > 0) {
      discountCodeOffers.push(offer);
    } else if (!bestByProvider.has(offer.provider)) {
      bestByProvider.set(offer.provider, offer);
    }
  }
  return sortOffersByReward([...bestByProvider.values(), ...discountCodeOffers]);
}

const COMMON_TLDS = [".com", ".no", ".se", ".dk", ".fi", ".eu"];
const CC_SUBDOMAINS = ["no", "se", "dk", "fi", "de", "fr", "es", "it", "nl", "uk", "us", "eu"];

function getAlternateTldDomains(domain: string): string[] {
  const parts = domain.split(".");
  if (parts.length !== 2) return [];
  const tld = `.${parts[1]}`;
  if (!COMMON_TLDS.includes(tld)) return [];
  const baseName = parts[0];
  return COMMON_TLDS
    .filter((t) => t !== tld)
    .map((t) => `${baseName}${t}`);
}

export function buildCashbackIndex(
  offers: CashbackOffer[],
  generatedAt: string,
): CashbackIndex {
  const normalizedOffers = offers.map((offer) => {
    return {
      ...offer,
      domains: uniqueStrings(offer.domains.map(normalizeDomainInput)),
      reward: normalizeRewardLabel(offer.reward),
    };
  });
  const domainIndex: Record<string, CashbackOffer[]> = {};

  for (const offer of normalizedOffers) {
    for (const domain of offer.domains) {
      const existingOffers = domainIndex[domain] ?? [];
      domainIndex[domain] = [...existingOffers, offer];
    }
  }

  // Also index punycode IDN variants (e.g. smaaungene.no → xn--smungene-b0a.no)
  const NOR_SUBS: [string, string][] = [["aa", "å"], ["oe", "ø"], ["ae", "æ"]];
  for (const domain of Object.keys(domainIndex)) {
    let unicode = domain;
    let changed = false;
    for (const [ascii, nor] of NOR_SUBS) {
      if (unicode.includes(ascii)) {
        unicode = unicode.replaceAll(ascii, nor);
        changed = true;
      }
    }
    if (!changed) continue;
    try {
      const punycode = new URL(`https://${unicode}`).hostname;
      const offersForDomain = domainIndex[domain];
      if (
        punycode !== domain &&
        domainIndex[punycode] === undefined &&
        offersForDomain !== undefined
      ) {
        domainIndex[punycode] = offersForDomain;
      }
    } catch { /* ignore invalid domains */ }
  }

  // Deduplicate within each domain: keep one offer per provider+reward+code
  for (const domain of Object.keys(domainIndex)) {
    const offersForDomain = domainIndex[domain];
    if (offersForDomain === undefined) continue;

    const seen = new Set<string>();
    domainIndex[domain] = offersForDomain.filter((offer) => {
      const codePart = offer.discountCode ?? "";
      const key = `${offer.provider}:${offer.reward}:${codePart}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return {
    version: 1,
    generatedAt,
    offers: sortOffers(uniqueOffers(normalizedOffers)),
    domainIndex,
  };
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => {
    return a.localeCompare(b);
  });
}

export function uniqueOffers(offers: CashbackOffer[]): CashbackOffer[] {
  const byKey = new Map<string, CashbackOffer>();

  for (const offer of offers) {
    const codeSuffix = offer.discountCode !== undefined ? `:${offer.discountCode}` : "";
    const key = `${offer.provider}:${offer.merchantName.toLowerCase()}${codeSuffix}`;
    const existing = byKey.get(key);
    // Keep the offer with the best reward value; prefer range over single when equal
    const newVal = parseRewardValue(offer.reward);
    const existingVal = existing !== undefined ? parseRewardValue(existing.reward) : null;
    const isRange = offer.reward.includes("-");
    const isBetterReward = existingVal === null ||
      rewardKindRank(newVal.kind) > rewardKindRank(existingVal.kind) ||
      (newVal.kind === existingVal.kind && newVal.amount > existingVal.amount);
    if (existing === undefined || isBetterReward || (newVal.amount === existingVal!.amount && isRange && !existing.reward.includes("-"))) {
      byKey.set(key, offer);
    }
  }

  return sortOffers([...byKey.values()]);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

export function sortOffersByReward(offers: CashbackOffer[]): CashbackOffer[] {
  return [...offers].sort((firstOffer, secondOffer) => {
    const firstIsSupport = firstOffer.provider === "cbn";
    const secondIsSupport = secondOffer.provider === "cbn";

    if (firstIsSupport !== secondIsSupport) {
      return firstIsSupport ? 1 : -1;
    }

    const firstReward = parseRewardValue(firstOffer.reward);
    const secondReward = parseRewardValue(secondOffer.reward);
    const rewardKindSort =
      rewardKindRank(secondReward.kind) - rewardKindRank(firstReward.kind);

    if (rewardKindSort !== 0) {
      return rewardKindSort;
    }

    const rewardAmountSort = secondReward.amount - firstReward.amount;

    if (rewardAmountSort !== 0) {
      return rewardAmountSort;
    }

    const merchantSort = firstOffer.merchantName.localeCompare(
      secondOffer.merchantName,
    );

    if (merchantSort !== 0) {
      return merchantSort;
    }

    return firstOffer.provider.localeCompare(secondOffer.provider);
  });
}

type RewardValue = {
  kind: "percentage" | "fixed" | "unit" | "points" | "unknown";
  amount: number;
};

function parseRewardValue(reward: string): RewardValue {
  const rangeMatch = reward.match(/\d+(?:[,.]\d+)?\s*[-\u2013\u2014]\s*(\d+(?:[,.]\d+)?)\s*%/);
  const percentageMatch = rangeMatch
    ? [null, rangeMatch[1]]
    : reward.match(/(\d+(?:[,.]\d+)?)\s*%/);

  if (percentageMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber(percentageMatch[1] ?? "0"),
    };
  }

  const pointsRateMatch = reward.match(/(\d[\d\s]*)\s*poeng\s+per\s+100\s*kr/i);

  if (pointsRateMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber((pointsRateMatch[1] ?? "0").replace(/\s/g, "")) / EB_PER_TRUMF_KR,
    };
  }

  const unitMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*kr\s*\//i);

  if (unitMatch !== null) {
    return {
      kind: "unit",
      amount: parseLocalizedNumber(unitMatch[1] ?? "0"),
    };
  }

  const krRangeMatch = reward.match(/\d[\d\s]*(?:[,.]\d+)?\s*[-\u2013\u2014]\s*(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);

  if (krRangeMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber((krRangeMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }

  const fixedMatch = reward.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);

  if (fixedMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber((fixedMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }

  const pointsMatch = reward.match(/(\d[\d\s]*)\s*poeng/i);

  if (pointsMatch !== null) {
    return {
      kind: "points",
      amount: parseLocalizedNumber((pointsMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }

  return {
    kind: "unknown",
    amount: 0,
  };
}

function parseLocalizedNumber(value: string): number {
  const parsedValue = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function rewardKindRank(kind: RewardValue["kind"]): number {
  if (kind === "percentage") {
    return 4;
  }

  if (kind === "fixed") {
    return 3;
  }

  if (kind === "unit") {
    return 2;
  }

  if (kind === "points") {
    return 1;
  }

  return 0;
}

function sortOffers(offers: CashbackOffer[]): CashbackOffer[] {
  return [...offers].sort((firstOffer, secondOffer) => {
    const merchantSort = firstOffer.merchantName.localeCompare(
      secondOffer.merchantName,
    );

    if (merchantSort !== 0) {
      return merchantSort;
    }

    return firstOffer.provider.localeCompare(secondOffer.provider);
  });
}
