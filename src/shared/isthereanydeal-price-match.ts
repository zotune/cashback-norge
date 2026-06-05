import type {
  GetPriceMatchForProductMessage,
  PriceMatchAlternative,
  PriceMatchOffer,
} from "./extension-messages.js";
import type { JsonRequest } from "./prisjakt-price-match.js";

type TextRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
) => Promise<string | undefined>;

type AugmentedSteamAppInfo = {
  infoUrl?: string;
};

type AugmentedSteamTarget = {
  type: "app" | "sub" | "bundle";
  id: number;
};

type ItadPageContext = {
  gameId: string;
  infoUrl: string;
  slug?: string;
  title?: string;
  token: string;
  visitorId?: string;
  shops: Map<number, string>;
};

type ItadDeal = {
  shopId: number;
  shopName: string;
  amount: number;
  currency: string;
  price: string;
  url?: string;
  voucher?: string;
};

type ItadPrice = {
  amount: number;
  currency: string;
};

const AUGMENTED_STEAM_PRICES_URL = "https://api.augmentedsteam.com/prices/v2";
const ISTHEREANYDEAL_ORIGIN = "https://isthereanydeal.com";
const ISTHEREANYDEAL_GEO_URL = `${ISTHEREANYDEAL_ORIGIN}/api/geo/`;
const ISTHEREANYDEAL_GAME_INFO_URL = `${ISTHEREANYDEAL_ORIGIN}/api/game/info/`;
const MAX_ITAD_ALTERNATIVES = 8;
const MAX_STEAM_PURCHASE_TARGETS = 8;
const STEAM_SHOP_ID = 61;
const FALLBACK_ITAD_SHOP_IDS = [
  19, 2, 4, 13, 15, 52, 16, 67, 6, 17, 75, 20, 24, 25, 27, 28, 26, 29, 76,
  35, 36, 37, 42, 65, 47, 48, 49, 50, 73, 70, STEAM_SHOP_ID, 62, 64, 72,
];

export async function findIsthereanydealPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
  requestText: TextRequest = fetchText,
): Promise<PriceMatchOffer | undefined> {
  const appId = parseSteamAppId(message.url) ?? parseSteamAppId(message.productUrl);
  if (appId === undefined) return undefined;

  const appTarget: AugmentedSteamTarget = { type: "app", id: appId };
  let appInfo = readAugmentedSteamAppInfo(
    await fetchAugmentedSteamPrices([appTarget], requestJson),
    [appTarget],
  );
  if (appInfo?.infoUrl === undefined) {
    const purchaseTargets = await fetchSteamPurchaseTargets(message, requestText);
    appInfo = readAugmentedSteamAppInfo(
      await fetchAugmentedSteamPrices(purchaseTargets, requestJson),
      purchaseTargets,
    );
  }
  if (appInfo?.infoUrl === undefined) return undefined;

  const pageContext = await fetchItadPageContext(appInfo.infoUrl, requestText);
  if (pageContext === undefined) return undefined;

  const gameInfo = await fetchItadGameInfoWithNok(pageContext, requestJson);
  const deals = readItadDeals(gameInfo, pageContext.shops)
    .filter((deal) => deal.currency === "NOK")
    .sort((first, second) => first.amount - second.amount);
  const bestDeal = deals[0];
  if (bestDeal === undefined) return undefined;

  const productName = pageContext.title ?? readSteamProductName(message) ?? "Steam-spill";
  const productUrl = pageContext.slug !== undefined
    ? `${ISTHEREANYDEAL_ORIGIN}/game/${pageContext.slug}/info/`
    : pageContext.infoUrl;

  return {
    source: "isthereanydeal",
    sourceName: "IsThereAnyDeal",
    matchedCurrentMerchant: deals.some((deal) => deal.shopId === STEAM_SHOP_ID),
    shopName: bestDeal.shopName,
    amount: bestDeal.amount,
    sortAmount: bestDeal.amount,
    currency: bestDeal.currency,
    price: bestDeal.price,
    productName,
    productUrl,
    alternatives: deals.slice(0, MAX_ITAD_ALTERNATIVES).map(toPriceMatchAlternative),
  };
}

export function isSteamAppProductUrl(rawUrl: string | undefined): boolean {
  return parseSteamAppId(rawUrl) !== undefined;
}

export function parseSteamAppId(rawUrl: string | undefined): number | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "store.steampowered.com") return undefined;

    const appId = Number.parseInt(url.pathname.match(/^\/app\/(\d+)(?:\/|$)/i)?.[1] ?? "", 10);
    return Number.isInteger(appId) && appId > 0 ? appId : undefined;
  } catch {
    return undefined;
  }
}

