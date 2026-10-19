import type { CashbackIndex } from "../shared/cashback.js";

export type CachedIndex = {
  downloadedAt: string;
  index: CashbackIndex;
};

type IndexCacheOptions = {
  readBundled: () => Promise<CashbackIndex>;
  readCached: () => Promise<CachedIndex | undefined>;
  writeCached: (cached: CachedIndex) => Promise<void>;
  fetchRemote: () => Promise<CashbackIndex>;
  now?: () => number;
};

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const FAILURE_RETRY_INTERVAL_MS = 60 * 1000;

/** Always keep the newest index, including when restarting or working offline. */
export function createCashbackIndexCache(options: IndexCacheOptions) {
  const now = options.now ?? Date.now;
  let localIndex: Promise<CashbackIndex> | undefined;
  let inFlight: Promise<CashbackIndex> | undefined;
  let nextRefreshAt = 0;

  function readLocal(): Promise<CashbackIndex> {
    localIndex ??= Promise.all([
      options.readBundled(),
      options.readCached().catch(() => undefined),
    ]).then(([bundled, cached]) => newestIndex(bundled, cached?.index));
    return localIndex;
  }

  function refresh(): Promise<CashbackIndex> {
    if (inFlight !== undefined) return inFlight;
    inFlight = (async () => {
      let index = await readLocal();
      try {
        index = newestIndex(index, await options.fetchRemote());
        nextRefreshAt = now() + REFRESH_INTERVAL_MS;
        // Retain the fetched result even when persistent storage is unavailable.
        await options.writeCached({ downloadedAt: new Date(now()).toISOString(), index }).catch(() => {});
      } catch {
        nextRefreshAt = now() + FAILURE_RETRY_INTERVAL_MS;
      }
      localIndex = Promise.resolve(index);
      return index;
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  }

  return {
    async get(): Promise<CashbackIndex> {
      if (inFlight !== undefined) return inFlight;
      if (now() >= nextRefreshAt) return refresh();
      return readLocal();
    },
    refresh,
  };
}

function newestIndex(first: CashbackIndex, second: CashbackIndex | undefined): CashbackIndex {
  return second !== undefined && Date.parse(second.generatedAt) > Date.parse(first.generatedAt)
    ? second
    : first;
}
