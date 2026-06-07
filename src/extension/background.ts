import {
  type CashbackIndex,
  findOffersForHostname,
  isCashbackIndex,
  parseUrl,
} from "../shared/cashback.js";
import { ACTIVATED_OFFERS_STORAGE_KEY } from "./activation-state.js";
import { findPriceMatches } from "../shared/price-match.js";
import {
  findPlayStationRegionPrices,
  isPlayStationProductUrl,
  parsePlayStationProductId,
  type PlayStationRegionPriceResult,
} from "../shared/playstation-region-prices.js";
import {
  findAppStorePriceRegionPricesForUrl,
  getAppStorePriceRegionPriceCacheKey,
  isPotentialAppStorePriceRegionPriceUrl,
} from "../shared/appstoreprice-region-prices.js";
import {
  type CashbackFoundMessage,
  type CashbackNoneMessage,
  type GetPlayStationRegionPricesMessage,
  type GetPriceMatchForProductMessage,
  type GetOffersForUrlMessage,
  type OffersForUrlResponse,
  type PlayStationRegionPricesResponse,
  type PriceMatchForProductResponse,
  isGetPlayStationRegionPricesMessage,
  isGetOffersForUrlMessage,
  isGetPriceMatchForProductMessage,
} from "../shared/extension-messages.js";

type CachedIndex = {
  downloadedAt: string;
  index: CashbackIndex;
};

const STORAGE_KEY = "cashback-index";
const INDEX_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const REMOTE_INDEX_URL = "https://zotune.github.io/cashback-norge/cashback-index.json";
const PLAYSTATION_REGION_PRICE_CACHE_KEY = "playstation-region-price-cache-v3";
const PLAYSTATION_REGION_PRICE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const APPSTOREPRICE_REGION_PRICE_CACHE_KEY = "appstoreprice-region-price-cache-v10";
const APPSTOREPRICE_REGION_PRICE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  void refreshIndex();
  void clearIncognitoActivationsIfNoIncognitoWindows();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshIndex();
  void clearIncognitoActivationsIfNoIncognitoWindows();
});

