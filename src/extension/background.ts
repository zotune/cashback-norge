import {
  type CashbackIndex,
  findOffersForHostname,
  isCashbackIndex,
  parseUrl,
} from "../shared/cashback.js";
import { ACTIVATED_OFFERS_STORAGE_KEY } from "./activation-state.js";
import {
  type CashbackFoundMessage,
  type CashbackNoneMessage,
  type GetPriceMatchForProductMessage,
  type GetOffersForUrlMessage,
  type OffersForUrlResponse,
  type PriceMatchForProductResponse,
  type PriceMatchOffer,
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
const PRISJAKT_NATIVE_GRAPHQL_URL = "https://native-backend.cloud.pji.nu/v1/graphql";
const PRISJAKT_NATIVE_AUTHORIZATION = "Bearer JaNdRgUkXp2s5u8x/A?D(G+KbPeShVmY";

const PRISJAKT_PRODUCT_BY_OFFER_URL_QUERY = `
query SearchProductsByOfferURL($offerUrl: String!) {
  productsByOfferUrl(offerUrl: $offerUrl) {
    id
    name
    webUri
  }
}
`;

const PRISJAKT_OFFER_LIST_QUERY = `
query OfferList($productId: Int!) {
  product(id: $productId) {
    id
    name
    webUri
    offers {
      externalUri
      condition
      shop {
        name
        currency
      }
      price {
        exclShipping
      }
      shipping {
        cheapest {
          shippingCost
        }
      }
    }
  }
}
`;

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
  sendResponse: (response: OffersForUrlResponse | PriceMatchForProductResponse) => void,
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
  if (!message.productPageClue && message.searchTerm.trim().length < 8) {
    return { ok: true };
  }

  const nativeOffer = await fetchNativePrisjaktPriceMatch(message);
  if (nativeOffer !== undefined && isNorwegianPriceMatchOffer(nativeOffer)) {
    return { ok: true, offer: nativeOffer };
  }

  const identifyOffer = await fetchPrisjaktIdentify(message);
  if (identifyOffer !== undefined && isNorwegianPriceMatchOffer(identifyOffer)) {
    return { ok: true, offer: identifyOffer };
  }

  const searchOffer = await fetchPrisjaktSearch(message.searchTerm);
  return { ok: true, ...(searchOffer !== undefined && isNorwegianPriceMatchOffer(searchOffer) ? { offer: searchOffer } : {}) };
}

async function fetchNativePrisjaktPriceMatch(
  message: GetPriceMatchForProductMessage,
): Promise<PriceMatchOffer | undefined> {
  try {
    const product = await fetchNativePrisjaktProductByOfferUrls([message.url, message.productUrl]);
    if (product === undefined) return undefined;

    const offers = (await fetchNativePrisjaktOffers(product.id))
      .filter((offer) => isNorwegianPriceMatchCurrency(offer.currency));
    if (offers.length === 0) return undefined;

    const sortedOffers = [...offers].sort((first, second) => first.sortAmount - second.sortAmount);
    const bestOffer = sortedOffers[0];
    if (bestOffer === undefined) return undefined;

    return {
      shopName: bestOffer.shopName,
      amount: bestOffer.amount,
      currency: bestOffer.currency,
      price: formatPrisjaktPrice(bestOffer.amount, bestOffer.currency),
      productName: product.name,
      productUrl: product.productUrl,
      ...(bestOffer.offerUrl !== undefined ? { offerUrl: bestOffer.offerUrl } : {}),
    };
  } catch {
    return undefined;
  }
}

type NativePrisjaktProduct = {
  id: number;
  name: string;
  productUrl: string;
};

type NativePrisjaktOffer = {
  shopName: string;
  amount: number;
  sortAmount: number;
  currency: string;
  offerUrl?: string;
};

async function fetchNativePrisjaktProductByOfferUrls(
  offerUrls: Array<string | undefined>,
): Promise<NativePrisjaktProduct | undefined> {
  const candidateUrls = uniqueStrings([
    ...offerUrls,
    ...offerUrls.map((url) => url !== undefined ? toCanonicalProductPageUrl(url) : undefined),
  ]);

  for (const candidateUrl of candidateUrls) {
    const product = await fetchNativePrisjaktProductBySingleOfferUrl(candidateUrl);
    if (product !== undefined) return product;
  }

  return undefined;
}

