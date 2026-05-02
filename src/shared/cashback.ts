export type CashbackProvider = "trumf" | "klarna" | "remember" | "sas" | "tfbank" | "dnb" | "curve" | "rabattkode" | "norskfamilie";

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
  return value === "trumf" || value === "klarna" || value === "remember" || value === "sas" || value === "tfbank" || value === "dnb" || value === "curve" || value === "rabattkode" || value === "norskfamilie";
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
  const lookupDomains = [normalizedHostname, ...altDomains];

  const indexMatches: CashbackOffer[] = [];
  for (const domain of lookupDomains) {
    const matches = cashbackIndex.domainIndex[domain] ?? [];
    indexMatches.push(...matches);
  }

  const suffixMatches = cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return (
        normalizedDomain !== normalizedHostname &&
        normalizedHostname.endsWith(`.${normalizedDomain}`)
      );
    });
  });

  return sortOffersByReward(uniqueOffers([...indexMatches, ...suffixMatches]));
}

const COMMON_TLDS = [".com", ".no", ".se", ".dk", ".fi"];

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
      if (punycode !== domain && domainIndex[punycode] === undefined) {
        domainIndex[punycode] = domainIndex[domain];
      }
    } catch { /* ignore invalid domains */ }
  }

  // Deduplicate within each domain: keep one offer per provider+reward+code
  for (const domain of Object.keys(domainIndex)) {
    const seen = new Set<string>();
    domainIndex[domain] = domainIndex[domain].filter((offer) => {
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
    // Keep the offer with more domain info, or the later one
    if (existing === undefined || offer.domains.length >= existing.domains.length) {
      byKey.set(key, offer);
    }
  }

  return sortOffers([...byKey.values()]);
}

export function sortOffersByReward(offers: CashbackOffer[]): CashbackOffer[] {
  return [...offers].sort((firstOffer, secondOffer) => {
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
  kind: "percentage" | "fixed" | "points" | "unknown";
  amount: number;
};

function parseRewardValue(reward: string): RewardValue {
  const percentageMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*%/);

  if (percentageMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber(percentageMatch[1] ?? "0"),
    };
  }

  const fixedMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*kr/i);

  if (fixedMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber(fixedMatch[1] ?? "0"),
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

  if (kind === "points") {
    return 2;
  }

  return 1;
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
