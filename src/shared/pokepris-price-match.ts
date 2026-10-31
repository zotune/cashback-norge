import { isRecord, parseUrl } from "./cashback.js";
import type { GetPriceMatchForProductMessage, PriceMatchOffer } from "./extension-messages.js";
import { findTypedLdJson, readLdJsonScripts, readNextFlightValues, findStructuredProperty, selectProductLdJson, readStructuredProductCodes } from "./product-data.js";
import { buildProductMatchAnchor, scoreProductCandidateMatch, MIN_PRODUCT_MATCH_SCORE, isSameProductUrl, isValidGtin, readProductCodesFromUrl } from "./product-match.js";
import { readTcgProductKind, readTcgLanguage, normalizeTcgText, normalizeTcgProductTitle, hasTcgSetNameConflict, hasTcgProductVariantConflict } from "./tcg-product-match.js";
import { PROVIDER_NAMES, PROVIDER_TIPS } from "./provider-data.js";
import { isPrisjaktProductForAnyOffer, type JsonRequest } from "./prisjakt-price-match.js";
import { isKlarnaProductForOfferUrls } from "./klarna-price-match.js";
import { isPrisradarProductForOfferUrls } from "./prisradar-price-match.js";
import { isGodprisProductForOfferUrls } from "./godpris-price-match.js";
import { type VerifiedPriceMatchAvailability } from "./price-match-availability.js";
import { readPokeprisOffers, type PokeprisOfferDiagnostic } from "./pokepris-offers.js";
import { findPokeprisCatalogProduct, isFreshPokeprisCatalog, isPokeprisCatalog, POKEPRIS_CATALOG_URL, type PokeprisCatalog } from "./pokepris-catalog.js";

type TextRequest = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<string | undefined>;

const ORIGIN = "https://www.pokepris.no";
const MAX_SCRIPT_REQUESTS = 16;
const MAX_PRODUCT_REQUESTS = 3;
const actionCache = new WeakMap<TextRequest, { expires: number; promise: Promise<string | undefined> }>();
const catalogCache = new WeakMap<TextRequest, { expires: number; promise: Promise<PokeprisCatalog | undefined> }>();

export type PokeprisDiagnostic = PokeprisOfferDiagnostic & { productUrl?: string; productName?: string };
type PokeprisOptions = {
  useSearchApi?: boolean;
  /** Read the daily merchant-URL catalog before searching Pokepris itself. */
  useCatalog?: boolean;
  requestJson?: JsonRequest | undefined;
  onDiagnostic?: (event: PokeprisDiagnostic) => void;
  onVerifiedAvailability?: (data: VerifiedPriceMatchAvailability) => void;
};
// How the product page was found decides which identity checks remain.
type LookupMode = "direct" | "merchant-url" | "search";

export function isPokeprisProductUrl(rawUrl: string | undefined): boolean {
  const url = rawUrl === undefined ? undefined : parseUrl(rawUrl);
  return url !== undefined && (url.hostname === "www.pokepris.no" || url.hostname === "pokepris.no") && /^\/produkt\/\d+\/?$/.test(url.pathname);
}

