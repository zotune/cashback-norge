// Coupert exposes a public store catalogue on its website and a separate
// public app feed with the authoritative cashback support flag. The website
// catalogue is used only to discover candidates; every candidate is verified
// against the app feed before an offer is emitted.
import {
  isRecord,
  normalizeDomainInput,
  type CashbackOffer,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const COUPERT_SOURCE_URL =
  "https://www.coupert.com/stores?anchor=all_cashback_store_blank&utm_source=refer";
const DEFAULT_API_BASE_URLS = [
  "https://www.coupert.com",
  "https://www.coupert.me",
];
const DEFAULT_SEARCH_API_BASE_URLS = [
  ...DEFAULT_API_BASE_URLS,
  "https://api-01.coupert.com",
  "https://api-02.coupert.com",
  "https://api-03.coupert.com",
  "https://api-04.coupert.com",
];
const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_SEARCH_CONCURRENCY = 6;

type CoupertCatalogStore = {
  merchantId: string;
  merchantName: string;
  domain: string;
  countries: string[];
  isCanonicalDomain: boolean;
};

type CoupertCatalogCandidate = Omit<
  CoupertCatalogStore,
  "merchantId" | "countries"
> & {
  merchantIds: string[];
};

type CoupertVerifiedStore = {
  merchantName: string;
  domain: string;
  minPercentage?: number;
  maxPercentage: number;
};

type CoupertCatalogPage = {
  list: unknown[];
  total: number;
};

export async function fetchCoupert(options: {
  generatedAt: string;
  knownDomains: Iterable<string>;
  logger: Logger;
  apiBaseUrls?: string[];
  searchApiBaseUrls?: string[];
  maxPages?: number;
  pageSize?: number;
  searchConcurrency?: number;
}): Promise<CashbackOffer[]> {
  const apiBaseUrls = normalizeApiBaseUrls(
    options.apiBaseUrls ?? DEFAULT_API_BASE_URLS,
  );
  const configuredSearchApiBaseUrls = normalizeApiBaseUrls(
    options.searchApiBaseUrls ??
      (options.apiBaseUrls === undefined
        ? DEFAULT_SEARCH_API_BASE_URLS
        : apiBaseUrls),
  );
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const searchConcurrency =
    options.searchConcurrency ?? DEFAULT_SEARCH_CONCURRENCY;

  if (apiBaseUrls.length === 0) {
    throw new Error("no API base URLs configured");
  }
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error("maxPages must be a positive integer");
  }
  if (!Number.isInteger(searchConcurrency) || searchConcurrency <= 0) {
    throw new Error("searchConcurrency must be a positive integer");
  }

  const knownDomains = new Set(
    [...options.knownDomains]
      .map(normalizeDomainInput)
      .filter((domain) => domain.length > 0),
  );
  if (knownDomains.size === 0) {
    options.logger.info("Coupert: no known domains to enrich");
    return [];
  }

  const catalog = await fetchCatalog({
    apiBaseUrls,
    logger: options.logger,
    maxPages,
    pageSize,
  });
  const candidatesByDomain = new Map<string, CoupertCatalogCandidate>();

  for (const value of catalog.rows) {
    const store = parseCatalogStore(value);
    if (
      store === undefined ||
      !knownDomains.has(store.domain) ||
      !isRelevantToNorway(store)
    ) {
      continue;
    }

    const existing = candidatesByDomain.get(store.domain);
    if (existing === undefined) {
      candidatesByDomain.set(store.domain, {
        merchantName: store.merchantName,
        domain: store.domain,
        merchantIds: [store.merchantId],
        isCanonicalDomain: store.isCanonicalDomain,
      });
      continue;
    }

    if (!existing.merchantIds.includes(store.merchantId)) {
      existing.merchantIds.push(store.merchantId);
    }
    if (store.isCanonicalDomain && !existing.isCanonicalDomain) {
      existing.merchantName = store.merchantName;
      existing.isCanonicalDomain = true;
    }
  }

  const candidates = [...candidatesByDomain.values()];
  options.logger.info(
    `Coupert: ${candidates.length} known Norwegian/global candidate stores from ${catalog.rows.length} catalogue rows`,
  );

  const searchApiBaseUrls = [
    catalog.apiBaseUrl,
    ...configuredSearchApiBaseUrls.filter(
      (apiBaseUrl) => apiBaseUrl !== catalog.apiBaseUrl,
    ),
  ];
  const verifiedStores = await mapWithConcurrency(
    candidates,
    searchConcurrency,
    async (candidate) => {
      return verifyCashbackStore(candidate, searchApiBaseUrls);
    },
  );

  const stores = verifiedStores.filter(
    (store): store is CoupertVerifiedStore => store !== undefined,
  );
  const merchantNameCounts = new Map<string, number>();
  for (const store of stores) {
    const key = store.merchantName.trim().toLowerCase();
    merchantNameCounts.set(key, (merchantNameCounts.get(key) ?? 0) + 1);
  }

  const offers = stores.map((store): CashbackOffer => {
    const merchantNameKey = store.merchantName.trim().toLowerCase();
    const merchantName = (merchantNameCounts.get(merchantNameKey) ?? 0) > 1
      ? `${store.merchantName} (${store.domain})`
      : store.merchantName;

    return {
      provider: "coupert",
      merchantName,
      domains: [store.domain],
      reward: formatCoupertReward(
        store.minPercentage,
        store.maxPercentage,
      ),
      sourceUrl: COUPERT_SOURCE_URL,
      activationUrl: buildCoupertStoreUrl(store.domain),
      terms:
        "Sats oppgitt av Coupert og kan variere etter varekategori. Logg inn hos Coupert og aktiver cashback før kjøpet. Fullfør kjøpet på butikkens nettsted; kjøp i butikkens app kvalifiserer normalt ikke.",
      updatedAt: options.generatedAt,
    };
  });

  options.logger.info(
    `Coupert: ${offers.length} verified cashback offers for already-known sites`,
  );
  return offers;
}

