// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { Configuration, HttpCrawler, MemoryStorage, Request } from "crawlee";
import { normalizeDomainInput, parseUrl, type CashbackOffer } from "../../shared/cashback.js";
import { type DomainLookup, lookupDomains } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import { SPENN_EXTENSION_TERMS, SPENN_EXTENSION_URL } from "../../shared/provider-data.js";

/**
 * Primary source: the public store catalogue that Spenn's own browser extension
 * ("Tjen Spenn på nett") downloads. status.json names the current catalogue and
 * its SHA-256; catalog.nb.json holds every Norwegian refunder store with a
 * structured rate, terms, activation link and the hosts the extension matches
 * The catalogue's content_hash must match status.json, as the extension checks
 * (verified 2026-11-05: 191 stores, Nordnet among them, which Contentful lacks).
 */
const CATALOG_BASE_URL = "https://spenn-cdn.refunder.com/extension/v1/no";
const CATALOG_LOCALE = "nb";

/**
 * Refunder store purchases only count with the shopper's personal SpennID. The
 * click link without it shows "Vi finner ingen SpennID" (verified 2026-11-05),
 * and the ID is only passed on by Spenn's own extension or app. These offers
 * therefore link to Spenn's official extension page (Chrome, Firefox, Edge),
 * the catalogue's links.plugin, without any user ID or campaign parameters.
 */

const CONTENTFUL_URL =
  "https://graphql.eu.contentful.com/content/v1/spaces/eu01y9qnrf4v/environments/master";
const CONTENTFUL_TOKEN = "7M6TKX9Vk0uQzCh16pbokiOlJztMRtJ_EvQPOrPVu4I";
const CONTENTFUL_PAGE_SIZE = 100;

/** Norway site ID in refunder tracking links */
const NORWAY_SITE_ID = "4aefb3fa-6549-11ef-be75-0aaed722973b";

/**
 * Refunder pages only refine rates that Contentful also describes. When the
 * pages keep failing (a slow or blocking server once held the crawl for 24
 * minutes), stop and use the Contentful descriptions for the rest.
 */
const MAX_REFUNDER_FAILURES = 10;

/**
 * Highest percentage rate we trust from the source. Merchants paying a fixed
 * fee per new customer sometimes show up as a per-10-kr rate anyway — Wolt is
 * listed at "37,9 Spenn per 10 kr" (= 37,9 %) while the real deal is a one-off
 * bonus of about a hundred kroner. The highest genuine rate seen is 12 %, so
 * anything above this ceiling is dropped rather than shown as cashback.
 */
const MAX_PLAUSIBLE_PERCENT = 20;

const OFFERS_QUERY = `
  query ($limit: Int!, $skip: Int!, $now: DateTime!) {
    offerCollection(
      limit: $limit
      skip: $skip
      locale: "nb-NO"
      where: { expiresOn_gt: $now, startsOn_lte: $now }
    ) {
      total
      items {
        title
        longDescription
        merchant(where: { sys: { publishedVersion_exists: true } }) {
          name
        }
        externalTarget {
          link
        }
      }
    }
  }
`;

type SpennOfferItem = {
  title: string;
  longDescription: string | null;
  merchant: { name: string } | null;
  externalTarget: { link: string } | null;
};

type ContentfulResponse = {
  data?: { offerCollection?: { items: SpennOfferItem[] } };
  errors?: { message?: string }[];
};

type RefunderStore = { merchantName: string; link: string; desc: string };

type SpennCatalogRate = {
  value: number;
  unit: string | null;
  fixed: boolean;
  up_to: boolean;
  condition: string | null;
};
type SpennCatalogMatchRule = { host: string; include_subdomains: boolean; path: string; query: Record<string, unknown> };
export type SpennCatalogStore = {
  id: string;
  name: string;
  terms: string;
  spenn: string;
  rate: SpennCatalogRate;
  match_rules: SpennCatalogMatchRule[];
  activation_url: string;
};
/**
 * Brands where Spenn is not earned through the extension: "app" brands
 * (OneCall, BookBeat, Fortum …) must be started from the Spenn app, "card"
 * brands (Norwegian, Strawberry, Widerøe) through a linked loyalty programme.
 * Same wording as Spenn's own extension (directAppText/directCardText).
 */