// Pokepris uses a public Next server action for search and JSON-LD for offers.
// Discover the current getProducts action in the page's own script references;
// action IDs and deploy-hashed filenames must never be pinned. No script executes.
export async function findPokeprisPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestText: TextRequest = fetchText,
  options: PokeprisOptions = {},
): Promise<PriceMatchOffer | undefined> {
  const directUrl = [message.url, message.productUrl].find(isPokeprisProductUrl);
  if (directUrl !== undefined) {
    const url = new URL(directUrl);
    const productUrl = `${ORIGIN}${url.pathname}`;
    const html = await requestText(productUrl);
    return html === undefined ? undefined : readProductPage(html, productUrl, message, "direct", options);
  }
  if (!/pok[eé]mon/i.test(`${message.searchTerm} ${message.productBrand ?? ""} ${message.url}`)) return undefined;
  const catalog = options.useCatalog ? await loadCatalog(requestText, options) : undefined;
  // Pokepris has associated this exact merchant URL with one product. The
  // merchant's own row must still pass the offer validation on the page.
  const listed = catalog === undefined ? undefined : findPokeprisCatalogProduct(catalog, [message.url, message.productUrl]);
  if (listed !== undefined) {
    const productUrl = `${ORIGIN}/produkt/${listed.id}`;
    const html = await requestText(productUrl);
    let identified = false;
    const offer = html === undefined ? undefined : await readProductPage(html, productUrl, message, "merchant-url", {
      ...options, onVerifiedAvailability: (data) => { identified = true; options.onVerifiedAvailability?.(data); },
    });
    // A verified product without stock is an answer. An association the page
    // cannot confirm falls through to the ordinary search and its checks.
    if (offer !== undefined || identified) return offer;
  }
  const kind = readTcgProductKind(message.searchTerm);
  // Individual cards and graded slabs need a separate identity model.
  if (kind === undefined || !message.productPageClue) {
    options.onDiagnostic?.({ reason: "unsupported-product-form" });
    return undefined;
  }
  let products: unknown[] = [];
  if (catalog !== undefined) {
    products = searchCatalog(catalog, message, kind).filter((product) => product.id !== listed?.id);
  } else {
    // The Next search returns HTTP 500 with the extension's transport.
    // Use the public JSON-LD catalog there, keeping the same offer validation.
    const useSearchApi = options.useSearchApi ?? !(typeof location !== "undefined" && location.protocol === "chrome-extension:");
    let apiFailure: unknown;
    if (useSearchApi) {
      try { products = await searchApi(message, requestText); } catch (error) { apiFailure = error; }
    }
    if (products.length === 0) products = await searchStructuredCatalog(message, requestText);
    if (products.length === 0 && apiFailure !== undefined) throw apiFailure;
  }
  const anchor = buildProductMatchAnchor(message);
  const candidates = products.filter(isRecord)
    .filter((product) => /^[1-9]\d*$/.test(String(product.id ?? "")) && typeof product.name === "string")
    .filter((product) => readTcgProductKind(String(product.name)) === kind)
    .map((product) => ({ product, score: scoreProductCandidateMatch(anchor, { title: `Pokémon ${product.name}` }) }))
    .filter(({ score }) => score >= MIN_PRODUCT_MATCH_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PRODUCT_REQUESTS);
  if (candidates.length === 0) options.onDiagnostic?.({ reason: "no-matching-catalog-product" });
  for (const { product } of candidates) {
    const productUrl = `${ORIGIN}/produkt/${encodeURIComponent(String(product.id))}`;
    const html = await requestText(productUrl);
    const offer = html === undefined ? undefined : await readProductPage(html, productUrl, message, "search", options);
    if (offer !== undefined) return offer;
  }
  return undefined;
}

// A missing, invalid or stale catalog only disables the shortcut; the
// lookup continues with Pokepris' own public search.
async function loadCatalog(requestText: TextRequest, options: PokeprisOptions): Promise<PokeprisCatalog | undefined> {
  const cached = catalogCache.get(requestText);
  const promise = cached !== undefined && cached.expires > Date.now() ? cached.promise : (async () => {
    const text = await requestText(POKEPRIS_CATALOG_URL);
    if (text === undefined) throw new Error(`Pokepris catalog: empty response from ${POKEPRIS_CATALOG_URL}`);
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error(`Pokepris catalog: invalid JSON from ${POKEPRIS_CATALOG_URL}`); }
    if (!isPokeprisCatalog(value)) throw new Error(`Pokepris catalog: unexpected format from ${POKEPRIS_CATALOG_URL}`);
    if (!isFreshPokeprisCatalog(value)) throw new Error(`Pokepris catalog: generated ${value.generatedAt} is too old`);
    return value;
  })();
  if (promise !== cached?.promise) catalogCache.set(requestText, { expires: Date.now() + 60 * 60 * 1000, promise });
  try {
    return await promise;
  } catch (error) {
    catalogCache.delete(requestText);
    options.onDiagnostic?.({ reason: `catalog-unavailable: ${error instanceof Error ? error.message : String(error)}` });
    return undefined;
  }
}

function searchCatalog(catalog: PokeprisCatalog, message: GetPriceMatchForProductMessage, kind: string): Array<{ id: number; name: string }> {
  const language = readTcgLanguage(message.productLanguage ?? message.searchTerm)?.code;
  return catalog.products
    .filter((product) => language === undefined || product.language === undefined || product.language === language)
    .filter((product) => readTcgProductKind(product.name) === kind && isNameWithinSearchTerm(product.name, message.searchTerm))
    .map(({ id, name }) => ({ id, name }));
}

// Every word in a catalog name must occur in the shopper's product title.
function isNameWithinSearchTerm(name: string, searchTerm: string): boolean {
  const words = new Set(normalizeTcgProductTitle(buildSearchTerm(searchTerm)).split(" "));
  return normalizeTcgProductTitle(buildSearchTerm(name)).split(" ").every((word) => words.has(word));
}