async function fetchNativePrisjaktProductBySingleOfferUrl(
  offerUrl: string,
): Promise<NativePrisjaktProduct | undefined> {
  const value = await fetchNativePrisjaktGraphql({
    operationName: "SearchProductsByOfferURL",
    query: PRISJAKT_PRODUCT_BY_OFFER_URL_QUERY,
    variables: { offerUrl },
  });
  if (!isPlainRecord(value) || !isPlainRecord(value.data) || !Array.isArray(value.data.productsByOfferUrl)) {
    return undefined;
  }

  for (const product of value.data.productsByOfferUrl) {
    if (!isPlainRecord(product)) continue;
    const id = readNumberLike(product.id);
    const name = typeof product.name === "string" ? product.name : undefined;
    const productUrl = typeof product.webUri === "string" ? product.webUri : undefined;
    if (id !== undefined && name !== undefined && productUrl !== undefined) {
      return { id, name, productUrl };
    }
  }

  return undefined;
}

async function fetchNativePrisjaktOffers(productId: number): Promise<NativePrisjaktOffer[]> {
  const value = await fetchNativePrisjaktGraphql({
    operationName: "OfferList",
    query: PRISJAKT_OFFER_LIST_QUERY,
    variables: { productId },
  });
  if (!isPlainRecord(value) || !isPlainRecord(value.data) || !isPlainRecord(value.data.product) || !Array.isArray(value.data.product.offers)) {
    return [];
  }

  return value.data.product.offers
    .map(readNativePrisjaktOffer)
    .filter((offer): offer is NativePrisjaktOffer => offer !== undefined);
}

