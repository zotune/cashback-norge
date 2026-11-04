// Shared freshness/cache rules for public supplier catalogues. Prices are never
// persisted here. An offline restart must not replace newer data with the bundle.
export type PublicCatalogCache<T> = { read: () => Promise<unknown>; write: (value: T) => Promise<void> };
export function isFreshPublicCatalog(value: { generatedAt: string }, now = Date.now()): boolean {
  const age = now - Date.parse(value.generatedAt);
  return age >= -86_400_000 && age <= 14 * 86_400_000;
}

export function createPublicCatalogStore<T extends { generatedAt: string }>(bundled: unknown, valid: (v: unknown) => v is T) {
  let active: T | undefined = valid(bundled) ? bundled : undefined;
  let pending: Promise<void> | undefined;
  let loadedAt = 0;
  const adopt = (value: unknown) => {
    if (valid(value) && isFreshPublicCatalog(value) &&
      (active === undefined || Date.parse(value.generatedAt) > Date.parse(active.generatedAt))) active = value;
  };
  return {
    get: () => active !== undefined && isFreshPublicCatalog(active) ? active : undefined,
    async load(fetchCatalog: () => Promise<unknown>, cache?: PublicCatalogCache<T>, refreshAfterMs = 15 * 60_000) {
      if (pending !== undefined) return pending;
      if (Date.now() - loadedAt < refreshAfterMs) return;
      pending = (async () => {
        if (cache !== undefined) { try { adopt(await cache.read()); } catch { /* Keep the public bundle. */ } }
        try { adopt(await fetchCatalog()); } catch { /* Keep the freshest valid public catalogue. */ }
        if (cache !== undefined && active !== undefined && isFreshPublicCatalog(active)) {
          try { await cache.write(active); } catch { /* A cache failure does not hide suppliers. */ }
        }
        loadedAt = Date.now();
      })();
      try { await pending; } finally { pending = undefined; }
    },
  };
}
