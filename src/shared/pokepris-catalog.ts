import { isRecord } from "./cashback.js";
import { normalizeProductUrlKey } from "./product-match.js";

// Daily identity catalog built by the backend from Pokepris' public store
// listings: which merchant product URL Pokepris associates with which product.
// It holds no prices; clients always read current offers from the product page.
export const POKEPRIS_CATALOG_URL = "https://cashbacknorge.no/pokepris-catalog.json";
/** Same limit as the crawl's provider fallback. */
export const POKEPRIS_CATALOG_MAX_AGE_MS = 14 * 86_400_000;

export type PokeprisCatalogProduct = {
  id: number;
  canonicalId: string;
  name: string;
  category: string;
  setName?: string;
  /** Shared TCG language code (en, jp, zh, ko), from Pokepris' canonical ID. */
  language?: string;
};

export type PokeprisCatalog = {
  version: 1;
  generatedAt: string;
  source: string;
  products: PokeprisCatalogProduct[];
  /** Normalized merchant product URL → product ID. */
  urls: Record<string, number>;
};

export function isPokeprisCatalog(value: unknown): value is PokeprisCatalog {
  if (!isRecord(value) || value.version !== 1 || typeof value.source !== "string") return false;
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) return false;
  if (!Array.isArray(value.products) || !isRecord(value.urls)) return false;
  const ids = new Set<number>();
  for (const product of value.products) {
    if (!isRecord(product) || !Number.isSafeInteger(product.id) || (product.id as number) <= 0) return false;
    if (typeof product.canonicalId !== "string" || typeof product.name !== "string" || typeof product.category !== "string") return false;
    if (product.setName !== undefined && typeof product.setName !== "string") return false;
    if (product.language !== undefined && typeof product.language !== "string") return false;
    ids.add(product.id as number);
  }
  return Object.values(value.urls).every((id) => typeof id === "number" && ids.has(id));
}

export function isFreshPokeprisCatalog(catalog: PokeprisCatalog, now = Date.now()): boolean {
  const age = now - Date.parse(catalog.generatedAt);
  return age >= -86_400_000 && age <= POKEPRIS_CATALOG_MAX_AGE_MS;
}

const productsById = new WeakMap<PokeprisCatalog, Map<number, PokeprisCatalogProduct>>();

// The first URL that Pokepris lists for a product decides; the page's own
// URL comes before its canonical URL.
export function findPokeprisCatalogProduct(catalog: PokeprisCatalog, urls: Array<string | undefined>): PokeprisCatalogProduct | undefined {
  let byId = productsById.get(catalog);
  if (byId === undefined) {
    byId = new Map(catalog.products.map((product) => [product.id, product]));
    productsById.set(catalog, byId);
  }
  for (const url of urls) {
    const key = url === undefined ? undefined : normalizeProductUrlKey(url);
    const id = key === undefined || !Object.hasOwn(catalog.urls, key) ? undefined : catalog.urls[key];
    const product = id === undefined ? undefined : byId.get(id);
    if (product !== undefined) return product;
  }
  return undefined;
}