async function fetchNativePrisjaktGraphql(body: {
  operationName: string;
  query: string;
  variables: Record<string, unknown>;
}): Promise<unknown> {
  const response = await fetch(PRISJAKT_NATIVE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": PRISJAKT_NATIVE_AUTHORIZATION,
      "Content-Type": "application/json",
      "Market": "no",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return undefined;
  return response.json();
}

function readNativePrisjaktOffer(value: unknown): NativePrisjaktOffer | undefined {
  if (!isPlainRecord(value)) return undefined;
  const shop = isPlainRecord(value.shop) ? value.shop : undefined;
  const price = isPlainRecord(value.price) ? value.price : undefined;
  const shipping = isPlainRecord(value.shipping) ? value.shipping : undefined;
  const cheapestShipping = isPlainRecord(shipping?.cheapest) ? shipping.cheapest : undefined;
  const shopName = typeof shop?.name === "string" ? shop.name : undefined;
  const currency = typeof shop?.currency === "string" ? shop.currency : undefined;
  const amount = typeof price?.exclShipping === "number" ? price.exclShipping : undefined;
  const shippingAmount = typeof cheapestShipping?.shippingCost === "number" ? cheapestShipping.shippingCost : 0;
  const condition = typeof value.condition === "string" ? value.condition : undefined;
  if (shopName === undefined || currency === undefined || amount === undefined) return undefined;
  if (condition !== undefined && condition.toUpperCase() !== "NEW") return undefined;

  const offerUrl = typeof value.externalUri === "string" && value.externalUri.length > 0
    ? value.externalUri
    : undefined;

  return {
    shopName,
    amount,
    sortAmount: amount + shippingAmount,
    currency,
    ...(offerUrl !== undefined ? { offerUrl } : {}),
  };
}

async function fetchPrisjaktIdentify(
  message: GetPriceMatchForProductMessage,
): Promise<PriceMatchOffer | undefined> {
  const params = new URLSearchParams();
  params.set("url", message.url);
  params.set("market", "NO");
  params.set("searchTerm", message.searchTerm);
  if (message.productPageClue !== undefined) params.set("productPageClue", String(message.productPageClue));
  if (message.price !== undefined) params.set("price", String(message.price));
  if (message.currency !== undefined) params.set("currency", message.currency);
  if (message.productUrl !== undefined) params.set("productUrl", message.productUrl);
  if (message.organizationName !== undefined) params.set("organizationName", message.organizationName);
  if (message.codes !== undefined && message.codes.length > 0) params.set("codes", message.codes.join(","));

  try {
    const response = await fetch(`https://browser-extension-backend.cloud.pji.nu/v1/identify?${params.toString()}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return undefined;
    const value: unknown = await response.json();
    return readBestPrisjaktOffer(value);
  } catch {
    return undefined;
  }
}

async function fetchPrisjaktSearch(searchTerm: string): Promise<PriceMatchOffer | undefined> {
  const normalizedSearchTerm = searchTerm.trim();
  if (normalizedSearchTerm.length < 4) return undefined;

  const params = new URLSearchParams({
    term: normalizedSearchTerm,
    market: "NO",
    includePromotionDetails: "true",
  });

  try {
    const response = await fetch(`https://browser-extension-backend.cloud.pji.nu/v1/search?${params.toString()}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return undefined;
    const value: unknown = await response.json();
    return readBestPrisjaktOffer(value);
  } catch {
    return undefined;
  }
}

function readBestPrisjaktOffer(value: unknown): PriceMatchOffer | undefined {
  if (!isPlainRecord(value)) return undefined;
  const details = Array.isArray(value.details) ? value.details : [];
  const directProduct = isPlainRecord(value.product) ? value.product : undefined;
  const detail = details.find((entry) => {
    return isPlainRecord(entry) && Array.isArray(entry.offers) && entry.offers.length > 0;
  });
  const product = isPlainRecord(detail) && isPlainRecord(detail.product) ? detail.product : directProduct;
  const offers = isPlainRecord(detail) && Array.isArray(detail.offers)
    ? detail.offers
    : Array.isArray(value.offers)
      ? value.offers
      : [];
  if (!isPlainRecord(product) || offers.length === 0) return undefined;

  const productName = typeof product.name === "string" ? product.name : "Prisjakt-produkt";
  const productId = typeof product.id === "number" || typeof product.id === "string" ? String(product.id) : undefined;
  const parsedOffers = offers
    .map(readPrisjaktOffer)
    .filter((offer): offer is Omit<PriceMatchOffer, "productName" | "productUrl"> => offer !== undefined && isNorwegianPriceMatchCurrency(offer.currency));
  parsedOffers.sort((first, second) => first.amount - second.amount);
  const best = parsedOffers[0];
  if (best === undefined) return undefined;

  return {
    ...best,
    productName,
    productUrl: productId !== undefined ? `https://www.prisjakt.no/product.php?p=${encodeURIComponent(productId)}` : `https://www.prisjakt.no/search?query=${encodeURIComponent(productName)}`,
  };
}

function readPrisjaktOffer(value: unknown): Omit<PriceMatchOffer, "productName" | "productUrl"> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const shop = isPlainRecord(value.shop) ? value.shop : undefined;
  const price = isPlainRecord(value.price) && isPlainRecord(value.price.price) ? value.price.price : undefined;
  const scaledAmount = typeof price?.scaledAmount === "number" ? price.scaledAmount : undefined;
  const currency = typeof price?.currency === "string" ? price.currency : undefined;
  const shopName = typeof shop?.name === "string" ? shop.name : undefined;
  if (scaledAmount === undefined || currency === undefined || shopName === undefined) return undefined;
  const amount = scaledAmount / 100;
  const formatted = formatPrisjaktPrice(amount, currency);
  const url = typeof value.url === "string" && value.url.length > 0
    ? value.url
    : typeof value.externalUrl === "string" && value.externalUrl.length > 0
      ? value.externalUrl
      : undefined;
  return {
    shopName,
    amount,
    currency,
    price: formatted,
    ...(url !== undefined ? { offerUrl: url } : {}),
  };
}

function isNorwegianPriceMatchOffer(offer: PriceMatchOffer): boolean {
  return isNorwegianPriceMatchCurrency(offer.currency);
}

function isNorwegianPriceMatchCurrency(currency: string): boolean {
  return currency.trim().toUpperCase() === "NOK";
}

function formatPrisjaktPrice(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
  return `${formatted} ${currency === "NOK" ? "kr" : currency}`;
}

function readNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toCanonicalProductPageUrl(rawUrl: string): string | undefined {
  const parsedUrl = parseHttpUrl(rawUrl);
  if (parsedUrl === undefined) return undefined;
  return `${parsedUrl.origin}${parsedUrl.pathname}`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.length > 0))];
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
  const downloadedAtMs = Date.parse(downloadedAt);

  if (!Number.isFinite(downloadedAtMs)) {
    return false;
  }

  return Date.now() - downloadedAtMs < INDEX_MAX_AGE_MS;
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