async function fetchAugmentedSteamPrices(
  targets: AugmentedSteamTarget[],
  requestJson: JsonRequest,
): Promise<unknown | undefined> {
  if (targets.length === 0) return undefined;

  return requestJson(AUGMENTED_STEAM_PRICES_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      country: "NO",
      apps: targets.filter((target) => target.type === "app").map((target) => target.id),
      subs: targets.filter((target) => target.type === "sub").map((target) => target.id),
      bundles: targets.filter((target) => target.type === "bundle").map((target) => target.id),
      voucher: true,
      shops: FALLBACK_ITAD_SHOP_IDS,
    }),
  });
}

function readAugmentedSteamAppInfo(
  value: unknown,
  targets: AugmentedSteamTarget[],
): AugmentedSteamAppInfo | undefined {
  if (!isRecord(value) || !isRecord(value.prices)) return undefined;

  for (const target of targets) {
    const targetPrices = value.prices[`${target.type}/${target.id}`];
    if (!isRecord(targetPrices)) continue;

    const urls = isRecord(targetPrices.urls) ? targetPrices.urls : undefined;
    const infoUrl = typeof urls?.info === "string" && urls.info.length > 0
      ? urls.info
      : undefined;
    if (infoUrl !== undefined) return { infoUrl };
  }

  return undefined;
}

async function fetchSteamPurchaseTargets(
  message: GetPriceMatchForProductMessage,
  requestText: TextRequest,
): Promise<AugmentedSteamTarget[]> {
  const steamUrl = readSteamAppUrl(message.url) ?? readSteamAppUrl(message.productUrl);
  if (steamUrl === undefined) return [];

  const html = await requestText(steamUrl, {
    headers: { "Accept": "text/html" },
  });
  if (html === undefined) return [];

  return readSteamPurchaseTargets(html);
}

function readSteamAppUrl(rawUrl: string | undefined): string | undefined {
  if (parseSteamAppId(rawUrl) === undefined || rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("cc", "no");
    url.searchParams.set("l", "english");
    return url.toString();
  } catch {
    return undefined;
  }
}