async function fetchCatalog(options: {
  apiBaseUrls: string[];
  logger: Logger;
  maxPages: number;
  pageSize: number;
}): Promise<{ apiBaseUrl: string; rows: unknown[] }> {
  const errors: string[] = [];

  for (const apiBaseUrl of options.apiBaseUrls) {
    try {
      const firstPage = await fetchCatalogPage(apiBaseUrl, 1, options.pageSize);
      const pageCount = Math.max(1, Math.ceil(firstPage.total / options.pageSize));
      if (pageCount > options.maxPages) {
        throw new Error(
          `catalogue needs ${pageCount} pages, above maxPages=${options.maxPages}`,
        );
      }

      const remainingPageNumbers = Array.from(
        { length: pageCount - 1 },
        (_value, index) => index + 2,
      );
      const remainingPages = await mapWithConcurrency(
        remainingPageNumbers,
        4,
        async (page) => fetchCatalogPage(apiBaseUrl, page, options.pageSize),
      );
      const rows = [
        ...firstPage.list,
        ...remainingPages.flatMap((page) => page.list),
      ];

      options.logger.info(
        `Coupert: fetched ${pageCount} catalogue pages from ${apiBaseUrl}`,
      );
      return { apiBaseUrl, rows };
    } catch (error) {
      const message = formatError(error);
      errors.push(`${apiBaseUrl}: ${message}`);
      options.logger.warn(
        `Coupert: catalogue API unavailable at ${apiBaseUrl} (${message})`,
      );
    }
  }

  throw new Error(`all catalogue API hosts failed (${errors.join("; ")})`);
}

async function fetchCatalogPage(
  apiBaseUrl: string,
  page: number,
  pageSize: number,
): Promise<CoupertCatalogPage> {
  const url = new URL("/api/v3/store/category_stores", apiBaseUrl);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(pageSize));
  url.searchParams.set("country_code", "NO");

  const envelope = await fetchCoupertJson(url);
  const data = readApiData(envelope, url);
  if (!isRecord(data) || !Array.isArray(data.list)) {
    throw new Error(`invalid catalogue payload from ${url.toString()}`);
  }

  const total = readFiniteNumber(data.total);
  if (total === undefined || total < 0) {
    throw new Error(`invalid catalogue total from ${url.toString()}`);
  }

  return { list: data.list, total };
}

