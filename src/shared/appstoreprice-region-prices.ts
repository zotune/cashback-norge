import type {
  PlayStationRegionPrice,
  PlayStationRegionPriceResult,
  RegionPricePlanAlternative,
} from "./playstation-region-prices.js";

type TextRequest = (url: string) => Promise<string | undefined>;
type JsonRequest = (url: string) => Promise<unknown | undefined>;

type AppStorePriceCountry = {
  countryName: string;
  flag: string;
  locale: string;
};

type AppStorePriceConfig = {
  cacheKey: string;
  productId: string;
  productName: string;
  subscriptionId?: string;
  planName?: string;
  sourceUrl: string;
};

type AppStorePriceSubscription = {
  subscriptionId: string;
  name: string;
  duration: string | null;
  localizedNames?: Record<string, string>;
  prices: AppStorePriceSubscriptionPrice[];
};

type AppStorePriceSubscriptionPrice = {
  region: string;
  regionName: string;
  currency: string;
  price: number;
};

type AppStorePricePlanAlternativeEntry = RegionPricePlanAlternative & {
  nokAmount?: number;
};

type AppleSoftwareSearchResult = {
  trackId: number;
  trackName: string;
  artistName?: string;
  sellerName?: string;
  bundleId?: string;
  sellerUrl?: string;
  trackViewUrl?: string;
};

type AppStorePriceDomainCandidate = {
  normalizedDomain: string;
  searchTerms: string[];
};

const APPSTOREPRICE_SOURCE_NAME = "AppStorePrice";
const APPSTOREPRICE_SOUND_CLOUD_URL = "https://appstoreprice.org/en/apps/336353151";
const APPSTOREPRICE_SPOTIFY_URL = "https://appstoreprice.org/en/apps/spotify";
const MAX_APPSTOREPRICE_TOOLTIP_PLANS = 10;
const APPLE_SEARCH_RESULT_LIMIT = 10;
const APPLE_SEARCH_MATCH_THRESHOLD = 70;

const APPSTOREPRICE_DOMAIN_SEARCH_ALIASES: Record<string, string[]> = {
  "chatgpt.com": ["chatgpt", "openai chatgpt"],
  "claude.ai": ["claude", "anthropic claude"],
  "firecore.com": ["firecore", "infuse"],
  "netflix.com": ["netflix"],
  "soundcloud.com": ["soundcloud"],
  "twitter.com": ["x", "twitter"],
  "x.com": ["x", "twitter"],
};

const APPSTOREPRICE_ALWAYS_TRY_DOMAINS = new Set([
  "chatgpt.com",
  "claude.ai",
  "firecore.com",
  "netflix.com",
  "soundcloud.com",
  "twitter.com",
  "x.com",
]);

const APPSTOREPRICE_DOMAIN_RESOLVER_EXCLUDED_DOMAINS = new Set([
  "apple.com",
  "appstoreprice.org",
  "google.com",
  "microsoft.com",
  "playstation.com",
  "store.playstation.com",
  "youtube.com",
]);

