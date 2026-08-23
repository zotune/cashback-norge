// Rabatta's public Norwegian shop catalogue is opt-in in the main crawler.
// Each /no/shops/{slug} page inlines the exact Norwegian webshop id in its
// server-rendered payload, which avoids mixing similarly named Nordic shop
// variants. The id used to live in the client bundle as a full shop map, but
// rabatta.app moved that lookup server side in August 2026.
import {
  isRecord,
  normalizeDomainInput,
  type CashbackOffer,
  uniqueOffers,
} from "../../shared/cashback.js";
import {
  isDomainLike,
  merchantDomainsFromHostname,
} from "../merchant-domains.js";
import type { Logger } from "../logger.js";

const DEFAULT_SHOP_PAGE_BASE_URL = "https://rabatta.app/no/shops";
const DEFAULT_SITEMAP_URL = "https://rabatta.app/sitemap.xml";
const DEFAULT_API_BASE_URL = "https://rabatta.app/api";
const DEFAULT_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const JSON_REQUEST_ATTEMPTS = 3;
// A single renamed field or reshuffled page must not take the whole crawl
// down, but a wholesale layout change on rabatta.app still has to fail loudly.
const MIN_RESOLVED_SHOP_RATIO = 0.8;
const NO_CONTENT_RESPONSE = Symbol("Rabatta no content");

type NorwegianShopConfig = {
  displayName: string;
  slug: string;
  webshopId: number;
};

type FetchShopConfigsInput = {
  concurrency: number;
  logger: Logger;
  shopPageBaseUrl: string;
  slugs: string[];
};

type RabattaCoupon = {
  code: string;
  saving?: number;
};

type RabattaWebshop = {
  coupons: RabattaCoupon[];
  domain: string;
  id: number;
  identifiers: string[];
};

export type FetchRabattaInput = {
  generatedAt: string;
  logger: Logger;
  apiBaseUrl?: string;
  concurrency?: number;
  shopPageBaseUrl?: string;
  shopSlugs?: Iterable<string>;
  sitemapUrl?: string;
};

export async function fetchRabatta(
  input: FetchRabattaInput,
): Promise<CashbackOffer[]> {
  const concurrency = input.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("concurrency must be a positive integer");
  }

  const shopPageBaseUrl = stripTrailingSlash(
    input.shopPageBaseUrl ?? DEFAULT_SHOP_PAGE_BASE_URL,
  );
  const sitemapUrl = input.sitemapUrl ?? DEFAULT_SITEMAP_URL;
  const apiBaseUrl = stripTrailingSlash(
    input.apiBaseUrl ?? DEFAULT_API_BASE_URL,
  );
  const requestedSlugs = normalizeRequestedSlugs(input.shopSlugs);

  const sitemapXml = await fetchText(sitemapUrl);
  const norwegianSlugs = parseNorwegianShopSlugs(sitemapXml);
  if (norwegianSlugs.length === 0) {
    throw new Error("the sitemap contained no Norwegian shop pages");
  }

  const targetSlugs = selectRequestedSlugs(norwegianSlugs, requestedSlugs);
  const shopConfigs = await fetchNorwegianShopConfigs({
    concurrency,
    logger: input.logger,
    shopPageBaseUrl,
    slugs: targetSlugs,
  });
  validateShopConfigCoverage(shopConfigs, targetSlugs);

  input.logger.info(
    `Rabatta: testing ${shopConfigs.length} of ${targetSlugs.length} Norwegian shops`,
  );

  let completedWebshopRequests = 0;
  let unavailableWebshopRequests = 0;
  const rows = await mapWithConcurrency(
    shopConfigs,
    concurrency,
    async (config): Promise<CashbackOffer[]> => {
      try {
        const value = await fetchJson(
          `${apiBaseUrl}/webshop/v10/${config.webshopId}`,
        );
        if (value === NO_CONTENT_RESPONSE) {
          completedWebshopRequests += 1;
          unavailableWebshopRequests += 1;
          return [];
        }
        const webshop = parseWebshop(value, config.webshopId);

        if (webshop === undefined) {
          input.logger.warn(
            `Rabatta: invalid webshop response for ${config.slug} (${config.webshopId})`,
          );
          return [];
        }

        completedWebshopRequests += 1;
        return buildOffers(webshop, config, input.generatedAt);
      } catch (error) {
        input.logger.warn(
          `Rabatta: could not fetch ${config.slug} (${config.webshopId}): ${formatError(error)}`,
        );
        return [];
      }
    },
  );

  if (shopConfigs.length > 0 && completedWebshopRequests === 0) {
    throw new Error("all Norwegian webshop requests failed");
  }

  const offers = uniqueOffers(rows.flat());
  input.logger.info(
    `Rabatta: ${offers.length} usable codes from ${completedWebshopRequests - unavailableWebshopRequests} Norwegian shop responses` +
    (unavailableWebshopRequests === 0
      ? ""
      : `; ${unavailableWebshopRequests} shops returned no content`),
  );
  return offers;
}