export type SpennDirectBrand = {
  name: string;
  kind: "app" | "card";
  programme: string | null;
  app_url: string | null;
  match_rules: SpennCatalogMatchRule[];
};
export type SpennCatalog = { market: string; locale: string; generated_at: string; stores: SpennCatalogStore[]; direct_brands: SpennDirectBrand[] };

export type SpennSource = {
  /** The extension catalogue; undefined when it could not be fetched or validated. */
  catalog?: SpennCatalog;
  /** Contentful offers: direct (non-refunder) offers, and the refunder stores when the catalogue is missing. */
  items: SpennOfferItem[];
  /** Rates from refunder landing pages, keyed by link. */
  refunderRates: Map<string, ParsedRate>;
};

export type FetchSpennSourceInput = {
  logger: Logger;
  catalogBaseUrl?: string;
  contentfulUrl?: string;
  navigationTimeoutSecs?: number;
  maxRefunderFailures?: number;
};

/**
 * Fetches the extension catalogue, the Contentful offers and refunder landing
 * pages. The catalogue is the store list; Contentful adds direct (non-refunder)
 * offers and is the backup for the store list. Refunder pages give the
 * category breakdown behind an "opp til" rate (the catalogue only has the
 * maximum), or every rate when the catalogue is unavailable. No domain lookup
 * is needed here, so the crawl runs this alongside the other providers and maps
 * the result with {@link buildSpennOffers} once the full lookup exists.
 */
