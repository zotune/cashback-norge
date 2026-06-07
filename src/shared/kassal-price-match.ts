import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import {
  buildPackageQuantityLabels,
  isLikelyGroceryPriceMatchContext,
  isSamePackageQuantity,
  readPackageQuantityFromText,
  readPackageQuantityFromValue,
  type ProductPackageQuantity,
} from "./grocery-price-match-utils.js";
import { isLikelySameProductTitle } from "./product-title-match.js";

type TextRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
) => Promise<string | undefined>;

type KassalPrice = {
  shopName: string;
  amount: number;
  currency: string;
  price: string;
  offerUrl?: string;
  productName?: string;
};

const KASSAL_ORIGIN = "https://kassal.app";
const KASSAL_SITEMAP_INDEX_URL = `${KASSAL_ORIGIN}/sitemap-index.xml`;
const MAX_KASSAL_SITEMAPS = 40;
const MAX_KASSAL_PRODUCT_CANDIDATES = 10;

const kassalProductUrlCache = new Map<string, Promise<string[]>>();

export async function findKassalPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestText: TextRequest = fetchText,
): Promise<PriceMatchOffer | undefined> {
  if (!message.productPageClue && message.searchTerm.trim().length < 8) return undefined;
  if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return undefined;
  if (!hasGroceryIdentitySignal(message)) return undefined;

  const directProductUrl = readKassalProductUrl(message.url) ?? readKassalProductUrl(message.productUrl);
  const candidates = directProductUrl !== undefined
    ? [directProductUrl]
    : await findKassalProductUrlCandidates(message, requestText);
  if (candidates.length === 0) return undefined;

  for (const productUrl of candidates) {
    const html = await requestText(productUrl, {
      headers: { "Accept": "text/html,application/xhtml+xml" },
    });
    if (html === undefined) continue;

    const offer = readKassalProductPage(html, productUrl, message);
    if (offer !== undefined) return offer;
  }

  return undefined;
}

function readKassalProductPage(
  html: string,
  productUrl: string,
  message: GetPriceMatchForProductMessage,
): PriceMatchOffer | undefined {
  if (isKassalNotFoundPage(html)) return undefined;

  const product = readKassalProductJsonLd(html);
  if (product === undefined) return undefined;

  const productName = readStringLike(product.name);
  const visiblePrices = readKassalVisiblePrices(html);
  const prices = visiblePrices.length > 0 ? visiblePrices : readKassalJsonLdPrices(product);
  if (productName === undefined || prices.length === 0) return undefined;

  const pageGtin = readLikelyGtin(readStringLike(product.gtin) ?? readStringLike(product.gtin13));
  const pageQuantity = readKassalPackageQuantity(product, productName);
  const matchedByCode = pageGtin !== undefined && getLikelyGtins(message.codes).includes(pageGtin);
  const matchedByQuantity =
    pageQuantity !== undefined &&
    isSamePackageQuantity(getMessagePackageQuantity(message), pageQuantity) &&
    hasRequestedBrandSignal(message, productName, product) &&
    isLikelySameGroceryTitle(message, productName);

  if (!matchedByCode && !matchedByQuantity) return undefined;

  const sortedPrices = [...prices].sort((first, second) => first.amount - second.amount);
  const best = sortedPrices[0];
  if (best === undefined) return undefined;

  return {
    source: "kassal",
    sourceName: "Kassalapp",
    matchedExactProduct: true,
    shopName: best.shopName,
    amount: best.amount,
    currency: best.currency,
    price: best.price,
    productName,
    productUrl,
    ...(best.offerUrl !== undefined ? { offerUrl: best.offerUrl } : {}),
    alternatives: sortedPrices.slice(0, 10).map((price) => ({
      shopName: price.shopName,
      amount: price.amount,
      currency: price.currency,
      price: price.price,
    })),
  };
}

async function findKassalProductUrlCandidates(
  message: GetPriceMatchForProductMessage,
  requestText: TextRequest,
): Promise<string[]> {
  const cacheKey = buildKassalCacheKey(message);
  if (cacheKey === undefined) return [];

  let cached = kassalProductUrlCache.get(cacheKey);
  if (cached === undefined) {
    cached = findKassalProductUrlCandidatesUncached(message, requestText);
    kassalProductUrlCache.set(cacheKey, cached);
  }
  return cached;
}

