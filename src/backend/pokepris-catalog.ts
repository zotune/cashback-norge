// Daily Pokepris identity catalog: which merchant product URL Pokepris links to
// which of its products. Clients use it to open the right price list without
// guessing from titles; prices and stock are always read live on the product page.
//
// Source: the public store pages call the site's own `getProducts` server
// action with a store filter. Its rows carry the store's product URL and
// Pokepris' canonical ID, whose prefix is the product language. The action ID
// is discovered from the homepage's same-origin Next chunks; no script runs.
// Store IDs come from /butikker; stores missing there are read from their own
// page listed in the sitemap. Limitations: only the public "en" and "jp"
// language filters are read, and Pokepris' dataset licence is CC BY-NC 4.0.
import { Configuration, ErrorTracker, HttpCrawler, type HttpCrawlingContext, MemoryStorage, type RequestOptions } from "crawlee";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isRecord, parseUrl } from "../shared/cashback.js";
import { isFreshPokeprisCatalog, isPokeprisCatalog, type PokeprisCatalog, type PokeprisCatalogProduct } from "../shared/pokepris-catalog.js";
import { readPokeprisScriptUrls, readPokeprisSearchAction, readPokeprisSearchResult } from "../shared/pokepris-price-match.js";
import { findStructuredProperty, readNextFlightValues } from "../shared/product-data.js";
import { normalizeProductUrlKey } from "../shared/product-match.js";
import { readJsonFile } from "./json-file.js";
import type { Logger } from "./logger.js";

const DEFAULT_ORIGIN = "https://www.pokepris.no";
const LANGUAGES = ["en", "jp"] as const;
const PAGE_SIZE = 200;
const MAX_PAGES_PER_QUERY = 10;
/** The unfiltered product list is larger than any single store. */
const MAX_PRODUCT_LIST_PAGES = 30;
const MAX_STORES = 200;
/** A partial result is published only when nearly every store query worked. */
const MAX_FAILED_QUERY_SHARE = 0.1;
/** A sudden drop usually means a changed response, not a smaller catalogue. */
const MIN_URL_SHARE_OF_PREVIOUS = 0.5;
// Pokepris' canonical ID prefixes, as the shared TCG language codes.
const LANGUAGE_CODES: Record<string, string> = { en: "en", jp: "jp", cn: "zh", kr: "ko" };

export type PokeprisCatalogRow = Omit<PokeprisCatalogProduct, "language"> & { productUrl: string };

export type FetchPokeprisCatalogInput = {
  generatedAt: string;
  logger: Logger;
  origin?: string;
  maxPagesPerQuery?: number;
};

type Store = { id: number; name: string };