chrome.windows.onRemoved.addListener(() => {
  void clearIncognitoActivationsIfNoIncognitoWindows();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  void notifyTab(tabId, tab.url ?? "");
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    void chrome.tabs.sendMessage(tab.id, { type: "toggle-notice" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleRuntimeMessage(message, sendResponse);
  return true;
});

async function handleRuntimeMessage(
  message: unknown,
  sendResponse: (response: OffersForUrlResponse | PriceMatchForProductResponse | PlayStationRegionPricesResponse) => void,
): Promise<void> {
  if (isGetOffersForUrlMessage(message)) {
    const response = await findOffersForUrl(message);
    sendResponse(response);
    return;
  }

  if (isGetPriceMatchForProductMessage(message)) {
    const response = await findPriceMatchForProduct(message);
    sendResponse(response);
    return;
  }

  if (isGetPlayStationRegionPricesMessage(message)) {
    const response = await getPlayStationRegionPrices(message);
    sendResponse(response);
    return;
  }

  sendResponse({ ok: false, reason: "Unsupported message" });
}

async function findOffersForUrl(
  message: GetOffersForUrlMessage,
): Promise<OffersForUrlResponse> {
  const parsedUrl = parseHttpUrl(message.url);

  if (parsedUrl === undefined) {
    return { ok: true, offers: [] };
  }

  const cashbackIndex = await ensureIndex();
  return {
    ok: true,
    offers: findOffersForHostname(cashbackIndex, parsedUrl.hostname),
  };
}

async function findPriceMatchForProduct(
  message: GetPriceMatchForProductMessage,
): Promise<PriceMatchForProductResponse> {
  const offers = await findPriceMatches(message);
  return { ok: true, ...(offers[0] !== undefined ? { offer: offers[0], offers } : {}) };
}

async function getPlayStationRegionPrices(
  message: GetPlayStationRegionPricesMessage,
): Promise<PlayStationRegionPricesResponse> {
  if (isPotentialAppStorePriceRegionPriceUrl(message.url)) {
    const cached = await readCachedAppStorePriceRegionPrices(message.url);
    if (cached !== undefined) {
      return { ok: true, result: cached };
    }

    const result = await findAppStorePriceRegionPricesForUrl(message.url);
    if (result === undefined) {
      return { ok: true };
    }

    await cacheAppStorePriceRegionPrices(message.url, result);
    return { ok: true, result };
  }

  if (isPlayStationProductUrl(message.url)) {
    const cached = await readCachedPlayStationRegionPrices(message.url);
    if (cached !== undefined) {
      return { ok: true, result: cached };
    }

    const result = await findPlayStationRegionPrices(message.url);
    if (result === undefined) {
      return { ok: true };
    }

    await cachePlayStationRegionPrices(result);
    return { ok: true, result };
  }

  return { ok: true };
}

async function notifyTab(tabId: number, url: string): Promise<void> {
  const parsedUrl = parseHttpUrl(url);

  if (parsedUrl === undefined) {
    return;
  }

  const cashbackIndex = await ensureIndex();
  const offers = findOffersForHostname(cashbackIndex, parsedUrl.hostname);
  const message: CashbackFoundMessage | CashbackNoneMessage =
    offers.length > 0 ? { type: "cashback-found", offers } : { type: "cashback-none" };

  await sendTabMessage(tabId, message);
}

async function ensureIndex(): Promise<CashbackIndex> {
  const bundledIndex = await readBundledIndex();
  const cachedIndex = await readCachedIndex();

  // Bundled always wins over cached — remote is only a fallback for when bundled is stale
  if (cachedIndex !== undefined && isFresh(cachedIndex.downloadedAt) && cachedIndex.index.generatedAt > bundledIndex.generatedAt) {
    return cachedIndex.index;
  }

  await cacheIndex(bundledIndex);
  void fetchRemoteIndex();
  return bundledIndex;
}

async function cacheIndex(index: CashbackIndex): Promise<void> {
  const cachedIndex: CachedIndex = {
    downloadedAt: new Date().toISOString(),
    index,
  };
  await setStorageValue(STORAGE_KEY, cachedIndex);
}

async function refreshIndex(): Promise<CashbackIndex> {
  // Always use the bundled index first — it's the most up-to-date at build time.
  // Then try to fetch a newer remote version in the background.
  const bundledIndex = await readBundledIndex();
  await cacheIndex(bundledIndex);

  // Fetch remote in background to update for next load
  void fetchRemoteIndex();

  return bundledIndex;
}

async function fetchRemoteIndex(): Promise<void> {
  try {
    const response = await fetch(REMOTE_INDEX_URL);
    const value: unknown = await response.json();

    if (isCashbackIndex(value)) {
      const bundledIndex = await readBundledIndex();
      // Only use remote if it's newer than bundled
      if (value.generatedAt > bundledIndex.generatedAt) {
        await cacheIndex(value);
      }
    }
  } catch {
    // Remote fetch failed, bundled index is already in use
  }
}

async function readCachedPlayStationRegionPrices(url: string): Promise<PlayStationRegionPriceResult | undefined> {
  const productId = parsePlayStationProductId(url);
  if (productId === undefined) {
    return undefined;
  }

  const cache = await getStorageValue(PLAYSTATION_REGION_PRICE_CACHE_KEY);
  if (!isPlainRecord(cache)) {
    return undefined;
  }

  const cached = cache[productId];
  if (!isPlayStationRegionPriceResult(cached) || !isFreshWithin(cached.fetchedAt, PLAYSTATION_REGION_PRICE_CACHE_MAX_AGE_MS)) {
    return undefined;
  }

  return cached;
}

async function cachePlayStationRegionPrices(result: PlayStationRegionPriceResult): Promise<void> {
  const cache = await getStorageValue(PLAYSTATION_REGION_PRICE_CACHE_KEY);
  const next = isPlainRecord(cache) ? { ...cache } : {};
  next[result.productId] = result;
  await setStorageValue(PLAYSTATION_REGION_PRICE_CACHE_KEY, next);
}

async function readCachedAppStorePriceRegionPrices(url: string): Promise<PlayStationRegionPriceResult | undefined> {
  const cacheKey = getAppStorePriceRegionPriceCacheKey(url);
  if (cacheKey === undefined) {
    return undefined;
  }

  const cache = await getStorageValue(APPSTOREPRICE_REGION_PRICE_CACHE_KEY);
  if (!isPlainRecord(cache)) {
    return undefined;
  }

  const cached = cache[cacheKey];
  if (!isPlayStationRegionPriceResult(cached) || !isFreshWithin(cached.fetchedAt, APPSTOREPRICE_REGION_PRICE_CACHE_MAX_AGE_MS)) {
    return undefined;
  }

  return cached;
}

async function cacheAppStorePriceRegionPrices(url: string, result: PlayStationRegionPriceResult): Promise<void> {
  const cache = await getStorageValue(APPSTOREPRICE_REGION_PRICE_CACHE_KEY);
  const next = isPlainRecord(cache) ? { ...cache } : {};
  const urlCacheKey = getAppStorePriceRegionPriceCacheKey(url);
  if (urlCacheKey !== undefined) {
    next[urlCacheKey] = result;
  }
  next[result.productId.replace(/^appstoreprice:/, "")] = result;
  await setStorageValue(APPSTOREPRICE_REGION_PRICE_CACHE_KEY, next);
}

async function readBundledIndex(): Promise<CashbackIndex> {
  const response = await fetch(chrome.runtime.getURL("cashback-index.json"));
  const value: unknown = await response.json();

  if (!isCashbackIndex(value)) {
    throw new Error("Bundled cashback index is invalid");
  }

  return value;
}

async function readCachedIndex(): Promise<CachedIndex | undefined> {
  const value = await getStorageValue(STORAGE_KEY);

  if (!isCachedIndex(value)) {
    return undefined;
  }

  return value;
}

function isCachedIndex(value: unknown): value is CachedIndex {
  return (
    typeof value === "object" &&
    value !== null &&
    "downloadedAt" in value &&
    "index" in value &&
    typeof value.downloadedAt === "string" &&
    isCashbackIndex(value.index)
  );
}

function isFresh(downloadedAt: string): boolean {
  return isFreshWithin(downloadedAt, INDEX_MAX_AGE_MS);
}

function isFreshWithin(downloadedAt: string, maxAgeMs: number): boolean {
  const downloadedAtMs = Date.parse(downloadedAt);

  if (!Number.isFinite(downloadedAtMs)) {
    return false;
  }

  return Date.now() - downloadedAtMs < maxAgeMs;
}

function parseHttpUrl(url: string): URL | undefined {
  const parsedUrl = parseUrl(url);

  if (parsedUrl === undefined) {
    return undefined;
  }

  return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
    ? parsedUrl
    : undefined;
}

function getStorageValue(key: string): Promise<unknown> {
  return new Promise((resolveValue) => {
    chrome.storage.local.get(key, (items) => {
      const value: unknown = items[key];
      resolveValue(value);
    });
  });
}

function setStorageValue(key: string, value: unknown): Promise<void> {
  return new Promise((resolveValue) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolveValue();
    });
  });
}