async function verifyCashbackStore(
  candidate: CoupertCatalogCandidate,
  apiBaseUrls: string[],
): Promise<CoupertVerifiedStore | undefined> {
  const errors: string[] = [];

  for (const apiBaseUrl of apiBaseUrls) {
    const url = new URL("/app/v2/recommend/search", apiBaseUrl);
    url.searchParams.set("keyword", candidate.domain);
    url.searchParams.set("lang", "en");

    try {
      const envelope = await fetchCoupertJson(url);
      const data = readApiData(envelope, url);
      const stores = readSearchStores(data);
      const exactStores = stores.filter((value) => {
        if (!isRecord(value)) return false;
        const merchantId = readIdentifier(value.id);
        return (
          normalizeDomainInput(readString(value.domain)) === candidate.domain &&
          candidate.merchantIds.includes(merchantId)
        );
      });

      const verifiedStores = exactStores.flatMap(
        (exactStore): CoupertVerifiedStore[] => {
          if (!isRecord(exactStore)) return [];
          if (readString(exactStore.is_cashback).toUpperCase() !== "YES") {
            return [];
          }
          if (readString(exactStore.cb_type).toLowerCase() !== "percentage") {
            return [];
          }

          const cashback = exactStore.cashback;
          if (
            !isRecord(cashback) ||
            cashback.supported !== true ||
            readString(cashback.type).toLowerCase() !== "percentage"
          ) {
            return [];
          }

          const minPercentage = readPercentageRate(cashback.minPercentage);
          const maxPercentage = readPercentageRate(cashback.maxPercentage);
          if (maxPercentage === undefined || maxPercentage <= 0) {
            return [];
          }

          return [{
            merchantName:
              readString(exactStore.name).trim() || candidate.merchantName,
            domain: candidate.domain,
            ...(minPercentage !== undefined && minPercentage > 0
              ? { minPercentage }
              : {}),
            maxPercentage,
          }];
        },
      );

      return verifiedStores.sort(
        (left, right) => right.maxPercentage - left.maxPercentage,
      )[0];
    } catch (error) {
      errors.push(`${apiBaseUrl}: ${formatError(error)}`);
    }
  }

  throw new Error(
    `cashback verification failed for ${candidate.domain} (${errors.join("; ")})`,
  );
}

function parseCatalogStore(value: unknown): CoupertCatalogStore | undefined {
  if (!isRecord(value)) return undefined;

  const domain = normalizeDomainInput(readString(value.Domain));
  if (domain.length === 0 || !domain.includes(".")) return undefined;
  const merchantId = readIdentifier(value.ID);
  if (merchantId === "") return undefined;

  const merchantName = readString(value.Name).trim() || domain;
  const domainSub = normalizeDomainInput(readString(value.DomainSub));
  const countries = Array.isArray(value.country_codes)
    ? value.country_codes
      .filter((country): country is string => typeof country === "string")
      .map((country) => country.trim().toUpperCase())
    : [];

  return {
    merchantId,
    merchantName,
    domain,
    countries,
    isCanonicalDomain: domainSub === "" || domainSub === domain,
  };
}

function isRelevantToNorway(store: CoupertCatalogStore): boolean {
  return (
    store.domain.endsWith(".no") ||
    store.countries.includes("NO") ||
    store.countries.includes("GLOBAL")
  );
}

function readSearchStores(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data) || !isRecord(data.stores)) {
    throw new Error("invalid cashback search payload");
  }

  const groups = Object.values(data.stores).filter(Array.isArray);
  if (groups.length === 0) {
    throw new Error("invalid cashback search store groups");
  }

  return groups.flat();
}

async function fetchCoupertJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.toString()}`);
  }

  return response.json() as Promise<unknown>;
}

function readApiData(envelope: unknown, url: URL): unknown {
  if (!isRecord(envelope) || envelope.code !== 0) {
    const message = isRecord(envelope) ? readString(envelope.message) : "";
    throw new Error(
      `API error from ${url.toString()}${message === "" ? "" : `: ${message}`}`,
    );
  }

  return envelope.data;
}

function readPercentageRate(value: unknown): number | undefined {
  const rate = readFiniteNumber(value);
  return rate !== undefined && rate >= 0 && rate <= 1 ? rate : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readIdentifier(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function formatCoupertReward(
  minPercentage: number | undefined,
  maxPercentage: number,
): string {
  const max = maxPercentage * 100;
  if (minPercentage === undefined || minPercentage <= 0) {
    return `Opptil ${formatPercentageValue(max)} %`;
  }

  const min = minPercentage * 100;
  if (Math.abs(min - max) < 0.000_001) {
    return `${formatPercentageValue(max)} %`;
  }

  return `${formatPercentageValue(Math.min(min, max))}-${formatPercentageValue(Math.max(min, max))} %`;
}

function formatPercentageValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

function buildCoupertStoreUrl(domain: string): string {
  return `https://www.coupert.com/shop/${encodeURIComponent(domain)}?utm_source=refer`;
}

function normalizeApiBaseUrls(apiBaseUrls: string[]): string[] {
  return [...new Set(apiBaseUrls.map((value) => value.trim().replace(/\/+$/, "")))]
    .filter((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;

        const value = values[index];
        if (value === undefined) continue;
        results[index] = await mapper(value, index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
