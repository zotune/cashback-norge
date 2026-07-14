import {
  isRecord,
} from "./cashback.js";
import type {
  GetPriceMatchForProductMessage,
  PriceMatchAlternative,
  PriceMatchOffer,
} from "./extension-messages.js";
import {
  isEpicGamesStoreProductUrl,
  isMicrosoftStoreProductUrl,
  isSteamAppProductUrl,
  parseEpicGamesProductSlug,
} from "./isthereanydeal-price-match.js";
import {
  convertToNok,
  fetchNokBaseRates,
  STATIC_NOK_BASE_RATES,
  type NokBaseRates,
} from "./exchange-rates.js";
import {
  scoreProductTitleAgainstSearchTerm,
} from "./product-title-match.js";
import type {
  JsonRequest,
} from "./prisjakt-price-match.js";

type TextRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
) => Promise<string | undefined>;

type AllKeyShopData = {
  title?: string;
  currency: string;
  editions: Map<string, string>;
  prices: AllKeyShopRawPrice[];
  regions: Map<string, string>;
};

type AllKeyShopRawPrice = {
  account?: boolean;
  activationPlatform?: string;
  dispo?: number;
  edition?: string;
  isOfficial?: boolean;
  merchantName: string;
  price: number;
  priceCard?: number;
  pricePaypal?: number;
  region?: string;
  voucherCode?: string;
};

type AllKeyShopOffer = {
  amount: number;
  currency: "NOK";
  edition?: string;
  originalAmount: number;
  originalCurrency: string;
  platform?: string;
  region?: string;
  shopName: string;
  voucherCode?: string;
};

type AllKeyShopHtmlRequestInit = Parameters<TextRequest>[1];

const ALLKEYSHOP_ORIGIN = "https://www.allkeyshop.com";
const ALLKEYSHOP_BLOG_ORIGIN = `${ALLKEYSHOP_ORIGIN}/blog`;
const MAX_ALLKEYSHOP_ALTERNATIVES = 8;
const ALLKEYSHOP_HTML_REQUESTS: AllKeyShopHtmlRequestInit[] = [
  {
    headers: { "Accept": "text/html,application/xhtml+xml" },
    credentials: "include",
  },
  {
    headers: { "Accept": "text/html,application/xhtml+xml" },
  },
];

export async function findAllKeyShopPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
  requestText: TextRequest = fetchText,
): Promise<PriceMatchOffer | undefined> {
  if (!isAllKeyShopSupportedGameUrl(message.url) && !isAllKeyShopSupportedGameUrl(message.productUrl)) {
    return undefined;
  }

  const page = await fetchAllKeyShopPageData(message, requestText);
  if (page === undefined) return undefined;

  const rates = await fetchNokBaseRates(requestJson) ?? STATIC_NOK_BASE_RATES;

  const platformScope = readPlatformScope(message);
  const titleCandidates = readGameTitleCandidates(message);
  const offers = dropImplausiblyCheapOffers(page.data.prices
    .filter((price) => price.dispo === undefined || price.dispo > 0)
    .filter((price) => price.account !== true)
    .filter((price) => isActivationPlatformAllowed(price.activationPlatform, platformScope))
    .filter((price) => isAllKeyShopEditionAllowed(page.data.editions.get(price.edition ?? ""), titleCandidates))
    .map((price) => toAllKeyShopOffer(price, page.data.currency, page.data.editions, page.data.regions, rates))
    .filter((offer): offer is AllKeyShopOffer => offer !== undefined)
    .sort((first, second) => first.amount - second.amount));

  const best = offers[0];
  if (best === undefined) return undefined;

  const productName = page.data.title ?? titleCandidates[0] ?? "PC-spill";
  return {
    source: "allkeyshop",
    sourceName: "ALLKEYSHOP",
    matchedExactProduct: true,
    shopName: best.shopName,
    amount: best.amount,
    sortAmount: best.amount,
    currency: best.currency,
    price: formatApproxCurrency(best.amount, best.currency),
    productName,
    productUrl: page.url,
    alternatives: offers.slice(0, MAX_ALLKEYSHOP_ALTERNATIVES).map(toPriceMatchAlternative),
  };
}