async function findKassalProductUrlCandidatesUncached(
  message: GetPriceMatchForProductMessage,
  requestText: TextRequest,
): Promise<string[]> {
  const sitemapUrls = await fetchKassalProductSitemapUrls(requestText);
  if (sitemapUrls.length === 0) return [];

  const gtins = getLikelyGtins(message.codes);
  if (gtins.length > 0) {
    const gtinMatches = await findKassalProductUrlMatchesInSitemaps(
      sitemapUrls,
      requestText,
      (xml) => readKassalProductUrlsMatchingGtins(xml, gtins),
    );
    if (gtinMatches.length > 0) return gtinMatches;
  }

  const slugCandidates = buildKassalSlugCandidates(message);
  if (slugCandidates.length === 0) return [];

  return findKassalProductUrlMatchesInSitemaps(
    sitemapUrls,
    requestText,
    (xml) => readKassalProductUrlsMatchingSlugs(xml, slugCandidates),
  );
}

async function fetchKassalProductSitemapUrls(requestText: TextRequest): Promise<string[]> {
  const xml = await requestText(KASSAL_SITEMAP_INDEX_URL, {
    headers: { "Accept": "application/xml,text/xml" },
  });
  if (xml === undefined) return [];

  const urls = [...xml.matchAll(/<loc>\s*([^<]+sitemap-products-\d+\.xml)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1] ?? "").trim())
    .filter((url) => url.length > 0);
  return uniqueStrings(urls);
}

async function findKassalProductUrlMatchesInSitemaps(
  sitemapUrls: string[],
  requestText: TextRequest,
  readMatches: (xml: string) => string[],
): Promise<string[]> {
  const matches: string[] = [];

  for (const sitemapUrl of sitemapUrls.slice(0, MAX_KASSAL_SITEMAPS)) {
    const xml = await requestText(sitemapUrl, {
      headers: { "Accept": "application/xml,text/xml" },
    });
    if (xml === undefined) continue;

    for (const productUrl of readMatches(xml)) {
      matches.push(productUrl);
    }
    if (matches.length > 0) return uniqueStrings(matches).slice(0, MAX_KASSAL_PRODUCT_CANDIDATES);
  }

  return uniqueStrings(matches);
}

function readKassalProductUrlsMatchingGtins(xml: string, gtins: string[]): string[] {
  return readKassalProductUrlsFromSitemap(xml).filter((url) => {
    const lowerUrl = url.toLowerCase();
    return gtins.some((gtin) => lowerUrl.includes(gtin));
  });
}

function readKassalProductUrlsMatchingSlugs(xml: string, slugCandidates: string[]): string[] {
  return readKassalProductUrlsFromSitemap(xml).filter((url) => {
    const lowerUrl = url.toLowerCase();
    return slugCandidates.some((slug) => lowerUrl.includes(slug));
  });
}

function readKassalProductUrlsFromSitemap(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>\s*(https:\/\/kassal\.app\/vare\/[^<]+)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1] ?? ""));
  return urls;
}

function buildKassalSlugCandidates(message: GetPriceMatchForProductMessage): string[] {
  const quantityLabels = buildPackageQuantityLabels(getMessagePackageQuantity(message));
  const brand = message.productBrand;
  const titles = uniqueStrings([
    message.searchTerm,
    ...(message.productTitleCandidates ?? []),
  ]).map(cleanGroceryTitleCandidate);
  const slugs: string[] = [];

  for (const title of titles) {
    if (title.length < 3) continue;
    const titleWithoutBrand = brand !== undefined ? removeTokenPhrase(title, brand) : title;
    const titleWithoutQuantity = removePackageLabels(titleWithoutBrand, quantityLabels);
    if (!hasMeaningfulProductTerm(titleWithoutQuantity)) continue;

    slugs.push(slugifyKassalTitle(title));
    for (const quantityLabel of quantityLabels) {
      slugs.push(slugifyKassalTitle(`${titleWithoutQuantity} ${quantityLabel}`));
      if (brand !== undefined) {
        slugs.push(slugifyKassalTitle(`${titleWithoutQuantity} ${quantityLabel} ${brand}`));
        slugs.push(slugifyKassalTitle(`${brand} ${titleWithoutQuantity} ${quantityLabel}`));
      }
    }
  }

  return uniqueStrings(slugs)
    .filter((slug) => slug.length >= 4)
    .slice(0, 12);
}