export async function fetchPokeprisCatalog(input: FetchPokeprisCatalogInput): Promise<PokeprisCatalog> {
  const origin = input.origin ?? DEFAULT_ORIGIN;
  const maxPages = input.maxPagesPerQuery ?? MAX_PAGES_PER_QUERY;
  input.logger.info(`Pokepris catalog: discovering stores and the getProducts action at ${origin}`);

  let scripts: string[] = [];
  let action: string | undefined;
  let listedStores: Store[] | undefined;
  let storeSlugs: string[] | undefined;
  const discovery = await crawl(input, "discovery", [
    { url: `${origin}/`, userData: { kind: "home" } },
    { url: `${origin}/butikker`, userData: { kind: "stores" } },
    { url: `${origin}/sitemap.xml`, userData: { kind: "sitemap" } },
  ], 3 + 16, async ({ text, request, addRequests }) => {
    const kind = request.userData.kind as string;
    if (kind === "home") {
      scripts = readPokeprisScriptUrls(text, origin);
      if (scripts[0] !== undefined) await addRequests([{ url: scripts[0], userData: { kind: "script", index: 0 } }]);
    } else if (kind === "script") {
      // One chunk at a time; stop as soon as the action is found.
      action ??= readPokeprisSearchAction(text);
      const next = scripts[Number(request.userData.index) + 1];
      if (action === undefined && next !== undefined) await addRequests([{ url: next, userData: { kind: "script", index: Number(request.userData.index) + 1 } }]);
    } else if (kind === "stores") {
      listedStores = readStoreLists(readNextFlightValues(text)).sort((a, b) => b.length - a.length)[0] ?? [];
      if (listedStores.length === 0) throw new NoRetryError(`no stores in the store list at ${request.url}`);
    } else {
      storeSlugs = [...new Set([...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
        .map((match) => parseUrl(match[1]!))
        .filter((url): url is URL => url?.origin === origin)
        .map((url) => url.pathname.match(/^\/butikk\/([^/]+)\/?$/)?.[1])
        .filter((slug): slug is string => slug !== undefined))];
    }
  });
  if (action === undefined) throw new Error(`Pokepris catalog: getProducts action not found in ${scripts.length} homepage scripts; ${discovery.join("; ")}`);
  if (listedStores === undefined || storeSlugs === undefined) throw new Error(`Pokepris catalog: store list or sitemap missing; ${discovery.join("; ")}`);

  const stores = new Map(listedStores.map((store) => [store.id, store]));
  const knownSlugs = new Set(listedStores.map((store) => slugify(store.name)));
  const unlisted = storeSlugs.filter((slug) => !knownSlugs.has(slug));
  if (unlisted.length > 0) {
    input.logger.info(`Pokepris catalog: reading ${unlisted.length} store pages missing from the store list`);
    const failures = await crawl(input, "store pages", unlisted.map((slug) => ({ url: `${origin}/butikk/${encodeURIComponent(slug)}`, userData: { kind: "store" } })),
      unlisted.length, async ({ text, request }) => {
        const values = readNextFlightValues(text);
        const id = findStructuredProperty(values, "fixedStore");
        const store = readStoreLists(values).flat().find((item) => item.id === id);
        if (store === undefined) throw new NoRetryError(`store ID missing at ${request.url}`);
        stores.set(store.id, store);
      });
    for (const failure of failures) input.logger.warn(failure);
  }
  if (stores.size === 0 || stores.size > MAX_STORES) throw new Error(`Pokepris catalog: unexpected store count ${stores.size}`);

  const rows: PokeprisCatalogRow[] = [];
  // The unfiltered list gives each product's own ID, as on pokepris.no.
  const mainIds = new Map<string, number>();
  const queries = [...stores.values()].flatMap((store) => LANGUAGES.map((language) => ({ store, language })));
  const actionRequest = (store: Store | undefined, language: string, page: number): RequestOptions => ({
    url: `${origin}/`, method: "POST", uniqueKey: `getProducts:${store?.id ?? "all"}:${language}:${page}`,
    headers: { "Next-Action": action!, "Content-Type": "text/plain;charset=UTF-8", "Accept": "text/x-component" },
    payload: JSON.stringify([{ ...(store !== undefined ? { storeId: store.id } : {}), tcg: "pokemon", inStockOnly: false, language, limit: PAGE_SIZE, offset: page * PAGE_SIZE }]),
    userData: { kind: "products", ...(store !== undefined ? { storeId: store.id, storeName: store.name } : {}), language, page },
  });
  input.logger.info(`Pokepris catalog: reading ${stores.size} stores and the product list in ${LANGUAGES.join("/")}`);
  let skippedRows = 0;
  const failedQueries = new Set<string>();
  const failures = await crawl(input, "store products", [
    ...queries.map(({ store, language }) => actionRequest(store, language, 0)),
    ...LANGUAGES.map((language) => actionRequest(undefined, language, 0)),
  ], (queries.length * maxPages) + (LANGUAGES.length * MAX_PRODUCT_LIST_PAGES), async ({ text, request, addRequests }) => {
    const { storeId, storeName, language, page } = request.userData as { storeId?: number; storeName?: string; language: string; page: number };
    const label = storeName ?? "the product list";
    const result = readPokeprisSearchResult(text);
    if (!isRecord(result) || !Array.isArray(result.products) || typeof result.hasMore !== "boolean") {
      throw new NoRetryError(`invalid getProducts response for ${label} (${language}, page ${page + 1})`);
    }
    for (const value of result.products) {
      if (storeId === undefined) {
        if (isRecord(value) && typeof value.canonical_id === "string" && typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0) mainIds.set(value.canonical_id, value.id);
        continue;
      }
      const row = readRow(value);
      if (row === undefined) skippedRows += 1;
      else rows.push(row);
    }
    if (!result.hasMore) return;
    if (page + 1 >= (storeId === undefined ? MAX_PRODUCT_LIST_PAGES : maxPages)) {
      if (storeId !== undefined) failedQueries.add(`${storeId}:${language}`);
      input.logger.warn(`Pokepris catalog: ${label} (${language}) has more pages than the limit; stopped there`);
      return;
    }
    await addRequests([actionRequest(storeId === undefined ? undefined : { id: storeId, name: storeName! }, language, page + 1)]);
  }, (request) => { if (request.userData.storeId !== undefined) failedQueries.add(`${request.userData.storeId}:${request.userData.language}`); });
  for (const failure of failures) input.logger.warn(failure);
  if (failedQueries.size > queries.length * MAX_FAILED_QUERY_SHARE) {
    throw new Error(`Pokepris catalog: ${failedQueries.size}/${queries.length} store queries failed; ${failures.slice(0, 5).join("; ")}`);
  }
  if (skippedRows > 0) input.logger.info(`Pokepris catalog: skipped ${skippedRows} unmatched, redacted or incomplete rows`);

  const { catalog, conflicts } = buildPokeprisCatalog(rows, input.generatedAt, origin, mainIds);
  if (conflicts.length > 0) input.logger.warn(`Pokepris catalog: omitted ${conflicts.length} merchant URLs linked to different products, e.g. ${conflicts.slice(0, 3).join(", ")}`);
  if (catalog.products.length === 0) throw new Error("Pokepris catalog: no products in store listings");
  input.logger.info(`Pokepris catalog: ${catalog.products.length} products and ${Object.keys(catalog.urls).length} merchant URLs from ${stores.size} stores`);
  return catalog;
}

// Several Pokepris product IDs can share one canonical product, and every one
// of them opens the same price list. The product list's own ID represents it;
// without one, the lowest store-listing ID does.
export function buildPokeprisCatalog(rows: PokeprisCatalogRow[], generatedAt: string, source: string, mainIds: ReadonlyMap<string, number> = new Map()): { catalog: PokeprisCatalog; conflicts: string[] } {
  const products = new Map<string, PokeprisCatalogProduct>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    if (products.has(row.canonicalId)) continue;
    const language = LANGUAGE_CODES[row.canonicalId.match(/^([a-z]{2})_/)?.[1] ?? ""];
    products.set(row.canonicalId, {
      id: mainIds.get(row.canonicalId) ?? row.id, canonicalId: row.canonicalId, name: row.name, category: row.category,
      ...(row.setName !== undefined ? { setName: row.setName } : {}),
      ...(language !== undefined ? { language } : {}),
    });
  }
  const urls = new Map<string, number>();
  const conflicts = new Set<string>();
  for (const row of rows) {
    const key = normalizeProductUrlKey(row.productUrl);
    if (key === undefined) continue;
    const id = products.get(row.canonicalId)!.id;
    if (urls.has(key) && urls.get(key) !== id) conflicts.add(key);
    urls.set(key, id);
  }
  for (const key of conflicts) urls.delete(key);
  return {
    catalog: {
      version: 1, generatedAt, source,
      products: [...products.values()].sort((a, b) => a.id - b.id),
      urls: Object.fromEntries([...urls].sort(([a], [b]) => a.localeCompare(b))),
    },
    conflicts: [...conflicts].sort(),
  };
}