export async function fetchSpennSource(input: FetchSpennSourceInput): Promise<SpennSource> {
  const { logger } = input;
  const catalogBaseUrl = (input.catalogBaseUrl ?? CATALOG_BASE_URL).replace(/\/$/, "");
  const contentfulUrl = input.contentfulUrl ?? CONTENTFUL_URL;
  const maxRefunderFailures = input.maxRefunderFailures ?? MAX_REFUNDER_FAILURES;
  const now = new Date().toISOString();
  const items: SpennOfferItem[] = [];
  const refunderRates = new Map<string, ParsedRate>();
  let catalog: SpennCatalog | undefined;
  let catalogFailure: string | undefined;
  let catalogDone = false;
  let contentfulDone = false;
  let contentfulFailure: string | undefined;
  let refunderLinks: string[] = [];
  let refunderFailures = 0;

  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  // Refunder pages are requested once both the catalogue and Contentful are
  // settled, since either may supply the store list.
  const queueRefunderPages = async () => {
    if (!catalogDone || !contentfulDone) return;
    refunderLinks = catalog !== undefined
      ? catalog.stores.filter((store) => !store.rate.fixed && store.rate.up_to).map(refunderLinkForStore).filter((link): link is string => link !== undefined)
      : [...groupRefunderStores(items).values()].map((store) => store.link);
    await crawler.addRequests(refunderLinks.map((link) => new Request({
      url: link,
      label: "refunder",
      userData: { link },
      headers: { "Accept-Language": "nb-NO,nb" },
    })));
  };
  const crawler = new HttpCrawler({
    maxConcurrency: 5,
    maxRequestRetries: 2,
    navigationTimeoutSecs: input.navigationTimeoutSecs ?? 15,
    requestHandlerTimeoutSecs: 30,
    useSessionPool: false,
    ignoreSslErrors: false,
    additionalMimeTypes: ["application/json"],
    preNavigationHooks: [(_context, gotOptions) => {
      gotOptions.followRedirect = false;
    }],
    requestHandler: async ({ body, request, response }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        // Redirects and client errors do not change on a retry.
        if (status !== 429) request.noRetry = true;
        throw new Error(`HTTP ${status}`);
      }
      const text = Buffer.isBuffer(body) ? body.toString("utf8") : body;
      if (request.label === "refunder") {
        const parsed = parseRefunderPage(text);
        if (parsed) refunderRates.set(String(request.userData.link), parsed);
        return;
      }
      if (request.label === "catalog-status") {
        const hash = readCatalogHash(JSON.parse(text));
        await crawler.addRequests([new Request({
          url: `${catalogBaseUrl}/catalog.${CATALOG_LOCALE}.json`,
          label: "catalog",
          userData: { hash },
          headers: { Accept: "application/json" },
        })]);
        return;
      }
      if (request.label === "catalog") {
        // Like the extension: the catalogue's content_hash must be the one status.json names.
        const value: unknown = JSON.parse(text);
        const contentHash = isObject(value) ? value.content_hash : undefined;
        if (contentHash !== request.userData.hash) {
          request.noRetry = true;
          throw new Error(`content_hash ${String(contentHash)} does not match status.json (${String(request.userData.hash)})`);
        }
        catalog = parseSpennCatalog(value);
        catalogDone = true;
        await queueRefunderPages();
        return;
      }

      const json = JSON.parse(text) as ContentfulResponse;
      const pageItems = json.data?.offerCollection?.items;
      if (pageItems === undefined) {
        const errors = json.errors?.map((error) => error.message).join("; ");
        throw new Error(`no offerCollection in response${errors ? ` (${errors})` : ""}`);
      }
      items.push(...pageItems);
      if (pageItems.length === CONTENTFUL_PAGE_SIZE) {
        await crawler.addRequests([contentfulRequest(contentfulUrl, Number(request.userData.skip) + CONTENTFUL_PAGE_SIZE, now)]);
        return;
      }
      contentfulDone = true;
      await queueRefunderPages();
    },
    failedRequestHandler: async ({ request }, error) => {
      const reason = error.message.slice(0, 300);
      if (request.label === "catalog-status" || request.label === "catalog") {
        catalogFailure = `extension catalogue ${request.url} failed (${reason})`;
        logger.warn(`Spenn: ${catalogFailure}; using Contentful and refunder pages for the store list`);
        catalogDone = true;
        await queueRefunderPages();
        return;
      }
      if (request.label !== "refunder") {
        contentfulFailure = `Contentful offers request (skip ${String(request.userData.skip)}) to ${request.url} failed after retries (${reason})`;
        logger.warn(`Spenn: ${contentfulFailure}`);
        contentfulDone = true;
        await queueRefunderPages();
        return;
      }
      refunderFailures++;
      logger.warn(`Spenn: refunder page ${request.url} failed after retries (${reason})`);
      if (refunderFailures === maxRefunderFailures) {
        logger.warn(`Spenn: stopping refunder pages after ${refunderFailures} failures; using the catalogue/Contentful rates for the remaining stores`);
        crawler.stop();
      }
    },
  }, config);

  await crawler.run([
    new Request({ url: `${catalogBaseUrl}/status.json`, label: "catalog-status", headers: { Accept: "application/json" } }),
    contentfulRequest(contentfulUrl, 0, now),
  ]);
  if (catalog === undefined && contentfulFailure !== undefined) {
    throw new Error(`Spenn: ${catalogFailure ?? "extension catalogue did not complete"}; ${contentfulFailure}`);
  }
  if (catalog === undefined && !contentfulDone) {
    throw new Error(`Spenn: ${catalogFailure ?? "extension catalogue did not complete"}; Contentful offers did not complete`);
  }
  if (catalog !== undefined) logger.info(`Spenn: ${catalog.stores.length} stores in the extension catalogue (${catalog.generated_at})`);
  logger.info(`Spenn: fetched ${items.length} active offers from Contentful`);
  logger.info(`Spenn: fetched rates from ${refunderRates.size}/${refunderLinks.length} refunder pages`);
  return { ...(catalog !== undefined ? { catalog } : {}), items, refunderRates };
}

function readCatalogHash(value: unknown): string {
  const files = isObject(value) && value.market === "NO" && isObject(value.files) ? value.files : undefined;
  const locale = files !== undefined && isObject(files[CATALOG_LOCALE]) ? files[CATALOG_LOCALE] : undefined;
  const hash = locale?.catalog;
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`status.json has no ${CATALOG_LOCALE} catalogue hash for market NO`);
  }
  return hash;
}