export function parseNorwegianShopSlugs(sitemapXml: string): string[] {
  const slugs = new Set<string>();
  const pattern = /<loc>\s*https:\/\/rabatta\.app\/no\/shops\/([^<\s/?#]+)\/?\s*<\/loc>/gi;

  for (const match of sitemapXml.matchAll(pattern)) {
    const rawSlug = match[1];
    if (rawSlug === undefined) continue;

    try {
      const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
      if (/^[a-z0-9]+$/.test(slug)) slugs.add(slug);
    } catch {
      // Ignore malformed sitemap entries.
    }
  }

  return [...slugs];
}

async function fetchNorwegianShopConfigs(
  input: FetchShopConfigsInput,
): Promise<NorwegianShopConfig[]> {
  const rows = await mapWithConcurrency(
    input.slugs,
    input.concurrency,
    async (slug): Promise<NorwegianShopConfig[]> => {
      const pageUrl = `${input.shopPageBaseUrl}/${encodeURIComponent(slug)}`;
      try {
        const config = parseShopPageConfig(await fetchText(pageUrl), slug);
        if (config === undefined) {
          input.logger.warn(
            `Rabatta: no webshop id in the ${slug} shop page`,
          );
          return [];
        }
        return [config];
      } catch (error) {
        input.logger.warn(
          `Rabatta: could not read the ${slug} shop page: ${formatError(error)}`,
        );
        return [];
      }
    },
  );

  return dedupeShopConfigs(rows.flat(), input.logger);
}

export function parseShopPageConfig(
  html: string,
  slug: string,
): NorwegianShopConfig | undefined {
  const candidates: NorwegianShopConfig[] = [];

  for (const configObject of findObjectProperties(html, "config")) {
    const idMatch = configObject.match(/(?:^|[,\{])webshopId:(\d+)/);
    const rawWebshopId = idMatch?.[1];
    if (rawWebshopId === undefined) continue;

    const webshopId = Number.parseInt(rawWebshopId, 10);
    if (!Number.isSafeInteger(webshopId) || webshopId <= 0) continue;

    const displayName =
      readJavaScriptStringProperty(configObject, "displayName") ??
      formatMerchantName(slug);
    const config: NorwegianShopConfig = { displayName, slug, webshopId };

    // A page can embed configs for more than one route match, so prefer the
    // one that names this shop over the first id that happens to appear.
    const webshopName = readJavaScriptStringProperty(configObject, "webshopName");
    if (webshopName?.trim().toLowerCase() === slug) return config;

    candidates.push(config);
  }

  return candidates[0];
}

function dedupeShopConfigs(
  configs: NorwegianShopConfig[],
  logger: Logger,
): NorwegianShopConfig[] {
  const configByWebshopId = new Map<number, NorwegianShopConfig>();

  for (const config of configs) {
    const existing = configByWebshopId.get(config.webshopId);
    if (existing === undefined) {
      configByWebshopId.set(config.webshopId, config);
      continue;
    }

    logger.warn(
      `Rabatta: ${config.slug} and ${existing.slug} both resolved to webshop id ${config.webshopId}; keeping ${existing.slug}`,
    );
  }

  return [...configByWebshopId.values()];
}

function validateShopConfigCoverage(
  configs: NorwegianShopConfig[],
  targetSlugs: string[],
): void {
  if (targetSlugs.length === 0) return;

  const minimumCount = Math.ceil(targetSlugs.length * MIN_RESOLVED_SHOP_RATIO);
  if (configs.length > 0 && configs.length >= minimumCount) return;

  const configuredSlugs = new Set(configs.map((config) => config.slug));
  const missingSlugs = targetSlugs.filter(
    (slug) => !configuredSlugs.has(slug),
  );
  throw new Error(
    `the Rabatta shop pages mapped ${configs.length}/${targetSlugs.length} Norwegian shops; missing: ${formatSlugList(missingSlugs)}`,
  );
}

function formatSlugList(slugs: string[]): string {
  const shown = slugs.slice(0, 10);
  const remaining = slugs.length - shown.length;
  return shown.join(", ") + (remaining <= 0 ? "" : ` (+${remaining} more)`);
}

function selectRequestedSlugs(
  norwegianSlugs: string[],
  requestedSlugs: string[] | undefined,
): string[] {
  if (requestedSlugs === undefined) return norwegianSlugs;

  const knownSlugs = new Set(norwegianSlugs);
  const missingSlugs = requestedSlugs.filter((slug) => !knownSlugs.has(slug));
  if (missingSlugs.length > 0) {
    throw new Error(
      `unknown Norwegian Rabatta shop slug(s): ${missingSlugs.join(", ")}`,
    );
  }

  return requestedSlugs;
}

function normalizeRequestedSlugs(
  values: Iterable<string> | undefined,
): string[] | undefined {
  if (values === undefined) return undefined;

  const slugs = new Set<string>();
  for (const value of values) {
    const slug = value.trim().toLowerCase();
    if (slug.length > 0) slugs.add(slug);
  }
  return [...slugs];
}

function findObjectProperties(
  source: string,
  propertyName: string,
): string[] {
  const escapedName = escapeRegExp(propertyName);
  // The server-rendered payload assigns shared objects through a `$R[n]=`
  // reference table before the object literal itself.
  const propertyPattern = new RegExp(
    `(?:^|[,\\{])${escapedName}:(?:\\$R\\[\\d+\\]=)?\\{`,
    "g",
  );
  const objects: string[] = [];

  for (const match of source.matchAll(propertyPattern)) {
    const openingBraceOffset = match[0].lastIndexOf("{");
    if (openingBraceOffset === -1 || match.index === undefined) continue;

    const object = readBalancedObject(
      source,
      match.index + openingBraceOffset,
    );
    if (object !== undefined) objects.push(object);
  }

  return objects;
}

function readBalancedObject(
  source: string,
  openingBraceIndex: number,
): string | undefined {
  let depth = 0;
  let stringDelimiter: "\"" | "'" | "`" | undefined;
  let escaped = false;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === undefined) break;

    if (stringDelimiter !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === stringDelimiter) {
        stringDelimiter = undefined;
      }
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      stringDelimiter = character;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}") continue;

    depth -= 1;
    if (depth === 0) {
      return source.slice(openingBraceIndex, index + 1);
    }
  }

  return undefined;
}