async function searchApi(message: GetPriceMatchForProductMessage, requestText: TextRequest): Promise<unknown[]> {
  const action = await discoverSearchAction(requestText);
  if (action === undefined) throw new Error("Pokepris: getProducts search action not found on homepage");
  const language = readTcgLanguage(message.productLanguage ?? message.searchTerm);
  let result: string | undefined;
  try {
    result = await requestText(`${ORIGIN}/`, {
      method: "POST",
      headers: { "Next-Action": action, "Content-Type": "text/plain;charset=UTF-8", "Accept": "text/x-component" },
      body: JSON.stringify([{
        search: buildSearchTerm(message.searchTerm), tcg: "pokemon", inStockOnly: true,
        ...(language !== undefined ? { language: language.code } : {}), limit: 12, offset: 0,
      }]),
    });
  } catch (error) {
    actionCache.delete(requestText);
    throw error;
  }
  if (result === undefined) {
    actionCache.delete(requestText);
    throw new Error("Pokepris: empty getProducts response");
  }
  const data = readPokeprisSearchResult(result);
  if (!isRecord(data) || !Array.isArray(data.products)) {
    actionCache.delete(requestText);
    throw new Error("Pokepris: invalid getProducts response");
  }
  return data.products;
}

async function searchStructuredCatalog(message: GetPriceMatchForProductMessage, requestText: TextRequest): Promise<unknown[]> {
  const home = await requestText(`${ORIGIN}/`);
  if (home === undefined) return [];
  const featured = readCatalogProducts(home, message);
  if (featured.length > 0) return featured;
  const taxonomy = findStructuredProperty(readNextFlightValues(home), "seriesWithSets");
  const query = normalizeTcgProductTitle(message.searchTerm);
  const knownSetNames = Array.isArray(taxonomy) ? taxonomy.filter(isRecord).flatMap((series) =>
    Array.isArray(series.sets) ? series.sets.filter(isRecord).map((set) => set.name).filter((name): name is string => typeof name === "string") : []) : [];
  const setNames = knownSetNames.filter((name) => query.includes(normalizeTcgProductTitle(name)))
    .sort((a, b) => query.lastIndexOf(normalizeTcgProductTitle(b)) - query.lastIndexOf(normalizeTcgProductTitle(a)) || b.length - a.length);
  for (const setName of setNames.slice(0, 2)) {
    // The public taxonomy includes Japanese sets omitted from the SEO set directory.
    const path = normalizeTcgText(setName).replace(/ /g, "-");
    const html = await requestText(`${ORIGIN}/sett/${path}`);
    const products = html === undefined ? [] : readCatalogProducts(html, message);
    if (products.length > 0) return products;
  }
  const catalogPath = home.match(/href=["'](\/sett)["']/)?.[1];
  if (catalogPath !== undefined) {
    const catalog = await requestText(`${ORIGIN}${catalogPath}`);
    const setPath = catalog === undefined ? undefined : [...new Set([...catalog.matchAll(/href=["'](\/sett\/[^"'?#]+)["']/g)].map((match) => match[1]!))]
      .filter((path) => query.includes(normalizeTcgProductTitle(decodeURIComponent(path.slice("/sett/".length)))))
      .sort((a, b) => b.length - a.length)[0];
    if (setPath !== undefined) {
      const html = await requestText(`${ORIGIN}${setPath}`);
      const products = html === undefined ? [] : readCatalogProducts(html, message);
      if (products.length > 0) return products;
    }
  }
  const kind = readTcgProductKind(message.searchTerm);
  const category = kind === "booster-box" ? "booster-box" : kind === "booster-pack" ? "booster-pack"
    : kind?.includes("etb") ? "etb" : kind === "bundle" ? "bundle" : kind?.includes("tin") ? "tin" : "collection";
  const categoryPath = `/kategori/${category}`;
  if (!home.includes(`href="${categoryPath}"`) && !home.includes(`href='${categoryPath}'`)) return [];
  const html = await requestText(`${ORIGIN}${categoryPath}`);
  return html === undefined ? [] : readCatalogProducts(html, message);
}

function readCatalogProducts(html: string, message: GetPriceMatchForProductMessage): unknown[] {
  const kind = readTcgProductKind(message.searchTerm);
  return readLdJsonScripts(html).flatMap((entry) => {
    const list = findTypedLdJson(entry, "ItemList");
    return Array.isArray(list?.itemListElement) ? list.itemListElement : [];
  }).filter(isRecord).flatMap((entry) => {
    const item = isRecord(entry.item) ? entry.item : undefined;
    if (typeof item?.name !== "string" || typeof item.url !== "string" || !isPokeprisProductUrl(item.url)) return [];
    if (readTcgProductKind(item.name) !== kind || !isNameWithinSearchTerm(item.name, message.searchTerm)) return [];
    return [{ id: new URL(item.url).pathname.split("/")[2], name: item.name }];
  });
}

async function discoverSearchAction(requestText: TextRequest): Promise<string | undefined> {
  const cached = actionCache.get(requestText);
  if (cached !== undefined && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const html = await requestText(`${ORIGIN}/`);
    if (html === undefined) return undefined;
    const scripts = readPokeprisScriptUrls(html, ORIGIN);
    for (let offset = 0; offset < scripts.length; offset += 4) {
      const sources = await Promise.all(scripts.slice(offset, offset + 4).map((url) => requestText(url)));
      for (const source of sources) {
        const action = source === undefined ? undefined : readPokeprisSearchAction(source);
        if (action !== undefined) return action;
      }
    }
    return undefined;
  })();
  actionCache.set(requestText, { expires: Date.now() + 60 * 60 * 1000, promise });
  try {
    const action = await promise;
    if (action === undefined) actionCache.delete(requestText);
    return action;
  } catch (error) {
    actionCache.delete(requestText);
    throw error;
  }
}

// Same-origin Next chunks only, newest first. The backend catalog uses the same discovery.
export function readPokeprisScriptUrls(html: string, origin: string): string[] {
  return [...new Set([...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1]!, origin))
    .filter((url) => url.origin === origin && url.pathname.startsWith("/_next/static/chunks/"))
    .map((url) => url.href))].reverse().slice(0, MAX_SCRIPT_REQUESTS);
}