const APPSTOREPRICE_COUNTRIES: Record<string, AppStorePriceCountry> = {
  AE: { countryName: "De forente arabiske emirater", flag: "🇦🇪", locale: "ar-AE" },
  AR: { countryName: "Argentina", flag: "🇦🇷", locale: "es-AR" },
  AU: { countryName: "Australia", flag: "🇦🇺", locale: "en-AU" },
  BE: { countryName: "Belgia", flag: "🇧🇪", locale: "nl-BE" },
  BR: { countryName: "Brasil", flag: "🇧🇷", locale: "pt-BR" },
  CA: { countryName: "Canada", flag: "🇨🇦", locale: "en-CA" },
  CH: { countryName: "Sveits", flag: "🇨🇭", locale: "de-CH" },
  CL: { countryName: "Chile", flag: "🇨🇱", locale: "es-CL" },
  CN: { countryName: "Kina", flag: "🇨🇳", locale: "zh-CN" },
  CO: { countryName: "Colombia", flag: "🇨🇴", locale: "es-CO" },
  CZ: { countryName: "Tsjekkia", flag: "🇨🇿", locale: "cs-CZ" },
  DE: { countryName: "Tyskland", flag: "🇩🇪", locale: "de-DE" },
  DK: { countryName: "Danmark", flag: "🇩🇰", locale: "da-DK" },
  EG: { countryName: "Egypt", flag: "🇪🇬", locale: "ar-EG" },
  ES: { countryName: "Spania", flag: "🇪🇸", locale: "es-ES" },
  FI: { countryName: "Finland", flag: "🇫🇮", locale: "fi-FI" },
  FR: { countryName: "Frankrike", flag: "🇫🇷", locale: "fr-FR" },
  GB: { countryName: "UK", flag: "🇬🇧", locale: "en-GB" },
  GR: { countryName: "Hellas", flag: "🇬🇷", locale: "el-GR" },
  HK: { countryName: "Hongkong", flag: "🇭🇰", locale: "zh-HK" },
  HU: { countryName: "Ungarn", flag: "🇭🇺", locale: "hu-HU" },
  ID: { countryName: "Indonesia", flag: "🇮🇩", locale: "id-ID" },
  IL: { countryName: "Israel", flag: "🇮🇱", locale: "he-IL" },
  IN: { countryName: "India", flag: "🇮🇳", locale: "en-IN" },
  IT: { countryName: "Italia", flag: "🇮🇹", locale: "it-IT" },
  JP: { countryName: "Japan", flag: "🇯🇵", locale: "ja-JP" },
  KR: { countryName: "Sør-Korea", flag: "🇰🇷", locale: "ko-KR" },
  MX: { countryName: "Mexico", flag: "🇲🇽", locale: "es-MX" },
  MY: { countryName: "Malaysia", flag: "🇲🇾", locale: "ms-MY" },
  NG: { countryName: "Nigeria", flag: "🇳🇬", locale: "en-NG" },
  NL: { countryName: "Nederland", flag: "🇳🇱", locale: "nl-NL" },
  NO: { countryName: "Norge", flag: "🇳🇴", locale: "nb-NO" },
  NZ: { countryName: "New Zealand", flag: "🇳🇿", locale: "en-NZ" },
  PE: { countryName: "Peru", flag: "🇵🇪", locale: "es-PE" },
  PH: { countryName: "Filippinene", flag: "🇵🇭", locale: "en-PH" },
  PK: { countryName: "Pakistan", flag: "🇵🇰", locale: "en-PK" },
  PL: { countryName: "Polen", flag: "🇵🇱", locale: "pl-PL" },
  PT: { countryName: "Portugal", flag: "🇵🇹", locale: "pt-PT" },
  RO: { countryName: "Romania", flag: "🇷🇴", locale: "ro-RO" },
  RU: { countryName: "Russland", flag: "🇷🇺", locale: "ru-RU" },
  SA: { countryName: "Saudi-Arabia", flag: "🇸🇦", locale: "ar-SA" },
  SE: { countryName: "Sverige", flag: "🇸🇪", locale: "sv-SE" },
  SG: { countryName: "Singapore", flag: "🇸🇬", locale: "en-SG" },
  TH: { countryName: "Thailand", flag: "🇹🇭", locale: "th-TH" },
  TR: { countryName: "Tyrkia", flag: "🇹🇷", locale: "tr-TR" },
  TW: { countryName: "Taiwan", flag: "🇹🇼", locale: "zh-TW" },
  UA: { countryName: "Ukraina", flag: "🇺🇦", locale: "uk-UA" },
  US: { countryName: "USA", flag: "🇺🇸", locale: "en-US" },
  VN: { countryName: "Vietnam", flag: "🇻🇳", locale: "vi-VN" },
  ZA: { countryName: "Sør-Afrika", flag: "🇿🇦", locale: "en-ZA" },
};

export function isAppStorePriceRegionPriceUrl(url: string): boolean {
  return getAppStorePriceConfig(url) !== undefined;
}

export function isPotentialAppStorePriceRegionPriceUrl(url: string): boolean {
  return isAppStorePriceRegionPriceUrl(url) || getAppStorePriceDomainCandidate(url) !== undefined;
}

export function getAppStorePriceRegionPriceCacheKey(url: string): string | undefined {
  const config = getAppStorePriceConfig(url);
  if (config !== undefined) {
    return config.cacheKey;
  }

  const candidate = getAppStorePriceDomainCandidate(url);
  return candidate !== undefined ? `domain-${candidate.normalizedDomain}` : undefined;
}