function readJavaScriptStringProperty(
  source: string,
  propertyName: string,
): string | undefined {
  const escapedName = escapeRegExp(propertyName);
  const match = source.match(
    new RegExp(`(?:^|[,\\{])${escapedName}:([\"'\\x60])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`),
  );
  const value = match?.[2];
  if (value === undefined) return undefined;

  return value
    .replace(/\\`/g, "`")
    .replace(/\\([\\\"'])/g, "$1")
    .trim();
}

function parseWebshop(
  value: unknown,
  expectedWebshopId: number,
): RabattaWebshop | undefined {
  if (
    !isRecord(value) ||
    value.id !== expectedWebshopId ||
    !Array.isArray(value.coupons)
  ) {
    return undefined;
  }

  const domain = typeof value.domain === "string"
    ? normalizeDomainInput(value.domain)
    : "";
  if (!isDomainLike(domain)) return undefined;

  const identifiers = Array.isArray(value.identifiers)
    ? value.identifiers.filter(
      (identifier): identifier is string => typeof identifier === "string",
    )
    : [];
  const coupons = value.coupons.flatMap(parseCoupon);

  return {
    coupons,
    domain,
    id: expectedWebshopId,
    identifiers,
  };
}

function parseCoupon(value: unknown): RabattaCoupon[] {
  if (!isRecord(value) || typeof value.code !== "string") return [];

  const code = value.code.trim();
  if (!isReusableDiscountCode(code)) return [];

  const saving = typeof value.saving === "number" &&
      Number.isFinite(value.saving) &&
      value.saving > 0 &&
      value.saving <= 100
    ? value.saving
    : undefined;

  return [{ code, ...(saving === undefined ? {} : { saving }) }];
}

function buildOffers(
  webshop: RabattaWebshop,
  config: NorwegianShopConfig,
  generatedAt: string,
): CashbackOffer[] {
  const domains = merchantDomainsFromHostname(webshop.domain);
  if (domains.length === 0) return [];

  const sourceUrl = `https://rabatta.app/no/shops/${config.slug}`;
  const activationUrl = buildMerchantUrl(webshop.domain, webshop.identifiers);
  const seenCodes = new Set<string>();

  return webshop.coupons.flatMap((coupon): CashbackOffer[] => {
    const normalizedCode = coupon.code.toUpperCase();
    if (seenCodes.has(normalizedCode)) return [];
    seenCodes.add(normalizedCode);

    const reward = coupon.saving === undefined
      ? "Rabattkode"
      : formatPercentage(coupon.saving);
    const terms = coupon.saving === undefined
      ? "Rabattsatsen og utløpsdatoen er ikke oppgitt. Sjekk vilkårene i kassen."
      : `Oppgitt rabatt: ${reward}. Utløpsdato er ikke oppgitt.`;

    return [{
      provider: "rabattkode",
      merchantName: config.displayName,
      domains,
      reward,
      sourceUrl,
      activationUrl,
      terms,
      discountCode: coupon.code,
      updatedAt: generatedAt,
    }];
  });
}

function buildMerchantUrl(domain: string, identifiers: string[]): string {
  const norwayIdentifier = identifiers.find(isNorwayIdentifier)?.trim();
  if (norwayIdentifier === undefined || norwayIdentifier.length === 0) {
    return `https://${domain}`;
  }
  if (norwayIdentifier.startsWith("/")) {
    return `https://${domain}${norwayIdentifier}`;
  }
  if (norwayIdentifier.endsWith(".")) {
    return `https://${norwayIdentifier}${domain}`;
  }
  return `https://${domain}`;
}

function isNorwayIdentifier(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "no." ||
    normalized === "/no" ||
    normalized === "/no-no" ||
    normalized.startsWith("/no/")
  );
}

function isReusableDiscountCode(code: string): boolean {
  if (code.length < 3 || code.length > 80 || /\s/.test(code)) return false;
  if (/[.…*]{2,}/.test(code)) return false;
  return !/^(?:uniquecodes?|unique|personlig|rabattkode)$/i.test(code);
}

function formatPercentage(value: number): string {
  return `${new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 2,
  }).format(value)} %`;
}

function formatMerchantName(slug: string): string {
  return slug.length === 0
    ? slug
    : `${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, {
    headers: { Accept: "text/html,application/xml,text/plain,*/*" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= JSON_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} for ${url}`);
      }
      if (response.status === 204) return NO_CONTENT_RESPONSE;

      const responseText = await response.text();
      return JSON.parse(responseText) as unknown;
    } catch (error) {
      lastError = error;
      if (attempt < JSON_REQUEST_ATTEMPTS) {
        await delay(attempt * 250);
      }
    }
  }

  throw lastError;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(values.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values[index];
        if (value !== undefined) results[index] = await mapper(value);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