export function readPokeprisSearchAction(source: string): string | undefined {
  return source.match(/createServerReference\)\(\s*["']([a-f0-9]{40,})["'][^;]{0,250}?["']getProducts["']/)?.[1];
}

export function readPokeprisSearchResult(text: string): unknown {
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    try {
      const value: unknown = JSON.parse(line.slice(separator + 1));
      if (isRecord(value) && Array.isArray(value.products)) return value;
    } catch { /* Other Next flight rows are not JSON search results. */ }
  }
  return undefined;
}

async function readProductPage(html: string, productUrl: string, message: GetPriceMatchForProductMessage, mode: LookupMode, options: PokeprisOptions): Promise<PriceMatchOffer | undefined> {
  const product = selectProductLdJson(readLdJsonScripts(html));
  if (product === undefined || typeof product.name !== "string") return undefined;
  const brand = isRecord(product.brand) ? product.brand.name : product.brand;
  if (typeof brand !== "string" || !/pok[eé]mon/i.test(brand)) return undefined;
  const name = `Pokémon ${product.name.replace(/^pok[eé]mon\s+/i, "")}`;
  const reject = (reason: string): undefined => {
    options.onDiagnostic?.({ reason, productUrl, productName: name });
    return undefined;
  };
  const kind = readTcgProductKind(name);
  if (kind === undefined || (mode === "search" && readTcgProductKind(message.searchTerm) !== kind)) return undefined;
  // The merchant URL identifies the product; its title may still contradict it.
  if (mode === "merchant-url" && hasTcgProductVariantConflict(message.searchTerm, name)) return reject("product-variant-mismatch");
  const properties = Array.isArray(product.additionalProperty) ? product.additionalProperty.filter(isRecord) : [];
  const setName = properties.find((item) => item.name === "Kortsett")?.value;
  const languageName = properties.find((item) => item.name === "Språk")?.value;
  const language = typeof languageName === "string" ? readTcgLanguage(languageName) : undefined;
  const expectedLanguage = readTcgLanguage(message.productLanguage ?? message.searchTerm);
  if (language === undefined || (expectedLanguage !== undefined && expectedLanguage.code !== language.code)) return reject("language-mismatch");
  if (mode === "search") {
    if (hasTcgSetNameConflict(buildSearchTerm(message.searchTerm), buildSearchTerm(name))) return reject("set-name-mismatch");
    if (typeof setName === "string" && normalizeTcgProductTitle(product.name).includes(normalizeTcgProductTitle(setName)) && !normalizeTcgProductTitle(message.searchTerm).includes(normalizeTcgProductTitle(setName))) return reject("set-name-mismatch");
    const anchorWords = new Set(normalizeTcgProductTitle(buildSearchTerm(message.searchTerm)).split(" "));
    if (!normalizeTcgProductTitle(buildSearchTerm(product.name)).split(" ").every((word) => anchorWords.has(word))) return reject("product-name-mismatch");
    if (scoreProductCandidateMatch(buildProductMatchAnchor(message), { title: name }) < MIN_PRODUCT_MATCH_SCORE) return reject("product-variant-mismatch");
  }
  const aggregate = product.offers;
  const rawOffers = isRecord(aggregate) && Array.isArray(aggregate.offers) ? aggregate.offers : Array.isArray(aggregate) ? aggregate : [];
  const validated = readPokeprisOffers(html, rawOffers, productUrl, name, language.code,
    (event) => options.onDiagnostic?.({ ...event, productUrl, productName: name }));
  if (validated === undefined) return undefined;
  const { offers, identityOffers, preorders } = validated;
  const best = offers[0];
  // Compatible sold-out/preorder rows can prove identity, but conflicting
  // merchant editions cannot prove it or invalidate another source's price.
  const matchedCurrentMerchant = identityOffers.some((offer) => [message.url, message.productUrl].some((url) => isSameProductUrl(url, offer.offerUrl)));
  const currentCodes = new Set((message.codes ?? []).filter(isValidGtin).map((code) => code.padStart(14, "0")));
  const matchedProductCode = [...readStructuredProductCodes(product), ...identityOffers.flatMap((offer) => readProductCodesFromUrl(offer.offerUrl))]
    .some((code) => isValidGtin(code) && currentCodes.has(code.padStart(14, "0")));
  let matchedComparisonProduct = false;
  const currentName = normalizeTcgProductTitle(buildSearchTerm(message.searchTerm));
  const candidateName = normalizeTcgProductTitle(buildSearchTerm(product.name));
  const exactTitle = currentName === candidateName ||
    (!/^(?:booster|elite trainer|bundle|tin)\b/.test(candidateName) && currentName === `mega evolution ${candidateName}`);
  if (mode === "merchant-url" && !matchedCurrentMerchant) return reject("current-merchant-offer-not-verified");
  if (mode === "search" && (expectedLanguage === undefined || !exactTitle) && !matchedCurrentMerchant && !matchedProductCode) {
    matchedComparisonProduct = await isPrisjaktProductForAnyOffer(message.url, identityOffers, options.requestJson) ||
      await isKlarnaProductForOfferUrls(message, identityOffers.map((offer) => offer.offerUrl), options.requestJson) ||
      await isPrisradarProductForOfferUrls(message, identityOffers.map((offer) => offer.offerUrl), options.requestJson) ||
      await isGodprisProductForOfferUrls(message, identityOffers.map((offer) => offer.offerUrl), options.requestJson);
    if (!matchedComparisonProduct) return reject("unverified-product-identity");
  }
  options.onVerifiedAvailability?.({ productName: name, productUrl, preorders });
  if (best === undefined) return reject("no-in-stock-offers");
  return {
    source: "pokepris", sourceName: PROVIDER_NAMES.pokepris!,
    productName: name, productUrl, shopName: best.shopName,
    amount: best.amount, price: best.price, currency: best.currency, offerUrl: best.offerUrl,
    matchedCurrentMerchant,
    matchedExactProduct: mode === "direct" || matchedCurrentMerchant || matchedComparisonProduct || matchedProductCode,
    details: `${language.label}. ${offers.length} tilbud på lager. ${PROVIDER_TIPS.pokepris}`,
    alternatives: offers.slice(0, 8).map(({ offerUrl: _offerUrl, ...offer }) => offer),
  };
}

function buildSearchTerm(text: string): string {
  return text.replace(/pok[eé]mon(?:\s+tcg)?/gi, "")
    .replace(/(?:scarlet\s*[&/]\s*violet|sword\s*[&/]\s*shield|trading card game|\b(?:sv|swsh)\s*\d+(?:[.]\d+)?\b)/gi, "")
    .replace(/\bmega evolution\s+(?!(?:booster|elite trainer|mini tin|tin|build|bundle|collection|premium)\b)/gi, "")
    .replace(/[:–—-]/g, " ").replace(/\betb\b/gi, "Elite Trainer Box")
    .replace(/\b(?:engelsk|english|japansk|japanese|koreansk|korean|kinesisk|chinese)\b/gi, "")
    .replace(/\bbooster display\b/gi, "Booster Box")
    .replace(/\s+/g, " ").trim();
}

async function fetchText(url: string, init?: Parameters<TextRequest>[1]): Promise<string | undefined> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    throw new Error(`Pokepris: ${init?.method ?? "GET"} ${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