function isAllKeyShopSupportedGameUrl(rawUrl: string | undefined): boolean {
  return isSteamAppProductUrl(rawUrl) ||
    isEpicGamesStoreProductUrl(rawUrl) ||
    isMicrosoftStoreProductUrl(rawUrl) ||
    isAllKeyShopProductUrl(rawUrl);
}

function isAllKeyShopProductUrl(rawUrl: string | undefined): boolean {
  if (rawUrl === undefined) return false;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "allkeyshop.com" && /\/blog\/buy-[^/]+-cd-key-compare-prices\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function fetchAllKeyShopPageData(
  message: GetPriceMatchForProductMessage,
  requestText: TextRequest,
): Promise<{ data: AllKeyShopData; url: string } | undefined> {
  const titleCandidates = readGameTitleCandidates(message);
  for (const url of buildAllKeyShopPageUrlCandidates(message, titleCandidates)) {
    for (const init of ALLKEYSHOP_HTML_REQUESTS) {
      const html = await requestText(url, init);
      if (html === undefined) continue;

      const data = readAllKeyShopData(html);
      if (data === undefined || !isLikelyAllKeyShopProductMatch(data.title, titleCandidates, url)) continue;
      return { data, url };
    }
  }

  return undefined;
}

function buildAllKeyShopPageUrlCandidates(
  message: GetPriceMatchForProductMessage,
  titleCandidates: string[],
): string[] {
  const directUrls = [message.url, message.productUrl]
    .filter((url): url is string => url !== undefined && isAllKeyShopProductUrl(url));
  const epicSlug = parseEpicGamesProductSlug(message.url) ?? parseEpicGamesProductSlug(message.productUrl);
  const slugUrls = uniqueStrings([
    epicSlug,
    ...titleCandidates.map(toAllKeyShopSlug),
  ])
    .map((slug) => `${ALLKEYSHOP_BLOG_ORIGIN}/buy-${encodeURIComponent(slug)}-cd-key-compare-prices/`);
  return uniqueStrings([...directUrls, ...slugUrls]);
}

function readAllKeyShopData(html: string): AllKeyShopData | undefined {
  const gamePageTrans = readAssignedJsonObject(html, "gamePageTrans");
  if (!isRecord(gamePageTrans) || !Array.isArray(gamePageTrans.prices)) return undefined;

  const prices = gamePageTrans.prices
    .map(readAllKeyShopRawPrice)
    .filter((price): price is AllKeyShopRawPrice => price !== undefined);
  if (prices.length === 0) return undefined;

  return {
    currency: readAllKeyShopCurrency(html),
    editions: readAllKeyShopEditions(gamePageTrans.editions),
    prices,
    regions: readAllKeyShopRegions(gamePageTrans.regions),
    ...readAllKeyShopTitle(html),
  };
}

function readAllKeyShopRawPrice(value: unknown): AllKeyShopRawPrice | undefined {
  if (!isRecord(value)) return undefined;
  const merchantName = readString(value.merchantName);
  const amount = readAmount(value.price);
  if (merchantName === undefined || amount === undefined || amount <= 0) return undefined;
  const activationPlatform = readString(value.activationPlatform);
  const edition = readString(value.edition);
  const region = readString(value.region);
  const voucherCode = readString(value.voucher_code);

  return {
    merchantName,
    price: amount,
    ...readOptionalAmount("priceCard", value.priceCard),
    ...readOptionalAmount("pricePaypal", value.pricePaypal),
    ...(typeof value.account === "boolean" ? { account: value.account } : {}),
    ...(typeof value.dispo === "number" ? { dispo: value.dispo } : {}),
    ...(typeof value.isOfficial === "boolean" ? { isOfficial: value.isOfficial } : {}),
    ...(activationPlatform !== undefined ? { activationPlatform } : {}),
    ...(edition !== undefined ? { edition } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(voucherCode !== undefined ? { voucherCode } : {}),
  };
}

function readOptionalAmount(key: "priceCard" | "pricePaypal", value: unknown): Partial<AllKeyShopRawPrice> {
  const amount = readAmount(value);
  return amount !== undefined && amount > 0 ? { [key]: amount } : {};
}

function readAllKeyShopCurrency(html: string): string {
  const siteCurrency = html.match(/window\.__site\s*=\s*\{[\s\S]{0,1200}?"currency"\s*:\s*"([a-z]{3})"/i)?.[1];
  if (siteCurrency !== undefined) return siteCurrency.toUpperCase();
  const schemaCurrency = html.match(/"priceCurrency"\s*:\s*"([a-z]{3})"/i)?.[1];
  return schemaCurrency !== undefined ? schemaCurrency.toUpperCase() : "EUR";
}

function readAllKeyShopEditions(value: unknown): Map<string, string> {
  const editions = new Map<string, string>();
  if (!isRecord(value)) return editions;

  for (const [id, edition] of Object.entries(value)) {
    if (!isRecord(edition)) continue;
    const name = readString(edition.name);
    if (name !== undefined) editions.set(id, name);
  }

  return editions;
}

function readAllKeyShopRegions(value: unknown): Map<string, string> {
  const regions = new Map<string, string>();
  if (!isRecord(value)) return regions;

  for (const [id, region] of Object.entries(value)) {
    if (!isRecord(region)) continue;
    const name = readString(region.region_name) ?? readString(region.filter_name);
    if (name !== undefined) regions.set(id, name);
  }

  return regions;
}

function readAllKeyShopTitle(html: string): Pick<AllKeyShopData, "title"> {
  const h1 = stripTags(decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ""));
  const title = h1
    .replace(/^Buy\s+/i, "")
    .replace(/\s+CD Key\s+Compare Prices.*$/i, "")
    .replace(/\s+Compare Prices.*$/i, "")
    .trim();
  return title.length > 0 ? { title } : {};
}

function toAllKeyShopOffer(
  price: AllKeyShopRawPrice,
  currency: string,
  editions: Map<string, string>,
  regions: Map<string, string>,
  rates: NokBaseRates,
): AllKeyShopOffer | undefined {
  const amount = pickAllKeyShopPayableAmount(price);
  const nokAmount = convertToNok(amount, currency, rates);
  if (nokAmount === undefined) return undefined;

  const platform = formatActivationPlatform(price.activationPlatform);
  const region = price.region !== undefined ? regions.get(price.region) : undefined;
  const edition = price.edition !== undefined ? editions.get(price.edition) : undefined;
  return {
    amount: nokAmount,
    currency: "NOK",
    originalAmount: amount,
    originalCurrency: currency,
    shopName: price.merchantName,
    ...(platform !== undefined ? { platform } : {}),
    ...(region !== undefined ? { region } : {}),
    ...(edition !== undefined ? { edition } : {}),
    ...(price.voucherCode !== undefined ? { voucherCode: price.voucherCode } : {}),
  };
}

const MIN_PLAUSIBLE_OFFER_NOK = 2;
const OUTLIER_MEDIAN_FRACTION = 0.05;

/**
 * AllKeyShop lists unreleased games with 0.01–0.03 placeholder prices, and the
 * feed occasionally carries single listings far below every other shop. Offers
 * under 2 kr, or under 5% of the median offer, are noise — never a real key.
 */
function dropImplausiblyCheapOffers(offers: AllKeyShopOffer[]): AllKeyShopOffer[] {
  if (offers.length === 0) return offers;

  const amounts = offers.map((offer) => offer.amount).sort((first, second) => first - second);
  const median = amounts[Math.floor(amounts.length / 2)] ?? 0;
  const threshold = Math.max(
    MIN_PLAUSIBLE_OFFER_NOK,
    offers.length >= 3 ? median * OUTLIER_MEDIAN_FRACTION : 0,
  );
  return offers.filter((offer) => offer.amount >= threshold);
}

function pickAllKeyShopPayableAmount(price: AllKeyShopRawPrice): number {
  const payableAmounts = [
    price.priceCard,
    price.pricePaypal,
  ]
    .filter((amount): amount is number => amount !== undefined && Number.isFinite(amount) && amount > 0)
    .sort((first, second) => first - second);
  return payableAmounts[0] ?? price.price;
}

function toPriceMatchAlternative(offer: AllKeyShopOffer): PriceMatchAlternative {
  return {
    shopName: offer.shopName,
    amount: offer.amount,
    sortAmount: offer.amount,
    currency: offer.currency,
    price: formatApproxCurrency(offer.amount, offer.currency),
    ...(() => {
      const details = formatAllKeyShopTooltipDetails(offer);
      return details !== undefined ? { platform: details } : {};
    })(),
  };
}

function formatAllKeyShopTooltipDetails(offer: AllKeyShopOffer): string | undefined {
  const details = [
    offer.platform,
    offer.region,
    offer.edition,
    offer.voucherCode !== undefined ? `kode ${offer.voucherCode}` : undefined,
  ].filter((detail): detail is string => detail !== undefined && detail.length > 0);
  return details.length > 0 ? details.join(", ") : undefined;
}

function readPlatformScope(message: GetPriceMatchForProductMessage): string[] {
  if (isSteamAppProductUrl(message.url) || isSteamAppProductUrl(message.productUrl)) {
    return ["steam", "microsoft-windows", "windows", "xbox-play-anywhere"];
  }
  if (isEpicGamesStoreProductUrl(message.url) || isEpicGamesStoreProductUrl(message.productUrl)) return ["epic", "epic-store", "epic-games", "epic-games-store"];
  if (isMicrosoftStoreProductUrl(message.url) || isMicrosoftStoreProductUrl(message.productUrl)) {
    return ["microsoft-windows", "windows", "xbox", "xbox-play-anywhere"];
  }
  return [];
}

function isActivationPlatformAllowed(value: string | undefined, allowedPlatforms: string[]): boolean {
  if (allowedPlatforms.length === 0) return true;
  if (value === undefined) return false;
  const normalized = normalizePlatform(value);
  return allowedPlatforms.some((platform) => normalized === normalizePlatform(platform));
}

function formatActivationPlatform(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizePlatform(value);
  if (normalized === "steam") return "Steam";
  if (normalized === "epic" || normalized === "epic-store" || normalized === "epic-games" || normalized === "epic-games-store") return "Epic Games";
  if (normalized === "microsoft-windows" || normalized === "windows") return "Microsoft Store";
  if (normalized === "xbox-play-anywhere") return "Xbox Play Anywhere";
  if (normalized === "xbox") return "Xbox";
  return value
    .split(/[-_\s]+/g)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizePlatform(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function isAllKeyShopEditionAllowed(editionName: string | undefined, titleCandidates: string[]): boolean {
  const targetEdition = readEditionKeyword(titleCandidates.join(" "));
  if (targetEdition === undefined) {
    return editionName === undefined || isStandardEdition(editionName);
  }

  if (editionName === undefined) return true;
  return normalizeEdition(editionName).includes(targetEdition);
}

function readEditionKeyword(value: string): string | undefined {
  const normalized = normalizeEdition(value);
  for (const keyword of ["premium", "deluxe", "ultimate", "complete", "collector", "constellation", "special", "gold"]) {
    if (normalized.includes(keyword)) return keyword;
  }
  return undefined;
}

function isStandardEdition(value: string): boolean {
  const normalized = normalizeEdition(value);
  return normalized === "standard" || normalized === "base" || normalized === "normal";
}

function normalizeEdition(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isLikelyAllKeyShopProductMatch(
  title: string | undefined,
  titleCandidates: string[],
  url: string,
): boolean {
  if (title === undefined) return true;

  const slug = url.match(/\/buy-([^/]+)-cd-key-compare-prices\/?$/i)?.[1];
  if (slug !== undefined && titleCandidates.some((candidate) => toAllKeyShopSlug(candidate) === slug)) return true;
  return titleCandidates.some((candidate) => scoreProductTitleAgainstSearchTerm(candidate, title) >= 0.72);
}

function readGameTitleCandidates(message: GetPriceMatchForProductMessage): string[] {
  return uniqueStrings([
    ...(message.productTitleCandidates ?? []).flatMap(readGameTitleCandidateVariants),
    ...readGameTitleCandidateVariants(message.searchTerm),
    readSteamProductName(message),
    ...readGameTitleCandidateVariants(parseEpicGamesProductSlug(message.url)),
    ...readGameTitleCandidateVariants(parseEpicGamesProductSlug(message.productUrl)),
  ])
    .filter((candidate) => candidate.length >= 2 && candidate.length <= 120);
}

function readGameTitleCandidateVariants(value: string | undefined): string[] {
  if (value === undefined) return [];
  const normalized = humanizeSlug(value).trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return [];

  const withoutKnownSuffix = normalized
    .replace(/\s+\|\s+.*$/i, "")
    .replace(/\s+[-\u2013\u2014]\s+(?:Epic Games Store|Steam Store|Steam|Microsoft Store|Xbox(?: Store)?|PlayStation Store).*$/i, "")
    .replace(/\s+(?:on|i|p\u00e5)\s+(?:Epic Games Store|Steam Store|Steam|Microsoft Store|Xbox(?: Store)?|PlayStation Store)$/i, "")
    .replace(/\s+(?:hos|at)\s+(?:Epic Games Store|Steam Store|Steam)$/i, "");
  const withoutBuyPrefix = withoutKnownSuffix
    .replace(/^(?:kj\u00f8p|kjop|buy)\s+/i, "")
    .trim();

  return uniqueStrings([withoutBuyPrefix, withoutKnownSuffix, normalized])
    .filter((candidate) => candidate.length > 0);
}

function humanizeSlug(value: string): string {
  return value.replace(/[-_]+/g, " ");
}

function readSteamProductName(message: GetPriceMatchForProductMessage): string | undefined {
  return readSteamProductNameFromUrl(message.url) ?? readSteamProductNameFromUrl(message.productUrl);
}

function readSteamProductNameFromUrl(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/^\/app\/\d+\/([^/?#]+)/i);
    const slug = match?.[1];
    if (slug === undefined) return undefined;
    const name = decodeURIComponent(slug).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

function toAllKeyShopSlug(value: string): string {
  return value
    .replace(/[\u00C6\u00E6]/g, "ae")
    .replace(/[\u00D8\u00F8]/g, "o")
    .replace(/[\u00C5\u00E5]/g, "a")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function readAssignedJsonObject(html: string, variableName: string): unknown {
  const marker = new RegExp(`\\bvar\\s+${escapeRegExp(variableName)}\\s*=\\s*`, "i");
  const match = marker.exec(html);
  if (match === null) return undefined;

  const start = match.index + match[0].length;
  const jsonStart = html.indexOf("{", start);
  if (jsonStart < 0) return undefined;

  const jsonEnd = findBalancedObjectEnd(html, jsonStart);
  if (jsonEnd === undefined) return undefined;

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd + 1));
  } catch {
    return undefined;
  }
}

function findBalancedObjectEnd(value: string, startIndex: number): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readAmount(value: unknown): number | undefined {
  const amount = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value.replace(",", "."))
      : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      maximumFractionDigits: currencyScale(currency),
    }).format(amount);
  } catch {
    return `${amount.toFixed(currencyScale(currency))} ${currency}`;
  }
}

function formatApproxCurrency(amount: number, currency: string): string {
  return `~${formatCurrency(amount, currency)}`;
}

function currencyScale(currency: string): number {
  if (new Set(["JPY", "KRW", "CLP", "VND", "IDR"]).has(currency.toUpperCase())) return 0;
  if (new Set(["BHD", "KWD", "OMR"]).has(currency.toUpperCase())) return 3;
  return 2;
}

async function fetchJson(url: string, init?: Parameters<JsonRequest>[1]): Promise<unknown | undefined> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.json();
  } catch {
    return undefined;
  }
}

async function fetchText(url: string, init?: Parameters<TextRequest>[1]): Promise<string | undefined> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.text();
  } catch {
    return undefined;
  }
}
