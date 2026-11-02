import { KIWI_PRICE_PROBE_PARAM, type KiwiSortPrices } from "../shared/flight-search.js";

// Kiwi gir bare riktige priser til sin egen side, så prisen leses fra søket åpnet i en bakgrunnsfane.
// Vi rører ikke tokens eller API-et; innholdsskriptet leser bare det siden viser og fanen lukkes.
const PROBE_TIMEOUT_MS = 35_000;
const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_KEY_PREFIX = "kiwi-prices:";

type CachedPrices = { savedAt: number; prices?: KiwiSortPrices };
type ActiveProbe = { tabId: number; finish: (prices: KiwiSortPrices | undefined) => void };

let activeProbe: ActiveProbe | undefined;
const probesInFlight = new Map<string, Promise<KiwiSortPrices | undefined>>();

function isKiwiSearchUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" && parsedUrl.hostname === "www.kiwi.com" && parsedUrl.pathname.includes("/search/results/");
  } catch {
    return false;
  }
}

async function readCachedPrices(url: string): Promise<CachedPrices | undefined> {
  const key = CACHE_KEY_PREFIX + url;
  const cached = (await chrome.storage.session.get(key))[key] as CachedPrices | undefined;
  if (cached === undefined) return undefined;
  const ttlMs = cached.prices !== undefined ? PRICE_CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;
  return Date.now() - cached.savedAt < ttlMs ? cached : undefined;
}

function startProbe(url: string, windowId: number | undefined): Promise<KiwiSortPrices | undefined> {
  // Bare siste søk er interessant, så en eldre fane lukkes i stedet for å bli liggende.
  activeProbe?.finish(undefined);
  return new Promise((resolveValue) => {
    const probeUrl = new URL(url);
    probeUrl.searchParams.set(KIWI_PRICE_PROBE_PARAM, "1");
    chrome.tabs.create({ url: probeUrl.toString(), active: false, ...(windowId !== undefined ? { windowId } : {}) }, (tab) => {
      if (chrome.runtime.lastError !== undefined || tab?.id === undefined) {
        resolveValue(undefined);
        return;
      }
      const tabId = tab.id;
      const timerId = setTimeout(() => probe.finish(undefined), PROBE_TIMEOUT_MS);
      const probe: ActiveProbe = {
        tabId,
        finish: (prices) => {
          clearTimeout(timerId);
          if (activeProbe === probe) activeProbe = undefined;
          void chrome.tabs.remove(tabId).catch(() => undefined);
          resolveValue(prices);
        },
      };
      activeProbe = probe;
    });
  });
}

export async function getKiwiFlightPrices(url: string, windowId: number | undefined): Promise<KiwiSortPrices | undefined> {
  if (!isKiwiSearchUrl(url)) return undefined;
  const cached = await readCachedPrices(url);
  if (cached !== undefined) return cached.prices;

  let probe = probesInFlight.get(url);
  if (probe === undefined) {
    probe = startProbe(url, windowId).then(async (prices) => {
      const cachedPrices: CachedPrices = { savedAt: Date.now(), ...(prices !== undefined ? { prices } : {}) };
      await chrome.storage.session.set({ [CACHE_KEY_PREFIX + url]: cachedPrices });
      return prices;
    }).finally(() => probesInFlight.delete(url));
    probesInFlight.set(url, probe);
  }
  return probe;
}

export function finishKiwiPriceProbe(tabId: number | undefined, prices: KiwiSortPrices | undefined): void {
  if (tabId === undefined) return;
  if (activeProbe?.tabId === tabId) {
    activeProbe.finish(prices);
    return;
  }
  // Bakgrunnsskriptet kan ha startet på nytt under søket; fanen skal lukkes uansett.
  void chrome.tabs.remove(tabId).catch(() => undefined);
}

export function installKiwiPriceProbeCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (activeProbe?.tabId === tabId) activeProbe.finish(undefined);
  });
}