export type CollectPokeprisCatalogInput = FetchPokeprisCatalogInput & { previousPath: string };

// Keep the previous catalog, with its own generatedAt, for up to 14 days.
export async function collectPokeprisCatalog(input: CollectPokeprisCatalogInput): Promise<PokeprisCatalog | undefined> {
  const previous = await readPreviousCatalog(input.previousPath);
  try {
    const catalog = await fetchPokeprisCatalog(input);
    const previousUrls = previous === undefined ? 0 : Object.keys(previous.urls).length;
    const urls = Object.keys(catalog.urls).length;
    if (urls < previousUrls * MIN_URL_SHARE_OF_PREVIOUS) {
      throw new Error(`Pokepris catalog: only ${urls} merchant URLs, previous catalog had ${previousUrls}`);
    }
    return catalog;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (previous !== undefined && isFreshPokeprisCatalog(previous, Date.parse(input.generatedAt))) {
      input.logger.warn(`${message}; reusing the catalog generated ${previous.generatedAt}`);
      return previous;
    }
    input.logger.error(`${message}; no usable previous catalog`);
    return undefined;
  }
}

// One product and one URL per line keeps the daily diff readable.
export async function writePokeprisCatalog(filePath: string, catalog: PokeprisCatalog): Promise<void> {
  const { products, urls, ...header } = catalog;
  const lines = [
    `${JSON.stringify(header).slice(0, -1)},"products":[`,
    products.map((product) => JSON.stringify(product)).join(",\n"),
    `],"urls":{`,
    Object.entries(urls).map(([key, id]) => `${JSON.stringify(key)}:${id}`).join(",\n"),
    "}}",
  ];
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function readPreviousCatalog(filePath: string): Promise<PokeprisCatalog | undefined> {
  try {
    const value = await readJsonFile(filePath);
    return isPokeprisCatalog(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function readRow(value: unknown): PokeprisCatalogRow | undefined {
  if (!isRecord(value) || value.redacted === true) return undefined;
  const { id, canonical_id: canonicalId, name, category, set_name: setName, product_url: productUrl } = value;
  const url = typeof productUrl === "string" ? parseUrl(productUrl) : undefined;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return undefined;
  // A "unique" ID or a missing category marks a single-store listing that
  // Pokepris has not matched to a product; its price list compares nothing.
  if (typeof canonicalId !== "string" || !/^[a-z]{2,3}_[a-z0-9_]+$/.test(canonicalId) || /^[a-z]{2,3}_unique_/.test(canonicalId)) return undefined;
  if (typeof name !== "string" || !name.trim() || typeof category !== "string" || !category) return undefined;
  if (url === undefined || !["http:", "https:"].includes(url.protocol)) return undefined;
  return {
    id, canonicalId, name: name.trim(), category, productUrl: url.href,
    ...(typeof setName === "string" && setName.trim() ? { setName: setName.trim() } : {}),
  };
}

// Translations also use the key "stores", so read every list of store records.
function readStoreLists(values: unknown[]): Store[][] {
  const lists: Store[][] = [];
  const pending = [...values];
  for (let visited = 0; visited < pending.length && visited < 50_000; visited += 1) {
    const item = pending[visited];
    if (Array.isArray(item)) pending.push(...item);
    else if (isRecord(item)) {
      if (Array.isArray(item.stores)) {
        const stores = item.stores.filter(isRecord).flatMap((store) =>
          typeof store.id === "number" && Number.isSafeInteger(store.id) && store.id > 0 && typeof store.name === "string" && store.name.trim()
            ? [{ id: store.id, name: store.name.trim() }] : []);
        if (stores.length > 0) lists.push(stores);
      }
      pending.push(...Object.values(item));
    }
  }
  return lists;
}

// Matches the slugs of the public store pages, e.g. "Game & Trade" → game-and-trade.
function slugify(name: string): string {
  return name.toLowerCase().replace(/ø/g, "oe").replace(/æ/g, "ae").replace(/å/g, "aa").replace(/&/g, "and")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

class NoRetryError extends Error {}

type Handler = (context: { text: string; request: { url: string; userData: Record<string, unknown> }; addRequests: (requests: RequestOptions[]) => Promise<unknown> }) => Promise<void>;

async function crawl(input: FetchPokeprisCatalogInput, label: string, requests: RequestOptions[], maxRequests: number,
  handle: Handler, onFailed?: (request: { userData: Record<string, unknown> }) => void): Promise<string[]> {
  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  const failures: string[] = [];
  const crawler: HttpCrawler<HttpCrawlingContext> = new HttpCrawler({
    maxConcurrency: 1, maxRequestsPerCrawl: maxRequests, maxRequestRetries: 2,
    useSessionPool: false, ignoreSslErrors: false,
    navigationTimeoutSecs: 30, requestHandlerTimeoutSecs: 30,
    // Every body is parsed and validated below. An error page of any type must
    // reach the status check instead of being dropped as an unsupported type.
    additionalMimeTypes: ["*/*"],
    requestHandler: async ({ body, request, response }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        // Repeating the same unauthenticated request cannot fix an access block.
        if ([401, 403, 404].includes(status)) request.noRetry = true;
        throw new Error(`HTTP ${status}`);
      }
      try {
        await handle({ text: Buffer.isBuffer(body) ? body.toString("utf8") : String(body), request, addRequests: (next) => crawler.addRequests(next) });
      } catch (error) {
        if (error instanceof NoRetryError) request.noRetry = true;
        throw error;
      }
    },
    failedRequestHandler: async ({ request }, error) => {
      failures.push(`Pokepris catalog (${label}): ${request.method} ${request.url}${request.payload ? ` ${request.payload}` : ""} failed (${error.message.slice(0, 300)})`);
      onFailed?.(request);
    },
  }, config);
  crawler.stats.errorTracker = new ErrorTracker({ showErrorMessage: false });
  crawler.stats.errorTrackerRetry = new ErrorTracker({ showErrorMessage: false });
  await crawler.run(requests);
  return failures;
}