async function clearIncognitoActivationsIfNoIncognitoWindows(): Promise<void> {
  const windows = await getAllWindows();
  if (windows.some((windowInfo) => windowInfo.incognito === true)) {
    return;
  }

  const stored = await getStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  if (!isPlainRecord(stored)) {
    return;
  }

  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith("incognito:")) {
      changed = true;
      continue;
    }
    next[key] = value;
  }

  if (changed) {
    await setStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, next);
  }
}

function getAllWindows(): Promise<chrome.windows.Window[]> {
  return new Promise((resolveValue) => {
    chrome.windows.getAll({}, resolveValue);
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlayStationRegionPriceResult(value: unknown): value is PlayStationRegionPriceResult {
  return (
    isPlainRecord(value) &&
    typeof value.productId === "string" &&
    typeof value.fetchedAt === "string" &&
    (value.productName === undefined || typeof value.productName === "string") &&
    (value.ratesUpdatedAt === undefined || typeof value.ratesUpdatedAt === "string") &&
    (value.sourceProvider === undefined || value.sourceProvider === "playstation" || value.sourceProvider === "appstoreprice") &&
    (value.sourceName === undefined || typeof value.sourceName === "string") &&
    (value.sourceDetail === undefined || typeof value.sourceDetail === "string") &&
    (value.planName === undefined || typeof value.planName === "string") &&
    (value.availablePlanNames === undefined || (Array.isArray(value.availablePlanNames) && value.availablePlanNames.every((entry) => typeof entry === "string"))) &&
    Array.isArray(value.prices) &&
    value.prices.every(isPlayStationRegionPrice)
  );
}

function isPlayStationRegionPrice(value: unknown): value is PlayStationRegionPriceResult["prices"][number] {
  return (
    isPlainRecord(value) &&
    typeof value.region === "string" &&
    typeof value.countryName === "string" &&
    typeof value.flag === "string" &&
    typeof value.locale === "string" &&
    typeof value.currency === "string" &&
    typeof value.price === "number" &&
    typeof value.formattedPrice === "string" &&
    typeof value.nokAmount === "number" &&
    typeof value.formattedNok === "string" &&
    typeof value.productUrl === "string" &&
    (value.priceHistoryUrl === undefined || typeof value.priceHistoryUrl === "string") &&
    (value.sourceProvider === undefined || value.sourceProvider === "playstation" || value.sourceProvider === "appstoreprice") &&
    (value.sourceName === undefined || typeof value.sourceName === "string") &&
    (value.sourceDetail === undefined || typeof value.sourceDetail === "string") &&
    (value.planName === undefined || typeof value.planName === "string") &&
    (value.planAlternatives === undefined || (Array.isArray(value.planAlternatives) && value.planAlternatives.every(isRegionPricePlanAlternative)))
  );
}

function isRegionPricePlanAlternative(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    typeof value.planName === "string" &&
    (value.formattedPrice === undefined || typeof value.formattedPrice === "string") &&
    (value.formattedNok === undefined || typeof value.formattedNok === "string") &&
    (value.unavailableReason === undefined || typeof value.unavailableReason === "string")
  );
}

function sendTabMessage(
  tabId: number,
  message: CashbackFoundMessage | CashbackNoneMessage,
): Promise<void> {
  return new Promise((resolveValue) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      void chrome.runtime.lastError;
      resolveValue();
    });
  });
}