function readSteamPurchaseTargets(html: string): AugmentedSteamTarget[] {
  const targets: AugmentedSteamTarget[] = [];
  const seen = new Set<string>();
  const patterns: Array<{ type: AugmentedSteamTarget["type"]; pattern: RegExp }> = [
    { type: "sub", pattern: /\bname=["']subid["'][^>]*\bvalue=["'](\d+)["']/gi },
    { type: "bundle", pattern: /\bname=["']bundleid["'][^>]*\bvalue=["'](\d+)["']/gi },
    { type: "sub", pattern: /\/sub\/(\d+)(?:\/|["'?#])/gi },
    { type: "bundle", pattern: /\/bundle\/(\d+)(?:\/|["'?#])/gi },
  ];

  for (const { type, pattern } of patterns) {
    for (const match of html.matchAll(pattern)) {
      const id = Number.parseInt(match[1] ?? "", 10);
      const key = `${type}/${id}`;
      if (!Number.isInteger(id) || id <= 0 || seen.has(key)) continue;
      targets.push({ type, id });
      seen.add(key);
      if (targets.length >= MAX_STEAM_PURCHASE_TARGETS) return targets;
    }
  }

  return targets;
}

async function fetchItadPageContext(
  infoUrl: string,
  requestText: TextRequest,
): Promise<ItadPageContext | undefined> {
  const html = await requestText(infoUrl, {
    headers: { "Accept": "text/html" },
    credentials: "include",
  });
  if (html === undefined) return undefined;

  const globalState = parseScriptJson(html, /var g = (\{[\s\S]*?\});\s*var page = /);
  const pageState = parseScriptJson(html, /var page = (\[[\s\S]*?\]);\s*var /);
  if (!isRecord(globalState) || !Array.isArray(pageState)) return undefined;

  const user = isRecord(globalState.user) ? globalState.user : undefined;
  const token = typeof user?.token === "string" && user.token.length > 0
    ? user.token
    : undefined;
  const visitorId = typeof user?.id === "string" && user.id.length > 0 ? user.id : undefined;
  const shops = readItadShops(globalState.shops);
  const pageProps = isRecord(pageState[1]) ? pageState[1] : undefined;
  const game = isRecord(pageProps?.game) ? pageProps.game : undefined;
  const gameId = typeof game?.id === "string" && game.id.length > 0 ? game.id : undefined;
  if (token === undefined || gameId === undefined || shops.size === 0) return undefined;

  const slug = typeof game?.slug === "string" && game.slug.length > 0 ? game.slug : undefined;
  const title = typeof game?.title === "string" && game.title.length > 0 ? game.title : undefined;
  return {
    gameId,
    infoUrl,
    ...(slug !== undefined ? { slug } : {}),
    ...(title !== undefined ? { title } : {}),
    token,
    ...(visitorId !== undefined ? { visitorId } : {}),
    shops,
  };
}

async function fetchItadGameInfoWithNok(
  pageContext: ItadPageContext,
  requestJson: JsonRequest,
): Promise<unknown | undefined> {
  await setItadNokGeo(pageContext.token, requestJson);

  const gameInfo = await fetchItadGameInfo(pageContext.gameId, pageContext.token, requestJson);
  if (hasNokDeal(gameInfo)) return gameInfo;

  const cookie = buildItadCookieHeader(pageContext);
  if (cookie === undefined) return gameInfo;
  return fetchItadGameInfo(pageContext.gameId, pageContext.token, requestJson, cookie);
}

async function setItadNokGeo(token: string, requestJson: JsonRequest): Promise<void> {
  await requestJson(ISTHEREANYDEAL_GEO_URL, {
    method: "POST",
    headers: itadJsonHeaders(token),
    body: JSON.stringify({ country: "NO", currency: "NOK" }),
    credentials: "include",
  });
}

async function fetchItadGameInfo(
  gameId: string,
  token: string,
  requestJson: JsonRequest,
  cookie?: string,
): Promise<unknown | undefined> {
  return requestJson(ISTHEREANYDEAL_GAME_INFO_URL, {
    method: "POST",
    headers: {
      ...itadJsonHeaders(token),
      ...(cookie !== undefined ? { "Cookie": cookie } : {}),
    },
    body: JSON.stringify({ gid: gameId }),
    credentials: "include",
  });
}

function itadJsonHeaders(token: string): Record<string, string> {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "ITAD-SessionToken": token,
  };
}

function buildItadCookieHeader(pageContext: ItadPageContext): string | undefined {
  if (pageContext.visitorId === undefined) return undefined;
  return [
    `sess2=${pageContext.token}`,
    `visitor=${pageContext.visitorId}`,
    "country=NO",
    "currency=NOK",
  ].join("; ");
}

function readItadShops(value: unknown): Map<number, string> {
  const shops = new Map<number, string>();
  if (!isRecord(value)) return shops;

  for (const [rawId, rawShop] of Object.entries(value)) {
    const id = Number.parseInt(rawId, 10);
    const name = Array.isArray(rawShop) && typeof rawShop[0] === "string"
      ? rawShop[0]
      : undefined;
    if (Number.isInteger(id) && id > 0 && name !== undefined) {
      shops.set(id, name);
    }
  }
  return shops;
}

function readItadDeals(value: unknown, shops: Map<number, string>): ItadDeal[] {
  if (!isRecord(value) || !Array.isArray(value.deals)) return [];

  return value.deals
    .map((deal) => readItadDeal(deal, shops))
    .filter((deal): deal is ItadDeal => deal !== undefined);
}

function hasNokDeal(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.deals)) return false;
  return value.deals.some((deal) => {
    if (!isRecord(deal)) return false;
    const price = readItadPrice(deal.priceNew);
    return price?.currency === "NOK";
  });
}

function readItadDeal(value: unknown, shops: Map<number, string>): ItadDeal | undefined {
  if (!isRecord(value)) return undefined;

  const shopId = readNumber(value.shop);
  const price = readItadPrice(value.priceNew);
  if (shopId === undefined || price === undefined || price.amount <= 0) return undefined;

  const shopName = shops.get(shopId);
  if (shopName === undefined) return undefined;

  const url = typeof value.url === "string" && value.url.length > 0 ? value.url : undefined;
  const voucher = typeof value.voucher === "string" && value.voucher.trim().length > 0
    ? value.voucher.trim()
    : undefined;
  return {
    shopId,
    shopName,
    amount: price.amount,
    currency: price.currency,
    price: formatCurrency(price.amount, price.currency),
    ...(url !== undefined ? { url } : {}),
    ...(voucher !== undefined ? { voucher } : {}),
  };
}

function readItadPrice(value: unknown): ItadPrice | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const amountMinor = readNumber(value[0]);
  const currency = typeof value[1] === "string" ? value[1].toUpperCase() : undefined;
  if (amountMinor === undefined || currency === undefined) return undefined;

  const scale = currencyScale(currency);
  return {
    amount: amountMinor / Math.pow(10, scale),
    currency,
  };
}

function toPriceMatchAlternative(deal: ItadDeal): PriceMatchAlternative {
  return {
    shopName: deal.shopName,
    amount: deal.amount,
    sortAmount: deal.amount,
    currency: deal.currency,
    price: deal.price,
    ...(deal.voucher !== undefined ? { shippingPrice: `kode ${deal.voucher}` } : {}),
  };
}

function readSteamProductName(message: GetPriceMatchForProductMessage): string | undefined {
  const slugName = readSteamProductNameFromUrl(message.url) ?? readSteamProductNameFromUrl(message.productUrl);
  if (slugName !== undefined) return slugName;

  const cleaned = message.searchTerm
    .replace(/^spar\s+\d+\s*%\s+på\s+/i, "")
    .replace(/\s+i\s+steam$/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
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

function parseScriptJson(html: string, pattern: RegExp): unknown | undefined {
  const json = html.match(pattern)?.[1];
  if (json === undefined) return undefined;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
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
    const text = await response.text();
    return text.length > 0 ? JSON.parse(text) as unknown : undefined;
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

function readNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