function buildKassalCacheKey(message: GetPriceMatchForProductMessage): string | undefined {
  const gtins = getLikelyGtins(message.codes);
  if (gtins.length > 0) return `gtin:${gtins.join(",")}`;

  const slugs = buildKassalSlugCandidates(message);
  return slugs.length > 0 ? `slug:${slugs.join(",")}` : undefined;
}

function readKassalProductJsonLd(html: string): Record<string, unknown> | undefined {
  for (const rawJson of readJsonLdScriptContents(html)) {
    let value: unknown;
    try {
      value = JSON.parse(rawJson);
    } catch {
      continue;
    }

    const product = findTypedJsonLd(value, "Product");
    if (product !== undefined) return product;
  }
  return undefined;
}

function readJsonLdScriptContents(html: string): string[] {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeHtml(match[1] ?? "").trim())
    .filter((value) => value.length > 0);
}

function findTypedJsonLd(value: unknown, type: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTypedJsonLd(item, type);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  if (!isPlainRecord(value)) return undefined;
  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findTypedJsonLd(item, type);
      if (found !== undefined) return found;
    }
  }

  const rawType = value["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((item) => item === type) ? value : undefined;
}

function readKassalVisiblePrices(html: string): KassalPrice[] {
  return [...html.matchAll(/<a\b(?=[^>]*wire:key=["']price-product-[^"']+["'])[\s\S]*?<\/a>/gi)]
    .map((match) => readKassalVisiblePriceRow(match[0]))
    .filter((price): price is KassalPrice => price !== undefined);
}