export async function findAppStorePriceRegionPricesForUrl(
  url: string,
  textRequest: TextRequest = defaultTextRequest,
  jsonRequest: JsonRequest = defaultJsonRequest,
): Promise<PlayStationRegionPriceResult | undefined> {
  const config = await resolveAppStorePriceConfig(url, jsonRequest);
  if (config === undefined) {
    return undefined;
  }

  const html = await textRequest(config.sourceUrl);
  if (html === undefined) {
    return undefined;
  }

  const subscriptions = extractAppStorePriceSubscriptions(html)
    .filter((entry) => hasPositiveAppStorePrice(entry) && hasSupportedAppStorePriceDuration(entry));
  const subscription = selectDefaultAppStorePriceSubscription(subscriptions, config);
  if (subscription === undefined || subscription.prices.length === 0) {
    return undefined;
  }

  const ratesResponse = await jsonRequest("https://open.er-api.com/v6/latest/NOK");
  const rates = readNokBaseRates(ratesResponse);
  const ratesUpdatedAt = rates?.updatedAt;
  if (rates === undefined) {
    return undefined;
  }

  const comparableSubscriptions = [
    subscription,
    ...subscriptions.filter((entry) => entry.subscriptionId !== subscription.subscriptionId),
  ];
  const availablePlanNames = uniquePlanNames(comparableSubscriptions.map(formatSubscriptionPlanLabel))
    .slice(0, MAX_APPSTOREPRICE_TOOLTIP_PLANS);
  const planAlternativesByRegion = buildAppStorePricePlanAlternativesByRegion(
    comparableSubscriptions,
    rates,
    subscription.prices.map((row) => row.region.toUpperCase()),
  );
  const selectedPlanName = formatSubscriptionPlanLabel(subscription);
  const periodSuffix = formatDurationSuffix(subscription.duration);
  const prices = subscription.prices
    .map((row): PlayStationRegionPrice | undefined => {
      const countryCode = row.region.toUpperCase();
      const currency = row.currency.toUpperCase();
      const currencyRate = rates.rates[currency];
      if (!Number.isFinite(row.price) || typeof currencyRate !== "number" || currencyRate <= 0) {
        return undefined;
      }

      const country = APPSTOREPRICE_COUNTRIES[countryCode] ?? {
        countryName: countryCode,
        flag: countryCodeToFlag(countryCode),
        locale: "en-US",
      };
      const nokAmount = row.price / currencyRate;
      const planAlternatives = planAlternativesByRegion.get(countryCode);
      return {
        region: countryCode,
        countryName: country.countryName,
        flag: country.flag,
        locale: country.locale,
        currency,
        price: row.price,
        formattedPrice: `${currency} ${formatNativeAmount(row.price)}${periodSuffix}`,
        nokAmount,
        formattedNok: `${formatApproximateCurrency(nokAmount, "NOK", "nb-NO")}${periodSuffix}`,
        productUrl: config.sourceUrl,
        sourceProvider: "appstoreprice",
        sourceName: APPSTOREPRICE_SOURCE_NAME,
        sourceDetail: "App Store",
        planName: selectedPlanName,
        ...(planAlternatives !== undefined && planAlternatives.length > 0 ? { planAlternatives } : {}),
      };
    })
    .filter((price): price is PlayStationRegionPrice => price !== undefined)
    .sort((a, b) => a.nokAmount - b.nokAmount);

  if (prices.length === 0) {
    return undefined;
  }

  return {
    productId: config.productId,
    productName: config.productName,
    fetchedAt: new Date().toISOString(),
    ...(ratesUpdatedAt !== undefined ? { ratesUpdatedAt } : {}),
    sourceProvider: "appstoreprice",
    sourceName: APPSTOREPRICE_SOURCE_NAME,
    sourceDetail: "App Store",
    planName: selectedPlanName,
    availablePlanNames,
    prices,
  };
}

function buildAppStorePricePlanAlternativesByRegion(
  subscriptions: AppStorePriceSubscription[],
  rates: { rates: Record<string, number> },
  countryCodes: string[],
): Map<string, RegionPricePlanAlternative[]> {
  const alternativesByRegion = new Map<string, Map<string, AppStorePricePlanAlternativeEntry>>();

  for (const countryCode of uniquePlanNames(countryCodes)) {
    alternativesByRegion.set(countryCode, new Map());
  }

  for (const subscription of subscriptions) {
    const planName = formatSubscriptionPlanLabel(subscription);

    for (const [countryCode, regionAlternatives] of alternativesByRegion) {
      const alternative = buildAppStorePricePlanAlternative(subscription, countryCode, rates);
      const existingAlternative = regionAlternatives.get(planName);
      if (
        existingAlternative !== undefined &&
        existingAlternative.nokAmount !== undefined &&
        (alternative.nokAmount === undefined || existingAlternative.nokAmount <= alternative.nokAmount)
      ) {
        continue;
      }

      regionAlternatives.set(planName, alternative);
    }
  }

  const result = new Map<string, RegionPricePlanAlternative[]>();
  for (const [countryCode, alternatives] of alternativesByRegion) {
    result.set(
      countryCode,
      Array.from(alternatives.values())
        .sort(compareAppStorePricePlanAlternatives)
        .slice(0, MAX_APPSTOREPRICE_TOOLTIP_PLANS)
        .map(({ nokAmount: _nokAmount, ...alternative }) => alternative),
    );
  }

  return result;
}

