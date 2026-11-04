import { Configuration, HttpCrawler, MemoryStorage } from "crawlee";
import { buildElectricitySupplierCatalog, ELECTRICITY_SUPPLIER_SOURCE, isElectricitySupplierCatalog, isFreshElectricitySupplierCatalog, type ElectricitySupplierCatalog } from "../shared/electricity-supplier-catalog.js";
import { readJsonFile } from "./json-file.js";
import type { Logger } from "./logger.js";
import { isRecord, normalizeHostname, parseUrl } from "../shared/cashback.js";
import { decodeHtmlEntities } from "../shared/product-match.js";

// Public Forbrukerrådet product feed, not a cashback provider. The catalogue
// contains only supplier identity/price-list URLs; offer prices remain live.
export async function fetchElectricitySupplierCatalog(input: { generatedAt: string; sourceUrl?: string; logger?: Logger }): Promise<ElectricitySupplierCatalog> {
  let catalog: ElectricitySupplierCatalog | undefined;
  let raw: unknown;
  let failure = "ingen svar";
  const crawler = new HttpCrawler({
    maxConcurrency: 1, maxRequestRetries: 2, maxRequestsPerCrawl: 1,
    additionalMimeTypes: ["application/octet-stream", "text/plain"],
    requestHandlerTimeoutSecs: 30, useSessionPool: false, persistCookiesPerSession: false, ignoreHttpErrorStatusCodes: [403, 429],
    async requestHandler({ body, response, request }) {
      if (response.statusCode === 403 || response.statusCode === 429) request.noRetry = true;
      if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode}`);
      raw = JSON.parse(body.toString());
      catalog = buildElectricitySupplierCatalog(raw, input.generatedAt);
    },
    failedRequestHandler({ request }, error) { failure = `${request.url}: ${error.message}`; },
  }, new Configuration({ persistStorage: false, storageClient: new MemoryStorage({ persistStorage: false }) }));
  await crawler.run([{ url: input.sourceUrl ?? ELECTRICITY_SUPPLIER_SOURCE }]);
  if (catalog === undefined) throw new Error(`Forbrukerrådet leverandørkatalog: ${failure}`);
  // Some organizations have no price-list URL. Only use their reported offer
  // URL after a bounded public-page check confirms the supplier in the title.
  // An advertising/tracking destination must not establish a supplier domain.
  const known = new Set(catalog.suppliers.map((row) => row.id));
  const candidates = new Map<number, { name: string; urls: Map<string, string> }>();
  if (Array.isArray(raw)) for (const row of raw) {
    if (!isRecord(row) || row.expiredAt !== null || !isRecord(row.organization) || known.has(row.organization.id as number) ||
      !Number.isSafeInteger(row.organization.id) || typeof row.organization.name !== "string" || typeof row.orderUrl !== "string") continue;
    const url = parseUrl(row.orderUrl.trim());
    if (url === undefined || url.protocol !== "https:" || url.username || url.password || url.port) continue;
    url.search = ""; url.hash = "";
    const item = candidates.get(row.organization.id as number) ?? { name: row.organization.name, urls: new Map<string, string>() };
    item.urls.set(normalizeHostname(url.hostname), url.href);
    candidates.set(row.organization.id as number, item);
  }
  const checks = [...candidates].filter(([, item]) => item.urls.size === 1).slice(0, 10);
  const verified = new Map<number, string>();
  if (checks.length > 0) {
    const verifier = new HttpCrawler({
      maxConcurrency: 1, maxRequestRetries: 2, maxRequestsPerCrawl: checks.length,
      additionalMimeTypes: ["application/octet-stream", "text/plain"],
      requestHandlerTimeoutSecs: 30, useSessionPool: false, persistCookiesPerSession: false, ignoreHttpErrorStatusCodes: [403, 429],
      async requestHandler({ request, response, body }) {
        if (response.statusCode === 403 || response.statusCode === 429) { request.noRetry = true; throw new Error(`HTTP ${response.statusCode}; ingen omgåelse`); }
        if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode}`);
        const target = parseUrl(request.loadedUrl ?? request.url);
        const original = new URL(request.url);
        const title = decodeHtmlEntities(body.toString().match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
        const name = (request.userData.name as string).replace(/\s+(AS|ASA)$/i, "").toLocaleLowerCase("nb-NO");
        if (target === undefined || normalizeHostname(target.hostname) !== normalizeHostname(original.hostname) || !title.includes(name)) {
          input.logger?.warn(`Forbrukerrådet: kunne ikke bekrefte leverandør ${request.userData.name} på ${request.url}`);
          return;
        }
        verified.set(request.userData.id as number, target.href);
      },
      failedRequestHandler({ request }, error) { input.logger?.warn(`Forbrukerrådet leverandørside ${request.url}: ${error.message}`); },
    }, new Configuration({ persistStorage: false, storageClient: new MemoryStorage({ persistStorage: false }) }));
    await verifier.run(checks.map(([id, item]) => ({ url: [...item.urls.values()][0]!, userData: { id, name: item.name } })));
  }
  return buildElectricitySupplierCatalog(raw, input.generatedAt, verified);
}

export async function collectElectricitySupplierCatalog(input: { generatedAt: string; previousPath: string; logger: Logger; sourceUrl?: string }): Promise<ElectricitySupplierCatalog | undefined> {
  let previous: ElectricitySupplierCatalog | undefined;
  try { const value = await readJsonFile(input.previousPath); if (isElectricitySupplierCatalog(value)) previous = value; } catch { /* First crawl. */ }
  try {
    const catalog = await fetchElectricitySupplierCatalog(input);
    if (previous !== undefined && previous.suppliers.length >= 10 && catalog.suppliers.length < previous.suppliers.length / 2) throw new Error("leverandørlisten falt med over 50 %");
    input.logger.info(`Forbrukerrådet leverandørkatalog: ${catalog.suppliers.length} domener`);
    return catalog;
  } catch (error) {
    input.logger.warn(`Forbrukerrådet leverandørkatalog: ${error instanceof Error ? error.message : String(error)}`);
    // Keep the original generatedAt, just as the other 14-day fallbacks do.
    return previous !== undefined && isFreshElectricitySupplierCatalog(previous, Date.parse(input.generatedAt)) ? previous : undefined;
  }
}
