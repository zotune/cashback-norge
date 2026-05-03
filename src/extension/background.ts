import {
  type CashbackIndex,
  findOffersForHostname,
  isCashbackIndex,
  parseUrl,
} from "../shared/cashback.js";
import {
  type CashbackFoundMessage,
  type CashbackNoneMessage,
  type GetOffersForUrlMessage,
  type OffersForUrlResponse,
  isGetOffersForUrlMessage,
} from "../shared/extension-messages.js";

type CachedIndex = {
  downloadedAt: string;
  index: CashbackIndex;
};

const STORAGE_KEY = "cashback-index";
const INDEX_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const REMOTE_INDEX_URL = "https://zotune.github.io/cashback-norge/cashback-index.json";

chrome.runtime.onInstalled.addListener(() => {
  void refreshIndex();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshIndex();
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
  sendResponse: (response: OffersForUrlResponse) => void,
): Promise<void> {
  if (!isGetOffersForUrlMessage(message)) {
    sendResponse({ ok: false, reason: "Unsupported message" });
    return;
  }

  const response = await findOffersForUrl(message);
  sendResponse(response);
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

function sendTabMessage(
  tabId: number,
  message: CashbackFoundMessage | CashbackNoneMessage,
): Promise<void> {
  return new Promise((resolveValue) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolveValue();
    });
  });
}