function selectDefaultAppStorePriceSubscription(
  subscriptions: AppStorePriceSubscription[],
  config: AppStorePriceConfig,
): AppStorePriceSubscription | undefined {
  const configuredSubscription = subscriptions.find((entry) => entry.subscriptionId === config.subscriptionId || entry.name === config.planName);
  if (configuredSubscription !== undefined && isYearlyAppStorePriceSubscription(configuredSubscription)) {
    return configuredSubscription;
  }

  return subscriptions.find(isYearlyAppStorePriceSubscription) ?? configuredSubscription ?? subscriptions[0];
}

function isYearlyAppStorePriceSubscription(subscription: AppStorePriceSubscription): boolean {
  return subscription.prices.length > 0 && (subscription.duration === "annual" || subscription.duration === "yearly");
}

function hasPositiveAppStorePrice(subscription: AppStorePriceSubscription): boolean {
  return subscription.prices.some((price) => price.price > 0);
}

function hasSupportedAppStorePriceDuration(subscription: AppStorePriceSubscription): boolean {
  return (
    subscription.duration === "monthly" ||
    subscription.duration === "annual" ||
    subscription.duration === "yearly" ||
    (subscription.duration === null && isLifetimeAppStorePriceSubscription(subscription))
  );
}

function isLifetimeAppStorePriceSubscription(subscription: AppStorePriceSubscription): boolean {
  const names = [
    subscription.name,
    ...Object.values(subscription.localizedNames ?? {}),
  ];
  return names.some((name) => /\b(?:lifetime|life\s*time|forever|permanent|livstid)\b/i.test(name));
}

function compareAppStorePricePlanAlternatives(
  first: AppStorePricePlanAlternativeEntry,
  second: AppStorePricePlanAlternativeEntry,
): number {
  if (first.nokAmount !== undefined && second.nokAmount !== undefined) {
    return first.nokAmount - second.nokAmount;
  }
  if (first.nokAmount !== undefined) {
    return -1;
  }
  if (second.nokAmount !== undefined) {
    return 1;
  }
  return first.planName.localeCompare(second.planName, "nb");
}

function buildAppStorePricePlanAlternative(
  subscription: AppStorePriceSubscription,
  countryCode: string,
  rates: { rates: Record<string, number> },
): AppStorePricePlanAlternativeEntry {
  const planName = formatSubscriptionPlanLabel(subscription);
  const periodSuffix = formatDurationSuffix(subscription.duration);
  const row = subscription.prices.find((price) => price.region.toUpperCase() === countryCode);
  if (row === undefined) {
    return {
      planName,
      unavailableReason: "Ikke funnet i denne regionen",
    };
  }

  const currency = row.currency.toUpperCase();
  const currencyRate = rates.rates[currency];
  if (!Number.isFinite(row.price) || typeof currencyRate !== "number" || currencyRate <= 0) {
    return {
      planName,
      unavailableReason: "Mangler valutakurs",
    };
  }

  const nokAmount = row.price / currencyRate;
  return {
    planName,
    formattedPrice: `${currency} ${formatNativeAmount(row.price)}${periodSuffix}`,
    formattedNok: `${formatApproximateCurrency(nokAmount, "NOK", "nb-NO")}${periodSuffix}`,
    nokAmount,
  };
}