/** Validates the catalogue shape; a changed format must fail loudly rather than drop stores silently. */
export function parseSpennCatalog(value: unknown): SpennCatalog {
  if (!isObject(value) || value.market !== "NO" || value.locale !== CATALOG_LOCALE || typeof value.generated_at !== "string" || !Array.isArray(value.stores)) {
    throw new Error("unexpected catalogue format (market/locale/generated_at/stores)");
  }
  const stores = value.stores.filter(isCatalogStore);
  if (stores.length !== value.stores.length) {
    throw new Error(`unexpected catalogue format: ${value.stores.length - stores.length} of ${value.stores.length} stores lack name, rate, match rules or activation link`);
  }
  // Direct brands only add instructions and hosts; a changed entry is skipped, not fatal.
  const directBrands = Array.isArray(value.direct_brands) ? value.direct_brands.filter(isDirectBrand) : [];
  return { market: value.market, locale: value.locale, generated_at: value.generated_at, stores, direct_brands: directBrands };
}

function isDirectBrand(value: unknown): value is SpennDirectBrand {
  return isObject(value) && typeof value.name === "string" && value.name.trim() !== "" &&
    (value.kind === "app" || value.kind === "card") &&
    (value.programme === null || value.programme === undefined || typeof value.programme === "string") &&
    (value.app_url === null || value.app_url === undefined || typeof value.app_url === "string") &&
    Array.isArray(value.match_rules) && value.match_rules.every((rule) => isObject(rule) && typeof rule.host === "string" && typeof rule.path === "string");
}

function hostWideDomains(rules: SpennCatalogMatchRule[]): string[] {
  return [...new Set(rules
    .filter((rule) => rule.path === "" && Object.keys(rule.query ?? {}).length === 0)
    .map((rule) => normalizeDomainInput(rule.host))
    .filter((domain) => domain !== ""))];
}

function directBrandTerms(brand: SpennDirectBrand): string {
  return brand.kind === "app"
    ? "Opptjeningen skjer ikke gjennom nettleserutvidelsen. Start kjøpet fra Spenn-appen."
    : `Her tjener du ikke Spenn via nettleserutvidelsen. Logg inn som ${brand.programme ?? brand.name}-medlem for å tjene Spenn.`;
}