function readKassalVisiblePriceRow(rowHtml: string): KassalPrice | undefined {
  const offerUrl = readHtmlAttribute(rowHtml, "href");
  const shopName = readHtmlAttribute(rowHtml.match(/<img\b[\s\S]*?>/i)?.[0] ?? "", "alt");
  const titleHtml = rowHtml.match(/<p\b[^>]*class=["'][^"']*text-sm[^"']*font-medium[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const productName = titleHtml !== undefined ? decodeHtml(stripHtml(titleHtml)).trim() : undefined;
  const amount = readNumberLike(rowHtml.match(/<span\b[^>]*class=["'][^"']*text-(?:green|rose)-600[^"']*["'][^>]*>\s*kr\s*([\d\s.,]+)/i)?.[1]);
  if (shopName === undefined || amount === undefined || amount <= 0) return undefined;

  return {
    shopName,
    amount,
    currency: "NOK",
    price: formatNokPrice(amount),
    ...(offerUrl !== undefined ? { offerUrl: decodeHtml(offerUrl) } : {}),
    ...(productName !== undefined ? { productName } : {}),
  };
}

function readKassalJsonLdPrices(product: Record<string, unknown>): KassalPrice[] {
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  return offers
    .map((offer) => {
      if (!isPlainRecord(offer)) return undefined;
      const seller = isPlainRecord(offer.seller) ? offer.seller : undefined;
      const shopName = readStringLike(seller?.name);
      const amount = readNumberLike(offer.price);
      const currency = readStringLike(offer.priceCurrency) ?? "NOK";
      if (shopName === undefined || amount === undefined || amount <= 0 || currency !== "NOK") return undefined;
      const offerUrl = readStringLike(offer.url);
      return {
        shopName,
        amount,
        currency,
        price: formatNokPrice(amount),
        ...(offerUrl !== undefined ? { offerUrl } : {}),
      };
    })
    .filter((price): price is KassalPrice => price !== undefined);
}

function readKassalPackageQuantity(
  product: Record<string, unknown>,
  productName: string,
): ProductPackageQuantity | undefined {
  return readPackageQuantityFromValue(product.weight) ??
    readPackageQuantityFromValue(product.size) ??
    readPackageQuantityFromText(productName);
}

function readKassalProductUrl(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "kassal.app" && /^\/vare\/[^/]+\/?$/i.test(url.pathname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isKassalNotFoundPage(html: string): boolean {
  return /<title>\s*404/i.test(html) || /<h1[^>]*>\s*404/i.test(html);
}

function hasGroceryIdentitySignal(message: GetPriceMatchForProductMessage): boolean {
  return getLikelyGtins(message.codes).length > 0 || getMessagePackageQuantity(message) !== undefined;
}

function isLikelySameGroceryTitle(message: GetPriceMatchForProductMessage, title: string): boolean {
  return uniqueStrings([message.searchTerm, ...(message.productTitleCandidates ?? [])])
    .some((candidate) => isLikelySameProductTitle(cleanGroceryTitleCandidate(candidate), title, 0.4));
}

function hasRequestedBrandSignal(
  message: GetPriceMatchForProductMessage,
  productName: string,
  product: Record<string, unknown>,
): boolean {
  if (message.productBrand === undefined) return true;
  const brand = normalizeBrandText(message.productBrand);
  if (brand.length < 3) return true;

  const productBrand = isPlainRecord(product.brand)
    ? readStringLike(product.brand.name)
    : readStringLike(product.brand);
  return normalizeBrandText(`${productBrand ?? ""} ${productName}`).includes(brand);
}

function getMessagePackageQuantity(message: GetPriceMatchForProductMessage): ProductPackageQuantity | undefined {
  return message.packageAmount !== undefined && message.packageUnit !== undefined
    ? { amount: message.packageAmount, unit: message.packageUnit }
    : undefined;
}

function cleanGroceryTitleCandidate(value: string): string {
  return value
    .replace(/^(?:kj\u00f8p|kjop|bestill|buy)\s+/i, "")
    .replace(/\s+(?:hos|at)\s+[^|-]+(?:[-|].*)?$/i, "")
    .replace(/\s+[-|]\s+(?:Oda|MENY|SPAR|KIWI|REMA\s*1000|Coop(?:\s+Extra)?)\s*$/i, "")
    .replace(/\s+[-|]\s+\d[\d\s]*(?:,\d{1,2})?\s*kr.*$/i, "")
    .replace(/,\s*fra\s+\d[\d\s]*(?:,\d{1,2})?\s*kr.*$/i, "")
    .replace(/\bfra\s+\d[\d\s]*(?:,\d{1,2})?\s*kr\b.*$/i, "")
    .replace(/[.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePackageLabels(value: string, quantityLabels: string[]): string {
  let cleaned = value;
  for (const label of quantityLabels) {
    const escaped = escapeRegExp(label).replace(/\\ /g, "\\s*");
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function removeTokenPhrase(value: string, phrase: string): string {
  const escaped = escapeRegExp(phrase).replace(/\\ /g, "\\s+");
  return value.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ").replace(/\s+/g, " ").trim();
}

function hasMeaningfulProductTerm(value: string): boolean {
  return transliterateNorwegianCharacters(value)
    .split(/[^A-Za-z0-9]+/)
    .some((token) => /[A-Za-z]/.test(token) && token.length >= 3);
}

function slugifyKassalTitle(value: string): string {
  return transliterateNorwegianCharacters(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchText(url: string, init?: Parameters<TextRequest>[1]): Promise<string | undefined> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) return undefined;
  return response.text();
}

function formatNokPrice(amount: number): string {
  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)} kr`;
}

function readLikelyGtin(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\D/g, "");
  return normalized !== undefined && isLikelyGtin(normalized) ? normalized : undefined;
}

function getLikelyGtins(codes: string[] | undefined): string[] {
  return uniqueStrings((codes ?? [])
    .map((code) => code.replace(/\D/g, ""))
    .filter(isLikelyGtin));
}

function isLikelyGtin(value: string): boolean {
  return /^\d{8,14}$/.test(value);
}

function readStringLike(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readHtmlAttribute(html: string, attributeName: string): string | undefined {
  const match = html.match(new RegExp(`\\b${escapeRegExp(attributeName)}=["']([^"']*)["']`, "i"));
  const value = match?.[1];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function transliterateNorwegianCharacters(value: string): string {
  return value
    .replace(/[\u00C6\u00E6]/g, "ae")
    .replace(/[\u00D8\u00F8]/g, "o")
    .replace(/[\u00C5\u00E5]/g, "a");
}

function normalizeBrandText(value: string): string {
  return transliterateNorwegianCharacters(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