function uniquePlanNames(planNames: string[]): string[] {
  const uniqueNames: string[] = [];
  const seen = new Set<string>();
  for (const planName of planNames) {
    const normalized = planName.trim();
    const key = normalized.toLowerCase();
    if (normalized.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueNames.push(normalized);
  }
  return uniqueNames;
}

async function resolveAppStorePriceConfig(
  url: string,
  jsonRequest: JsonRequest,
): Promise<AppStorePriceConfig | undefined> {
  const config = getAppStorePriceConfig(url);
  if (config !== undefined) {
    return config;
  }

  const candidate = getAppStorePriceDomainCandidate(url);
  if (candidate === undefined) {
    return undefined;
  }

  for (const searchTerm of candidate.searchTerms) {
    const searchResults = await searchAppleSoftware(searchTerm, jsonRequest);
    const match = findBestAppleSoftwareMatch(candidate.normalizedDomain, searchTerm, searchResults);
    if (match !== undefined) {
      return getAppleSearchAppStorePriceConfig(match);
    }
  }

  return undefined;
}

async function searchAppleSoftware(
  term: string,
  jsonRequest: JsonRequest,
): Promise<AppleSoftwareSearchResult[]> {
  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=us&limit=${APPLE_SEARCH_RESULT_LIMIT}`;
  const value = await jsonRequest(searchUrl);
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return [];
  }

  return value.results.filter(isAppleSoftwareSearchResult);
}

function findBestAppleSoftwareMatch(
  inputDomain: string,
  searchTerm: string,
  results: AppleSoftwareSearchResult[],
): AppleSoftwareSearchResult | undefined {
  let bestMatch: { result: AppleSoftwareSearchResult; score: number } | undefined;
  let secondBestScore = 0;

  results.forEach((result, index) => {
    const score = scoreAppleSoftwareMatch(inputDomain, searchTerm, result, index);
    if (bestMatch === undefined || score > bestMatch.score) {
      secondBestScore = bestMatch?.score ?? 0;
      bestMatch = { result, score };
      return;
    }
    if (score > secondBestScore) {
      secondBestScore = score;
    }
  });

  if (bestMatch === undefined || bestMatch.score < APPLE_SEARCH_MATCH_THRESHOLD) {
    return undefined;
  }

  const isStrongDomainMatch = appStoreResultDomains(bestMatch.result).some((domain) => domainsMatch(inputDomain, domain));
  if (!isStrongDomainMatch && bestMatch.score - secondBestScore < 20) {
    return undefined;
  }

  return bestMatch.result;
}

function scoreAppleSoftwareMatch(
  inputDomain: string,
  searchTerm: string,
  result: AppleSoftwareSearchResult,
  resultIndex: number,
): number {
  const domainBrand = normalizeSearchToken(inputDomain.split(".")[0] ?? inputDomain);
  const searchBrand = normalizeSearchToken(searchTerm);
  const appName = normalizeSearchToken(result.trackName);
  const developerName = normalizeSearchToken(`${result.artistName ?? ""} ${result.sellerName ?? ""}`);
  const bundleId = normalizeSearchToken(result.bundleId ?? "");
  const metadataDomains = appStoreResultDomains(result);
  let score = Math.max(0, 10 - resultIndex);

  if (metadataDomains.some((domain) => domainsMatch(inputDomain, domain))) {
    score += 70;
  }
  if (appName === domainBrand || appName === searchBrand) {
    score += 55;
    if (resultIndex === 0) {
      score += 10;
    }
  } else if (appName.includes(domainBrand) || appName.includes(searchBrand)) {
    score += 25;
  }
  if (developerName.includes(domainBrand) || developerName.includes(searchBrand)) {
    score += 15;
  }
  if (bundleId.includes(domainBrand) || bundleId.includes(searchBrand)) {
    score += 20;
  }

  return score;
}

function getAppleSearchAppStorePriceConfig(result: AppleSoftwareSearchResult): AppStorePriceConfig {
  const appStoreId = String(result.trackId);
  return getKnownAppStorePriceConfigForAppId(appStoreId) ?? {
    cacheKey: `apple-app-${appStoreId}`,
    productId: `appstoreprice:apple-app-${appStoreId}`,
    productName: result.trackName,
    sourceUrl: `https://appstoreprice.org/en/apps/${encodeURIComponent(appStoreId)}`,
  };
}

function getAppStorePriceConfig(url: string): AppStorePriceConfig | undefined {
  try {
    const parsedUrl = new URL(url);
    const appStorePriceConfig = getConfigForAppStorePriceUrl(parsedUrl);
    if (appStorePriceConfig !== undefined) {
      return appStorePriceConfig;
    }

    const appleAppId = parseAppleAppId(parsedUrl);
    if (appleAppId !== undefined) {
      return getKnownAppStorePriceConfigForAppId(appleAppId) ?? getGenericAppStorePriceConfig(appleAppId, parsedUrl);
    }

    const knownDomainConfig = getKnownDomainAppStorePriceConfig(parsedUrl);
    if (knownDomainConfig !== undefined) {
      return knownDomainConfig;
    }

    if (isSoundCloudArtistPricingUrl(parsedUrl)) {
      return getKnownAppStorePriceConfigForAppId("336353151");
    }

  } catch {
    return undefined;
  }

  return undefined;
}

function getAppStorePriceDomainCandidate(url: string): AppStorePriceDomainCandidate | undefined {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return undefined;
    }

    const normalizedDomain = normalizeRegistrableDomain(parsedUrl.hostname);
    if (
      normalizedDomain === undefined ||
      APPSTOREPRICE_DOMAIN_RESOLVER_EXCLUDED_DOMAINS.has(normalizedDomain)
    ) {
      return undefined;
    }

    if (!APPSTOREPRICE_ALWAYS_TRY_DOMAINS.has(normalizedDomain) && !isLikelySubscriptionUrl(parsedUrl)) {
      return undefined;
    }

    return {
      normalizedDomain,
      searchTerms: APPSTOREPRICE_DOMAIN_SEARCH_ALIASES[normalizedDomain] ?? [formatSearchTermFromDomain(normalizedDomain)],
    };
  } catch {
    return undefined;
  }
}

