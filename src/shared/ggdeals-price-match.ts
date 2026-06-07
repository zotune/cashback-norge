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
  isSteamAppProductUrl,
  parseEpicGamesProductSlug,
  parseSteamAppId,
} from "./isthereanydeal-price-match.js";
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

export type GgDealsPriceMatchOptions = {
  apiKey?: string;
  region?: string;
};

type GgDealsPriceData = {
  title?: string;
  url?: string;
  prices: {
    currentRetail?: number;
    currentKeyshops?: number;
    historicalRetail?: number;
    historicalKeyshops?: number;
    currency: string;
  };
};

type GgDealsPriceBucket = {
  amount: number;
  currency: string;
  historicalAmount?: number;
  shopName: string;
};

const GG_DEALS_ORIGIN = "https://gg.deals";
const GG_DEALS_STEAM_APP_PRICE_URL = "https://api.gg.deals/v1/prices/by-steam-app-id/";
const DEFAULT_GG_DEALS_API_KEY = "sqz5OjdsyxNW2e0i3aF5BA0p5rpd0fHU";
const DEFAULT_GG_DEALS_REGION = "no";
const MAX_GG_DEALS_ALTERNATIVES = 4;

export async function findGgDealsPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
  requestText: TextRequest = fetchText,
  options: GgDealsPriceMatchOptions = {},
): Promise<PriceMatchOffer | undefined> {
  if (!isGgDealsSupportedGameUrl(message.url) && !isGgDealsSupportedGameUrl(message.productUrl)) {
    return undefined;
  }

  const steamAppId = parseSteamAppId(message.url) ?? parseSteamAppId(message.productUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const region = normalizeRegion(options.region);
  if (steamAppId !== undefined && apiKey !== undefined) {
    const apiOffer = await fetchGgDealsSteamAppPriceMatch({
      apiKey,
      appId: steamAppId,
      message,
      region,
      requestJson,
    });
    if (apiOffer !== undefined) return apiOffer;
  }

  return fetchGgDealsPagePriceMatch({
    message,
    requestText,
    ...(steamAppId !== undefined ? { steamAppId } : {}),
  });
}

function isGgDealsSupportedGameUrl(rawUrl: string | undefined): boolean {
  return isSteamAppProductUrl(rawUrl) || isEpicGamesStoreProductUrl(rawUrl);
}

async function fetchGgDealsSteamAppPriceMatch(input: {
  apiKey: string;
  appId: number;
  message: GetPriceMatchForProductMessage;
  region: string;
  requestJson: JsonRequest;
}): Promise<PriceMatchOffer | undefined> {
  const params = new URLSearchParams({
    ids: String(input.appId),
    key: input.apiKey,
    region: input.region,
  });
  const value = await input.requestJson(`${GG_DEALS_STEAM_APP_PRICE_URL}?${params.toString()}`, {
    headers: { "Accept": "application/json" },
  });
  const data = readGgDealsApiPriceData(value, String(input.appId));
  if (data === undefined) return undefined;

  return buildGgDealsOffer(input.message, data, `${GG_DEALS_ORIGIN}/steam/app/${input.appId}/`);
}

async function fetchGgDealsPagePriceMatch(input: {
  message: GetPriceMatchForProductMessage;
  requestText: TextRequest;
  steamAppId?: number;
}): Promise<PriceMatchOffer | undefined> {
  for (const url of buildGgDealsPageUrlCandidates(input.message, input.steamAppId)) {
    const html = await input.requestText(url, {
      headers: { "Accept": "text/html" },
      credentials: "include",
    });
    if (html === undefined || isCloudflareChallenge(html)) continue;

    const data = readGgDealsPagePriceData(html);
    if (data === undefined || !isLikelyGgDealsProductMatch(input.message, data.title, url)) continue;

    return buildGgDealsOffer(input.message, data, url);
  }

  return undefined;
}

function buildGgDealsPageUrlCandidates(message: GetPriceMatchForProductMessage, steamAppId: number | undefined): string[] {
  const urls: string[] = [];
  if (steamAppId !== undefined) {
    urls.push(`${GG_DEALS_ORIGIN}/steam/app/${steamAppId}/`);
  }

  const epicSlug = parseEpicGamesProductSlug(message.url) ?? parseEpicGamesProductSlug(message.productUrl);
  const slugs = uniqueStrings([
    epicSlug,
    ...readGameTitleCandidates(message).map(toGgDealsSlug),
  ]);
  for (const slug of slugs) {
    if (slug.length > 0) urls.push(`${GG_DEALS_ORIGIN}/game/${encodeURIComponent(slug)}/`);
  }

  return uniqueStrings(urls);
}

function buildGgDealsOffer(
  message: GetPriceMatchForProductMessage,
  data: GgDealsPriceData,
  fallbackUrl: string,
): PriceMatchOffer | undefined {
  const alternatives = readGgDealsPriceBuckets(data)
    .sort((first, second) => first.amount - second.amount)
    .map(toPriceMatchAlternative);
  const best = alternatives[0];
  if (best === undefined) return undefined;

  const productName = data.title ?? readGameProductName(message) ?? "PC-spill";
  return {
    source: "ggdeals",
    sourceName: "GG Deals",
    matchedExactProduct: true,
    shopName: formatPrimaryGgDealsShopName(best.shopName),
    amount: best.amount,
    sortAmount: best.sortAmount ?? best.amount,
    currency: best.currency,
    price: best.price,
    productName,
    productUrl: data.url ?? fallbackUrl,
    alternatives: alternatives.slice(0, MAX_GG_DEALS_ALTERNATIVES),
  };
}

function formatPrimaryGgDealsShopName(shopName: string): string {
  if (shopName === "Beste keyshop") return "GG Deals Keyshops";
  if (shopName === "Beste offisielle butikk") return "GG Deals Official Stores";
  return shopName;
}

function readGgDealsApiPriceData(value: unknown, id: string): GgDealsPriceData | undefined {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return undefined;
  const rawData = value.data[id];
  if (!isRecord(rawData)) return undefined;
  return readGgDealsPriceData(rawData);
}

function readGgDealsPriceData(value: Record<string, unknown>): GgDealsPriceData | undefined {
  const prices = isRecord(value.prices) ? value.prices : undefined;
  if (prices === undefined) return undefined;

  const currency = typeof prices.currency === "string" && prices.currency.length > 0
    ? prices.currency.toUpperCase()
    : "NOK";
  return {
    ...(typeof value.title === "string" && value.title.length > 0 ? { title: value.title } : {}),
    ...(typeof value.url === "string" && value.url.length > 0 ? { url: value.url } : {}),
    prices: {
      currency,
      ...readOptionalAmount("currentRetail", prices),
      ...readOptionalAmount("currentKeyshops", prices),
      ...readOptionalAmount("historicalRetail", prices),
      ...readOptionalAmount("historicalKeyshops", prices),
    },
  };
}

function readOptionalAmount(key: keyof GgDealsPriceData["prices"], value: Record<string, unknown>): Partial<GgDealsPriceData["prices"]> {
  const amount = readAmount(value[key]);
  return amount !== undefined ? { [key]: amount } : {};
}

function readGgDealsPagePriceData(html: string): GgDealsPriceData | undefined {
  const title = decodeHtml(stripTags(
    html.match(/class=["'][^"']*(?:game-info-title|game-header-title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "",
  )) || undefined;
  const url = decodeHtml(
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ??
    "",
  ) || undefined;
  const currentRetail = readPagePrice(html, "Official Stores");
  const currentKeyshops = readPagePrice(html, "Keyshops");
  const historicalRetail = readPagePrice(html, "Official Stores Low");
  const historicalKeyshops = readPagePrice(html, "Keyshops Low");
  if (
    currentRetail === undefined &&
    currentKeyshops === undefined &&
    historicalRetail === undefined &&
    historicalKeyshops === undefined
  ) {
    return undefined;
  }

  return {
    ...(title !== undefined ? { title } : {}),
    ...(url !== undefined ? { url } : {}),
    prices: {
      currency: readPageCurrency(html) ?? "NOK",
      ...(currentRetail !== undefined ? { currentRetail } : {}),
      ...(currentKeyshops !== undefined ? { currentKeyshops } : {}),
      ...(historicalRetail !== undefined ? { historicalRetail } : {}),
      ...(historicalKeyshops !== undefined ? { historicalKeyshops } : {}),
    },
  };
}

function readPagePrice(html: string, label: string): number | undefined {
  const labelPattern = escapeRegExp(label);
  const labelMatch = html.match(new RegExp(`${labelPattern}[\\s\\S]{0,1200}?class=["'][^"']*price-inner numeric[^"']*["'][^>]*>([\\s\\S]*?)<`, "i"));
  const rawPrice = labelMatch?.[1];
  if (rawPrice === undefined) return undefined;
  return readLocalizedAmount(decodeHtml(stripTags(rawPrice)));
}

function readPageCurrency(html: string): string | undefined {
  if (/\bNOK\b|kr\b/i.test(html)) return "NOK";
  if (/\bUSD\b|\$/i.test(html)) return "USD";
  if (/\bEUR\b|€/i.test(html)) return "EUR";
  if (/\bGBP\b|£/i.test(html)) return "GBP";
  return undefined;
}

function readGgDealsPriceBuckets(data: GgDealsPriceData): GgDealsPriceBucket[] {
  return [
    data.prices.currentRetail !== undefined
      ? {
          amount: data.prices.currentRetail,
          currency: data.prices.currency,
          ...(data.prices.historicalRetail !== undefined ? { historicalAmount: data.prices.historicalRetail } : {}),
          shopName: "Beste offisielle butikk",
        }
      : undefined,
    data.prices.currentKeyshops !== undefined
      ? {
          amount: data.prices.currentKeyshops,
          currency: data.prices.currency,
          ...(data.prices.historicalKeyshops !== undefined ? { historicalAmount: data.prices.historicalKeyshops } : {}),
          shopName: "Beste keyshop",
        }
      : undefined,
  ].filter((bucket): bucket is GgDealsPriceBucket => bucket !== undefined);
}

function toPriceMatchAlternative(bucket: GgDealsPriceBucket): PriceMatchAlternative {
  return {
    shopName: bucket.shopName,
    amount: bucket.amount,
    sortAmount: bucket.amount,
    currency: bucket.currency,
    price: formatCurrency(bucket.amount, bucket.currency),
    ...(bucket.historicalAmount !== undefined && bucket.historicalAmount < bucket.amount
      ? { shippingPrice: `historisk lav ${formatCurrency(bucket.historicalAmount, bucket.currency)}` }
      : {}),
  };
}

function isLikelyGgDealsProductMatch(
  message: GetPriceMatchForProductMessage,
  title: string | undefined,
  url: string,
): boolean {
  if (title === undefined) return true;

  const slug = url.match(/\/game\/([^/?#]+)\/?/i)?.[1];
  const candidates = readGameTitleCandidates(message);
  if (slug !== undefined && candidates.some((candidate) => toGgDealsSlug(candidate) === slug)) return true;
  return candidates.some((candidate) => scoreProductTitleAgainstSearchTerm(candidate, title) >= 0.72);
}

function readGameTitleCandidates(message: GetPriceMatchForProductMessage): string[] {
  return uniqueStrings([
    ...(message.productTitleCandidates ?? []).flatMap(readGameTitleCandidateVariants),
    ...readGameTitleCandidateVariants(message.searchTerm),
  ])
    .filter((candidate) => candidate.length >= 2 && candidate.length <= 120);
}

function readGameTitleCandidateVariants(value: string | undefined): string[] {
  if (value === undefined) return [];
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return [];

  const withoutKnownSuffix = normalized
    .replace(/\s+\|\s+.*$/i, "")
    .replace(/\s+[-\u2013\u2014]\s+(?:Epic Games Store|Steam Store|Steam|Microsoft Store|Xbox(?: Store)?|PlayStation Store).*$/i, "")
    .replace(/\s+(?:hos|at)\s+(?:Epic Games Store|Steam Store|Steam)$/i, "");
  const withoutBuyPrefix = withoutKnownSuffix
    .replace(/^(?:kj\u00f8p|kjop|buy)\s+/i, "")
    .trim();

  return uniqueStrings([withoutBuyPrefix, withoutKnownSuffix, normalized])
    .filter((candidate) => candidate.length > 0);
}

function readGameProductName(message: GetPriceMatchForProductMessage): string | undefined {
  return readGameTitleCandidates(message)[0];
}

function normalizeApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : DEFAULT_GG_DEALS_API_KEY;
}

function normalizeRegion(value: string | undefined): string {
  const trimmed = value?.trim().toLowerCase();
  return trimmed !== undefined && /^[a-z]{2}$/.test(trimmed) ? trimmed : DEFAULT_GG_DEALS_REGION;
}

function readAmount(value: unknown): number | undefined {
  const amount = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value.replace(",", "."))
      : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function readLocalizedAmount(value: string): number | undefined {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(",", ".");
  return readAmount(normalized);
}

function isCloudflareChallenge(html: string): boolean {
  return /cf-mitigated["']?\s*:\s*challenge/i.test(html) ||
    /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html) ||
    /Enable JavaScript and cookies to continue/i.test(html);
}

function toGgDealsSlug(value: string): string {
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