function isCatalogStore(value: unknown): value is SpennCatalogStore {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.name !== "string" || value.name.trim() === "" ||
    typeof value.activation_url !== "string" || !Array.isArray(value.match_rules) || !isObject(value.rate)) return false;
  const rate = value.rate;
  return typeof rate.value === "number" && Number.isFinite(rate.value) && rate.value > 0 &&
    typeof rate.fixed === "boolean" && typeof rate.up_to === "boolean" &&
    (rate.fixed || rate.unit === "per 10 kr") &&
    (rate.condition === null || typeof rate.condition === "string") &&
    (value.terms === undefined || value.terms === null || typeof value.terms === "string") &&
    value.match_rules.every((rule) => isObject(rule) && typeof rule.host === "string" && typeof rule.path === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The plain click link (as in Contentful), without the extension's source/spennId parameters. */
function refunderLinkForStore(store: SpennCatalogStore): string | undefined {
  const parsed = parseUrl(store.activation_url);
  const site = parsed?.searchParams.get("site");
  const storeId = parsed?.searchParams.get("store");
  if (parsed === undefined || site !== NORWAY_SITE_ID || storeId === null || storeId === undefined) return undefined;
  return `${parsed.origin}${parsed.pathname}?site=${site}&store=${storeId}`;
}

function contentfulRequest(url: string, skip: number, now: string): Request {
  return new Request({
    url,
    uniqueKey: `POST:${url}:${skip}`,
    method: "POST",
    label: "contentful",
    userData: { skip },
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${CONTENTFUL_TOKEN}`,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify({
      query: OFFERS_QUERY,
      variables: { limit: CONTENTFUL_PAGE_SIZE, skip, now },
    }),
  });
}

/** Norwegian refunder offers by store UUID (one link per store is enough). */
function groupRefunderStores(items: SpennOfferItem[]): Map<string, RefunderStore> {
  const storeMap = new Map<string, RefunderStore>();

  for (const item of items) {
    const name = item.merchant?.name;
    if (!name) continue;

    const link = item.externalTarget?.link ?? "";
    if (!link.includes("refunder.com") || !link.includes(NORWAY_SITE_ID))
      continue;

    const storeMatch = link.match(/store=([a-f0-9-]+)/);
    if (!storeMatch) continue;

    const storeId = storeMatch[1]!;
    if (!storeMap.has(storeId)) {
      storeMap.set(storeId, { merchantName: name, link, desc: item.longDescription ?? "" });
    }
  }

  return storeMap;
}

export function buildSpennOffers(options: {
  source: SpennSource;
  generatedAt: string;
  logger: Logger;
  domainLookup: DomainLookup;
}): CashbackOffer[] {
  const { source, generatedAt, logger, domainLookup } = options;
  const allItems = source.items;
  const storeMap = source.catalog === undefined ? groupRefunderStores(allItems) : new Map<string, RefunderStore>();
  const refunderRates = source.refunderRates;

  // Pick best rate per merchant (highest max)
  const best = new Map<string, { rate: string; maxVal: number; link: string; terms: string; domains?: string[] }>();

  for (const store of source.catalog?.stores ?? []) {
    const merchantName = store.name.trim();
    const link = refunderLinkForStore(store) ?? cleanTemplateLink(store.activation_url);
    const parsed = parseCatalogRate(store, refunderRates.get(link));
    if (isImplausiblePercent(parsed)) {
      logger.warn(
        `Spenn: skipping ${merchantName}, implausible rate ${parsed.rate}` +
          " (likely a fixed fee expressed per 10 kr)",
      );
      continue;
    }
    // Path-limited rules (lindex.com/no) would match the whole host; the
    // extension's host-wide rules are the verified domains.
    const domains = hostWideDomains(store.match_rules);
    const existing = best.get(merchantName);
    if (!existing || parsed.maxVal > existing.maxVal) {
      best.set(merchantName, { rate: parsed.rate, maxVal: parsed.maxVal, link, terms: parsed.terms, domains });
    }
  }

  for (const [, { merchantName, link, desc }] of storeMap) {
    // Prefer refunder page rate; fall back to Contentful description
    const parsed = refunderRates.get(link) ?? parseSpennRate(desc);
    if (!parsed) continue;
    if (isImplausiblePercent(parsed)) {
      logger.warn(
        `Spenn: skipping ${merchantName}, implausible rate ${parsed.rate}` +
          " (likely a fixed fee expressed per 10 kr)",
      );
      continue;
    }

    const existing = best.get(merchantName);
    if (!existing || parsed.maxVal > existing.maxVal) {
      best.set(merchantName, { rate: parsed.rate, maxVal: parsed.maxVal, link, terms: parsed.terms });
    }
  }

  const offers: CashbackOffer[] = [];

  for (const [merchantName, { rate, link, terms, domains: catalogDomains }] of best) {
    const domains = catalogDomains !== undefined && catalogDomains.length > 0
      ? catalogDomains
      : lookupDomains(domainLookup, merchantName);

    offers.push({
      provider: "spenn",
      merchantName,
      domains,
      reward: rate,
      sourceUrl: "https://app.spenngroup.com",
      // The refunder click link (kept as `link` for the rate pages) needs the shopper's SpennID.
      activationUrl: link.includes("refunder.com/click") ? SPENN_EXTENSION_URL : link,
      terms: link.includes("refunder.com/click") ? [terms, SPENN_EXTENSION_TERMS].filter((part) => part !== "").join("\n") : terms,
      updatedAt: generatedAt,
    });
  }

  // Offers that link straight to the merchant instead of via refunder:
  // percentage rates in the description (e.g. BookBeat, Lensway) and fixed
  // sign-up bonuses (e.g. Fortum: "4000 Spenn etter 90 dager"). Only
  // Norwegian-market links are considered — the Contentful space also holds
  // Swedish, Danish and Finnish campaigns.
  type DirectOffer = { parsed: ParsedRate; isPercent: boolean; link: string };
  const directBest = new Map<string, DirectOffer>();

  const catalogNames = new Set([...best.keys()].map(normalizeMerchantName));
  for (const item of allItems) {
    const merchantName = item.merchant?.name?.trim();
    if (!merchantName || merchantName === "Spenn" || catalogNames.has(normalizeMerchantName(merchantName))) continue;

    const link = item.externalTarget?.link ?? "";
    if (link.includes("refunder.com") || !isNorwegianMarketLink(link)) continue;

    const desc = item.longDescription ?? "";
    const percentParsed = parseSpennRate(desc);
    const parsed = percentParsed ?? parseSpennFixedBonus(`${item.title}\n${desc}`);
    if (!parsed) continue;
    if (isImplausiblePercent(parsed)) {
      logger.warn(
        `Spenn: skipping ${merchantName}, implausible rate ${parsed.rate}` +
          " (likely a fixed fee expressed per 10 kr)",
      );
      continue;
    }

    const candidate: DirectOffer = {
      parsed,
      isPercent: percentParsed !== undefined,
      link: cleanTemplateLink(link),
    };
    const existing = directBest.get(merchantName);
    const isBetter = existing === undefined ||
      (candidate.isPercent && !existing.isPercent) ||
      (candidate.isPercent === existing.isPercent && parsed.maxVal > existing.parsed.maxVal);
    if (isBetter) directBest.set(merchantName, candidate);
  }

  const directBrands = new Map((source.catalog?.direct_brands ?? []).map((brand) => [normalizeMerchantName(brand.name), brand]));
  for (const [merchantName, { parsed, link }] of directBest) {
    const brand = directBrands.get(normalizeMerchantName(merchantName));
    const brandDomains = brand !== undefined ? hostWideDomains(brand.match_rules) : [];
    const linkDomain = extractLinkDomain(link);
    // The extension's hosts (norwegian.com) plus the offer's own site (norwegian.no).
    const ownDomains = linkDomain !== undefined && linkDomain !== "app.spenngroup.com" ? [linkDomain] : [];
    const domains = brandDomains.length > 0 || ownDomains.length > 0
      ? [...new Set([...brandDomains, ...ownDomains])]
      : lookupDomains(domainLookup, merchantName);
    // Spenn's app brands must be started in the app; their web landing pages
    // (onecall.no/mobilabonnement/get-spenn) fail without it.
    const activationUrl = brand?.kind === "app" && brand.app_url !== null
      ? brand.app_url
      : link !== "" ? link : "https://app.spenngroup.com";

    offers.push({
      provider: "spenn",
      merchantName,
      domains,
      reward: parsed.rate,
      sourceUrl: "https://app.spenngroup.com",
      activationUrl,
      terms: [parsed.terms, brand !== undefined ? directBrandTerms(brand) : ""].filter((part) => part !== "").join("\n"),
      updatedAt: generatedAt,
    });
  }

  logger.info(`Spenn: ${offers.length} Norwegian cashback offers`);
  return offers;
}

/**
 * Catalogue rate → reward. "X Spenn per 10 kr" is X % (1 Spenn = 10 øre); a
 * fixed value is Spenn, so 1920 Spenn = 192 kr. For "opp til" the catalogue
 * only has the maximum; the refunder page's category breakdown is used when its
 * maximum agrees, otherwise the reward keeps the "opptil" qualifier.
 */
export function parseCatalogRate(store: SpennCatalogStore, breakdown?: ParsedRate): ParsedRate {
  const { value, fixed, up_to: upTo, condition } = store.rate;
  const storeTerms = (store.terms ?? "").trim();
  const join = (...parts: Array<string | undefined>) => parts.filter((part): part is string => part !== undefined && part !== "").join("\n");
  if (fixed) {
    const kr = Math.round(value / 10);
    return {
      rate: upTo ? `opptil ${kr} kr` : `${kr} kr`,
      maxVal: kr,
      terms: join(`${store.spenn.replace(/\s+/g, " ").trim()} (1 Spenn = 10 øre).`, condition ? `Gjelder: ${condition}.` : undefined, storeTerms),
    };
  }
  if (upTo && breakdown !== undefined && breakdown.maxVal === value) {
    return { rate: breakdown.rate, maxVal: value, terms: join(breakdown.terms, storeTerms) };
  }
  return {
    rate: `${upTo ? "opptil " : ""}${fmt(value)} %`,
    maxVal: value,
    terms: join(condition ? `Gjelder: ${condition}.` : undefined, storeTerms),
  };
}

function normalizeMerchantName(name: string): string {
  return name.trim().toLowerCase().replace(/\.no$/, "");
}

/** Fixed bonuses are in kroner, so the ceiling only applies to percentages. */
function isImplausiblePercent(parsed: ParsedRate): boolean {
  return parsed.rate.endsWith("%") && parsed.maxVal > MAX_PLAUSIBLE_PERCENT;
}

function isNorwegianMarketLink(link: string): boolean {
  const parsed = parseUrl(link.replace(/\{[^}]*\}/g, "x"));
  if (parsed === undefined) return false;
  if (parsed.hostname.endsWith(".no")) return true;
  if (/^\/(no|nb)([/?]|$)/.test(parsed.pathname)) return true;
  return parsed.hostname === "app.spenngroup.com";
}

function cleanTemplateLink(link: string): string {
  const cleaned = link.replace(/[?&][^=&]+=\{[^}]*\}/g, "").replace(/\{[^}]*\}/g, "");
  // Removing the first query parameter may leave "&" as the separator
  return !cleaned.includes("?") && cleaned.includes("&")
    ? cleaned.replace("&", "?")
    : cleaned;
}

/**
 * Parses fixed bonuses like "4000 Spenn etter 90 dager" or
 * "Få 2000 Spenn som nytt medlem". 1 Spenn = 10 øre, so 4000 Spenn = 400 kr.
 */
function parseSpennFixedBonus(text: string): ParsedRate | undefined {
  const afterMatch = text.match(/(\d[\d\s.]*)\s*Spenn\s+etter\s+\d+\s*(?:dager|mnd|måneder)/i);
  const welcomeMatch = afterMatch === null
    ? text.match(/(?:få|tjen|motta)\s+(opptil\s+)?(\d[\d\s.]*)\s*Spenn\b/i)
    : null;
  const upTo = welcomeMatch?.[1] !== undefined;
  const rawValue = afterMatch?.[1] ?? welcomeMatch?.[2];
  if (rawValue === undefined) return undefined;

  const spenn = Number.parseInt(rawValue.replace(/[\s.]/g, ""), 10);
  if (!Number.isFinite(spenn) || spenn < 100) return undefined;

  const kr = Math.round(spenn / 10);
  const rate = upTo ? `opptil ${kr} kr` : `${kr} kr`;
  const bonusLines = [...text.matchAll(/^[-*]\s*(.*\bSpenn\b.*)$/gm)]
    .map((m) => (m[1] ?? "").trim())
    .filter((line) => line !== "");
  const terms = bonusLines.length > 0
    ? `1 Spenn = 10 øre.\n${bonusLines.join("\n")}`
    : `${spenn} Spenn (1 Spenn = 10 øre).`;

  return { rate, maxVal: kr, terms };
}

function extractLinkDomain(link: string): string | undefined {
  const parsed = parseUrl(link);
  if (parsed === undefined) return undefined;
  const hostname = normalizeDomainInput(parsed.hostname);
  return hostname !== "" ? hostname : undefined;
}

type ParsedRate = { rate: string; maxVal: number; terms: string };

/**
 * Parse rate from a refunder landing page HTML.
 * Title format: "Tjen [opp til] X,Y Spenn per 10 kr hos MerchantName"
 * Tiered rates appear as <li> elements: "Category: X,Y Spenn per 10 kr"
 * Simple rate in body: "Hos X tjener du Y,Z Spenn per 10 kr."
 */
function parseRefunderPage(html: string): ParsedRate | undefined {
  // Extract category-based rates from <li> elements
  const categoryMatches = [
    ...html.matchAll(/<li[^>]*>([^<]*?:\s*([\d,]+)\s*Spenn per 10 kr[^<]*)<\/li>/g),
  ];
  if (categoryMatches.length > 0) {
    const rows = categoryMatches.map((m) => {
      const full = (m[1] ?? "").replace(/&amp;/g, "&").trim();
      const colonIdx = full.lastIndexOf(":");
      const category = full.slice(0, colonIdx).trim();
      const value = parseFloat((m[2] ?? "0").replace(",", "."));
      return { category, value };
    });
    const values = rows.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const rate =
      min === max ? `${fmt(max)} %` : `${fmt(min)}-${fmt(max)} %`;
    const terms = rows.length > 1
      ? rows
          .filter((r) => r.category)
          .map((r) => `${fmt(r.value)} % – ${r.category}`)
          .join("\n")
      : "";
    return { rate, maxVal: max, terms };
  }

  // Simple rate from body text: "tjener du X,Y Spenn per 10 kr"
  const bodyMatch = html.match(/tjener du ([\d,]+)\s*Spenn per 10 kr/);
  if (bodyMatch) {
    const val = parseFloat((bodyMatch[1] ?? "0").replace(",", "."));
    return { rate: `${fmt(val)} %`, maxVal: val, terms: "" };
  }

  // Fallback: parse from <title> tag
  const titleMatch = html.match(
    /<title>[^<]*?(?:opp til )?([\d,]+)\s*Spenn per 10 kr/,
  );
  if (titleMatch) {
    const val = parseFloat((titleMatch[1] ?? "0").replace(",", "."));
    return { rate: `${fmt(val)} %`, maxVal: val, terms: "" };
  }

  return undefined;
}

/**
 * Parses "X Spenn per 10 kr" from Contentful offer longDescription.
 * Used as fallback when the refunder page can't be fetched.
 * 1 Spenn = 10 øre, so X Spenn per 10 kr = X% cashback.
 */
function parseSpennRate(
  desc: string,
): ParsedRate | undefined {
  // Pattern 1: Markdown table "| Category | X,Y Spenn per 10 kr |"
  const tableMatches = [
    ...desc.matchAll(/\|\s*(.+?)\s*\|\s*([\d,]+)\s*Spenn per 10 kr\.?\s*\|/g),
  ];
  if (tableMatches.length > 0) {
    const rows = tableMatches.map((m) => ({
      category: (m[1] ?? "").replace(/^\|?\s*/, "").trim(),
      value: parseFloat((m[2] ?? "0").replace(",", ".")),
    }));
    const values = rows.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const rate =
      min === max ? `${fmt(max)} %` : `${fmt(min)}-${fmt(max)} %`;
    const terms = rows.length > 1
      ? rows
          .filter((r) => r.category)
          .map((r) => `${fmt(r.value)} % – ${r.category}`)
          .join("\n")
      : "";
    return { rate, maxVal: max, terms };
  }

  // Pattern 2: "**X,Y Spenn per 10 kr**" (bold markdown, single rate)
  const boldMatch = desc.match(
    /\*\*(?:opp til )?([\d,]+)\s*Spenn per 10 kr\*\*/,
  );
  if (boldMatch) {
    const val = parseFloat((boldMatch[1] ?? "0").replace(",", "."));
    return { rate: `${fmt(val)} %`, maxVal: val, terms: "" };
  }

  // Pattern 3: plain "X,Y Spenn per 10 kr" anywhere in the text
  const plainMatch = desc.match(/(?:opp til )?([\d,]+)\s*Spenn per 10 kr/);
  if (plainMatch) {
    const val = parseFloat((plainMatch[1] ?? "0").replace(",", "."));
    return { rate: `${fmt(val)} %`, maxVal: val, terms: "" };
  }

  return undefined;
}

function fmt(n: number): string {
  return n.toString().replace(".", ",");
}