function isLikelySubscriptionUrl(url: URL): boolean {
  const path = `${url.pathname} ${url.search}`.toLowerCase();
  return /(?:premium|pricing|price|plans?|subscription|subscribe|checkout|upgrade|membership|pro|plus|artist|creator)/i.test(path);
}

function formatSearchTermFromDomain(domain: string): string {
  return domain
    .split(".")[0]
    ?.replace(/[-_]+/g, " ")
    .trim() || domain;
}

function normalizeRegistrableDomain(hostname: string): string | undefined {
  const labels = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);
  while (labels.length > 2 && ["www", "m", "app", "checkout", "store", "account", "accounts", "billing"].includes(labels[0] ?? "")) {
    labels.shift();
  }
  if (labels.length < 2) {
    return undefined;
  }

  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  const multiPartTlds = new Set(["co.uk", "com.au", "com.br", "com.mx", "com.tr", "co.jp", "co.kr", "co.nz", "co.za", "com.sg"]);
  return multiPartTlds.has(lastTwo) && labels.length >= 3 ? lastThree : lastTwo;
}

function appStoreResultDomains(result: AppleSoftwareSearchResult): string[] {
  return [result.sellerUrl, result.trackViewUrl]
    .map((url) => {
      if (url === undefined) {
        return undefined;
      }
      try {
        return normalizeRegistrableDomain(new URL(url).hostname);
      } catch {
        return undefined;
      }
    })
    .filter((domain): domain is string => domain !== undefined);
}

function domainsMatch(inputDomain: string, resultDomain: string): boolean {
  return inputDomain === resultDomain;
}

function normalizeSearchToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:app|apps|mobile|inc|llc|ltd|limited|pbc|opco|as|ab|gmbh|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getConfigForAppStorePriceUrl(url: URL): AppStorePriceConfig | undefined {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "appstoreprice.org") {
    return undefined;
  }

  const appSlug = url.pathname.match(/\/apps\/([^/?#]+)/i)?.[1];
  if (appSlug === undefined || appSlug.length === 0) {
    return undefined;
  }

  return getKnownAppStorePriceConfigForAppId(appSlug) ?? {
    cacheKey: appSlug,
    productId: `appstoreprice:${appSlug}`,
    productName: formatNameFromSlug(appSlug),
    sourceUrl: `https://appstoreprice.org/en/apps/${encodeURIComponent(appSlug)}`,
  };
}

function getKnownDomainAppStorePriceConfig(url: URL): AppStorePriceConfig | undefined {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname === "spotify.com" || hostname.endsWith(".spotify.com")) {
    return getKnownAppStorePriceConfigForAppId("324684580");
  }

  if (hostname === "discord.com") {
    return getKnownAppStorePriceConfigForAppId("985746746");
  }

  if ((hostname === "firecore.com" || hostname.endsWith(".firecore.com")) && /^\/infuse(?:\/|$)/i.test(url.pathname)) {
    return getKnownAppStorePriceConfigForAppId("1136220934");
  }

  return undefined;
}

function getKnownAppStorePriceConfigForAppId(appId: string): AppStorePriceConfig | undefined {
  if (appId === "336353151") {
    return {
      cacheKey: "soundcloud-artist-pro-yearly",
      productId: "appstoreprice:soundcloud-artist-pro-yearly",
      productName: "SoundCloud Artist Pro",
      subscriptionId: "next_pro_yearly",
      planName: "Artist Pro Yearly",
      sourceUrl: APPSTOREPRICE_SOUND_CLOUD_URL,
    };
  }

  if (appId === "324684580") {
    return {
      cacheKey: "spotify-premium-individual-monthly",
      productId: "appstoreprice:spotify-premium-individual-monthly",
      productName: "Spotify Premium",
      subscriptionId: "spotify_individual",
      planName: "Premium Individual",
      sourceUrl: APPSTOREPRICE_SPOTIFY_URL,
    };
  }

  if (appId === "985746746") {
    return {
      cacheKey: "discord-nitro-monthly",
      productId: "appstoreprice:discord-nitro-monthly",
      productName: "Discord Nitro",
      subscriptionId: "premium_tier_2_monthly",
      planName: "Nitro Monthly",
      sourceUrl: "https://appstoreprice.org/en/apps/985746746",
    };
  }

  if (appId === "1136220934") {
    return {
      cacheKey: "infuse-pro-monthly",
      productId: "appstoreprice:infuse-pro-monthly",
      productName: "Infuse Pro",
      subscriptionId: "com.firecore.infuse.pro.30",
      planName: "Infuse Pro - Monthly",
      sourceUrl: "https://appstoreprice.org/en/apps/1136220934",
    };
  }

  return undefined;
}

function getGenericAppStorePriceConfig(appId: string, url: URL): AppStorePriceConfig {
  return {
    cacheKey: `apple-app-${appId}`,
    productId: `appstoreprice:apple-app-${appId}`,
    productName: readAppNameFromAppleUrl(url) ?? "App Store-app",
    sourceUrl: `https://appstoreprice.org/en/apps/${encodeURIComponent(appId)}`,
  };
}

function parseAppleAppId(url: URL): string | undefined {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "apps.apple.com") {
    return undefined;
  }

  return url.pathname.match(/\/id(\d+)(?:[/?#]|$)/i)?.[1];
}

function readAppNameFromAppleUrl(url: URL): string | undefined {
  const parts = url.pathname.split("/").filter(Boolean);
  const appSegmentIndex = parts.findIndex((part) => part.toLowerCase() === "app");
  const slug = appSegmentIndex >= 0 ? parts[appSegmentIndex + 1] : undefined;
  return slug !== undefined ? formatNameFromSlug(slug) : undefined;
}

function formatNameFromSlug(slug: string): string {
  const cleaned = decodeURIComponent(slug)
    .replace(/^id\d+$/i, "App Store-app")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) {
    return "App Store-app";
  }

  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isSoundCloudArtistPricingUrl(url: URL): boolean {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname === "checkout.soundcloud.com") {
    return /^\/artist\/?$/i.test(url.pathname);
  }

  if (hostname !== "soundcloud.com") {
    return false;
  }

  return /(?:^|\/)(?:artist|artists|for-artists|pro|creator|creators|subscriptions|you\/subscriptions)(?:\/|$)/i.test(url.pathname);
}

function extractAppStorePriceSubscriptions(html: string): AppStorePriceSubscription[] {
  const normalized = normalizeNextFlightHtml(html);
  let searchIndex = 0;

  while (searchIndex < normalized.length) {
    const markerIndex = normalized.indexOf("\"subscriptions\":[", searchIndex);
    if (markerIndex < 0) {
      return [];
    }

    const arrayStart = normalized.indexOf("[", markerIndex);
    if (arrayStart < 0) {
      return [];
    }

    const rawArray = readBalancedJsonArray(normalized, arrayStart);
    if (rawArray === undefined) {
      return [];
    }

    const parsed = parseJson(rawArray.replace(/"\$undefined"/g, "null"));
    if (Array.isArray(parsed)) {
      const subscriptions = parsed.filter(isAppStorePriceSubscription);
      if (subscriptions.length > 0) {
        return subscriptions;
      }
    }

    searchIndex = markerIndex + "\"subscriptions\":[".length;
  }

  return [];
}

function normalizeNextFlightHtml(html: string): string {
  return html
    .replace(/\\"/g, "\"")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function readBalancedJsonArray(value: string, startIndex: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function isAppStorePriceSubscription(value: unknown): value is AppStorePriceSubscription {
  return (
    isRecord(value) &&
    typeof value.subscriptionId === "string" &&
    typeof value.name === "string" &&
    (typeof value.duration === "string" || value.duration === null) &&
    (value.localizedNames === undefined || isStringRecord(value.localizedNames)) &&
    Array.isArray(value.prices) &&
    value.prices.every(isAppStorePriceSubscriptionPrice)
  );
}

function isAppStorePriceSubscriptionPrice(value: unknown): value is AppStorePriceSubscriptionPrice {
  return (
    isRecord(value) &&
    typeof value.region === "string" &&
    typeof value.regionName === "string" &&
    typeof value.currency === "string" &&
    typeof value.price === "number" &&
    Number.isFinite(value.price)
  );
}

function isAppleSoftwareSearchResult(value: unknown): value is AppleSoftwareSearchResult {
  return (
    isRecord(value) &&
    typeof value.trackId === "number" &&
    Number.isFinite(value.trackId) &&
    typeof value.trackName === "string" &&
    (value.artistName === undefined || typeof value.artistName === "string") &&
    (value.sellerName === undefined || typeof value.sellerName === "string") &&
    (value.bundleId === undefined || typeof value.bundleId === "string") &&
    (value.sellerUrl === undefined || typeof value.sellerUrl === "string") &&
    (value.trackViewUrl === undefined || typeof value.trackViewUrl === "string")
  );
}

function readNokBaseRates(value: unknown): { rates: Record<string, number>; updatedAt?: string } | undefined {
  if (!isRecord(value) || value.result !== "success" || !isRecord(value.rates)) {
    return undefined;
  }

  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(value.rates)) {
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      rates[currency.toUpperCase()] = rate;
    }
  }

  if (Object.keys(rates).length === 0) {
    return undefined;
  }

  return {
    rates,
    ...(typeof value.time_last_update_utc === "string" ? { updatedAt: value.time_last_update_utc } : {}),
  };
}

function formatDurationSuffix(duration: string | null): string {
  if (duration === "annual" || duration === "yearly") return "/år";
  if (duration === "monthly") return "/mnd";
  return "";
}

function formatSubscriptionPlanLabel(subscription: AppStorePriceSubscription): string {
  const name = formatAppStorePriceSubscriptionName(subscription);
  const durationLabel = formatDurationLabel(subscription.duration);
  if (durationLabel === undefined || name.length === 0 || planNameAlreadyContainsDuration(name, subscription.duration)) {
    return name;
  }

  return `${name} (${durationLabel})`;
}

function formatAppStorePriceSubscriptionName(subscription: AppStorePriceSubscription): string {
  return inferKnownAppStorePriceSubscriptionName(subscription)
    ?? pickPreferredAppStorePriceSubscriptionName(subscription)
    ?? subscription.name.trim();
}

function inferKnownAppStorePriceSubscriptionName(subscription: AppStorePriceSubscription): string | undefined {
  const subscriptionId = subscription.subscriptionId.toUpperCase();
  const name = subscription.name.toLowerCase();
  if (!subscriptionId.includes("NF99") && !name.includes("netflix")) {
    return undefined;
  }

  if (subscriptionId.includes("_4001_") || /\bb[aá]sico\b/i.test(subscription.name)) {
    return "Netflix Basic";
  }
  if (subscriptionId.includes("_3088_") || /\b(?:standard|2s|2 screens?)\b/i.test(subscription.name)) {
    return "Netflix Standard";
  }
  if (subscriptionId.includes("_3108_") || /\b(?:premium|4s|4 screens?)\b/i.test(subscription.name)) {
    return "Netflix Premium";
  }
  if (subscriptionId === "ITUNES_INAPP_TIER8") {
    return "Netflix Standard";
  }

  return undefined;
}

function pickPreferredAppStorePriceSubscriptionName(subscription: AppStorePriceSubscription): string | undefined {
  const localizedNames = subscription.localizedNames ?? {};
  const preferredRegions = ["US", "GB", "CA", "AU", "IE", "NZ", "NO"];
  for (const region of preferredRegions) {
    const localizedName = localizedNames[region]?.trim();
    if (localizedName !== undefined && localizedName.length > 0 && isLikelyEnglishPlanName(localizedName)) {
      return localizedName;
    }
  }

  const directName = subscription.name.trim();
  if (directName.length > 0 && isLikelyEnglishPlanName(directName)) {
    return directName;
  }

  return Object.values(localizedNames)
    .map((name) => name.trim())
    .find((name) => name.length > 0 && isLikelyEnglishPlanName(name));
}

function isLikelyEnglishPlanName(planName: string): boolean {
  if (!/^[\x20-\x7e]+$/.test(planName)) {
    return false;
  }

  return !/\b(?:basico|básico|pantalla|pantallas|transmision|transmisión|ilimitada|gerät|geräte|gleichzeitig|lebenslang)\b/i.test(planName);
}

function formatDurationLabel(duration: string | null): string | undefined {
  if (duration === "annual" || duration === "yearly") return "1 år";
  if (duration === "monthly") return "1 mnd";
  return undefined;
}

function planNameAlreadyContainsDuration(planName: string, duration: string | null): boolean {
  const normalized = planName.toLowerCase();
  if (duration === "annual" || duration === "yearly") {
    return /\b(?:annual|annually|year|yearly|år)\b/.test(normalized);
  }
  if (duration === "monthly") {
    return /\b(?:month|monthly|mnd|måned)\b/.test(normalized);
  }
  return false;
}

function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currency} ${formatFallbackAmount(amount)}`;
  }
}

function formatApproximateCurrency(amount: number, currency: string, locale: string): string {
  return `~${formatCurrency(amount, currency, locale)}`;
}

function formatFallbackAmount(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function formatNativeAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function countryCodeToFlag(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return "";
  }

  return [...countryCode]
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join("");
}

async function defaultTextRequest(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

async function defaultJsonRequest(url: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}
