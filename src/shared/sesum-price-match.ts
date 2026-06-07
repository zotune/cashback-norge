import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import {
  buildPackageQuantityLabels,
  isLikelyGroceryPriceMatchContext,
  isSamePackageQuantity,
  readPackageQuantityFromText,
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

type SesumPrice = {
  shopName: string;
  amount: number;
  currency: string;
  price: string;
};

const SESUM_ORIGIN = "https://www.sesum.no";
const SESUM_PRODUCT_URL = `${SESUM_ORIGIN}/produkt/`;
const MAX_SESUM_CANDIDATES = 10;

export async function findSesumPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestText: TextRequest = fetchText,
): Promise<PriceMatchOffer | undefined> {
  if (!message.productPageClue && message.searchTerm.trim().length < 8) return undefined;
  if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return undefined;
  if (!hasGroceryIdentitySignal(message)) return undefined;

  const directProductUrl = readSesumProductUrl(message.url) ?? readSesumProductUrl(message.productUrl);
  const candidates = directProductUrl !== undefined
    ? [directProductUrl]
    : buildSesumProductUrlCandidates(message);
  if (candidates.length === 0) return undefined;

  for (const productUrl of candidates) {
    const html = await requestText(productUrl, {
      headers: { "Accept": "text/html,application/xhtml+xml" },
    });
    if (html === undefined) continue;

    const offer = readSesumProductPage(html, productUrl, message);
    if (offer !== undefined) return offer;
  }

  return undefined;
}

function readSesumProductPage(
  html: string,
  productUrl: string,
  message: GetPriceMatchForProductMessage,
): PriceMatchOffer | undefined {
  if (isSesumNotFoundPage(html)) return undefined;

  const productName = readSesumProductName(html);
  const prices = readSesumPrices(html);
  if (productName === undefined || prices.length === 0) return undefined;

  const pageGtin = readSesumGtin(html);
  const pageQuantity = readSesumPackageQuantity(html);
  const matchedByCode = pageGtin !== undefined && getLikelyGtins(message.codes).includes(pageGtin);
  const matchedByQuantity =
    pageQuantity !== undefined &&
    isSamePackageQuantity(getMessagePackageQuantity(message), pageQuantity) &&
    hasRequestedBrandSignal(message, productName) &&
    isLikelySameGroceryTitle(message, productName);

  if (!matchedByCode && !matchedByQuantity) return undefined;

  const sortedPrices = [...prices].sort((first, second) => first.amount - second.amount);
  const best = sortedPrices[0];
  if (best === undefined) return undefined;

  return {
    source: "sesum",
    sourceName: "SeSum",
    matchedExactProduct: true,
    shopName: best.shopName,
    amount: best.amount,
    currency: best.currency,
    price: best.price,
    productName,
    productUrl,
    alternatives: sortedPrices.slice(0, 8).map((price) => ({
      shopName: price.shopName,
      amount: price.amount,
      currency: price.currency,
      price: price.price,
    })),
  };
}

function isSesumNotFoundPage(html: string): boolean {
  return /<title>\s*(?:Produkt ikke funnet|404\b|404: This page could not be found)/i.test(html) ||
    /<h1[^>]*>\s*(?:Produkt ikke funnet|404\b)/i.test(html);
}

function hasGroceryIdentitySignal(message: GetPriceMatchForProductMessage): boolean {
  return getLikelyGtins(message.codes).length > 0 || getMessagePackageQuantity(message) !== undefined;
}

function buildSesumProductUrlCandidates(message: GetPriceMatchForProductMessage): string[] {
  const quantityLabels = buildPackageQuantityLabels(getMessagePackageQuantity(message));
  const brand = message.productBrand;
  const titles = uniqueStrings([
    message.searchTerm,
    ...(message.productTitleCandidates ?? []),
  ]).map(cleanGroceryTitleCandidate);
  const slugs: string[] = [];

  for (const title of titles) {
    if (title.length < 3) continue;
    slugs.push(slugifySesumTitle(title));

    const titleWithoutBrand = brand !== undefined ? removeTokenPhrase(title, brand) : title;
    const titleWithoutQuantity = removePackageLabels(titleWithoutBrand, quantityLabels);
    for (const quantityLabel of quantityLabels) {
      slugs.push(slugifySesumTitle(`${titleWithoutQuantity} ${quantityLabel}`));
      if (brand !== undefined) {
        slugs.push(slugifySesumTitle(`${titleWithoutQuantity} ${quantityLabel} ${brand}`));
        slugs.push(slugifySesumTitle(`${brand} ${titleWithoutQuantity} ${quantityLabel}`));
      }
    }
  }

  return uniqueStrings(slugs)
    .filter((slug) => slug.length >= 4)
    .slice(0, MAX_SESUM_CANDIDATES)
    .map((slug) => `${SESUM_PRODUCT_URL}${encodeURIComponent(slug)}`);
}

function cleanGroceryTitleCandidate(value: string): string {
  return value
    .replace(/^(?:kj\u00f8p|kjop|bestill|buy)\s+/i, "")
    .replace(/\s+(?:hos|at)\s+[^|-]+(?:[-|].*)?$/i, "")
    .replace(/\s+[-|]\s+(?:Oda|MENY|KIWI|SPAR|REMA\s*1000|Coop(?:\s+Extra)?)\s*$/i, "")
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

function slugifySesumTitle(value: string): string {
  const normalized = transliterateNorwegianCharacters(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length <= 80 ? normalized : trimSlug(normalized, 80);
}

function trimSlug(slug: string, maxLength: number): string {
  const trimmed = slug.slice(0, maxLength);
  const lastDash = trimmed.lastIndexOf("-");
  return lastDash > 0 ? trimmed.slice(0, lastDash) : trimmed;
}

function readSesumProductUrl(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) return undefined;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "sesum.no" && /^\/produkt\/[^/]+\/?$/i.test(url.pathname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function readSesumProductName(html: string): string | undefined {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const h1Text = h1 !== undefined ? decodeHtml(stripHtml(h1)).trim() : undefined;
  if (h1Text !== undefined && h1Text.length > 0) return h1Text;

  const ogTitle = readMetaContent(html, "og:title");
  const cleanOgTitle = ogTitle?.replace(/,\s*fra\s+.+$/i, "").trim();
  if (cleanOgTitle !== undefined && cleanOgTitle.length > 0) return cleanOgTitle;

  const jsonLdName = readEscapedJsonLdString(html, "name");
  return jsonLdName !== undefined && jsonLdName !== "next-size-adjust" ? jsonLdName : undefined;
}

function readSesumGtin(html: string): string | undefined {
  const jsonLdGtin = readEscapedJsonLdString(html, "gtin13") ?? readEscapedJsonLdString(html, "gtin");
  if (jsonLdGtin !== undefined && isLikelyGtin(jsonLdGtin)) return jsonLdGtin;

  const imageGtin = html.match(/bilder\.ngdata\.no\/(\d{8,14})\//)?.[1];
  return imageGtin !== undefined && isLikelyGtin(imageGtin) ? imageGtin : undefined;
}

function readSesumPackageQuantity(html: string): ProductPackageQuantity | undefined {
  const flightQuantity = html.match(/\\"productWeight\\":(\d+(?:\.\d+)?),\\"productWeightUnit\\":\\"([^"\\]+)\\"/);
  if (flightQuantity?.[1] !== undefined && flightQuantity[2] !== undefined) {
    const quantity = readPackageQuantityFromText(`${flightQuantity[1]} ${flightQuantity[2]}`);
    if (quantity !== undefined) return quantity;
  }

  return readPackageQuantityFromText([
    readMetaContent(html, "og:title"),
    readMetaContent(html, "description"),
    readSesumProductName(html),
  ].filter((value): value is string => value !== undefined).join(" "));
}

function readSesumPrices(html: string): SesumPrice[] {
  const priceTablePrices = readSesumPriceTablePrices(html);
  if (priceTablePrices.length > 0) return priceTablePrices;

  return readSesumJsonLdOfferPrices(html);
}

function readSesumPriceTablePrices(html: string): SesumPrice[] {
  const rawPrices = readNextFlightJsonArray(html, "prices", "productWeight");
  if (!Array.isArray(rawPrices)) return [];

  return rawPrices
    .map((value) => {
      if (!isPlainRecord(value)) return undefined;
      const shopName = readStringLike(value.storeName) ?? readStringLike(value.chain);
      const amount = readNumberLike(value.price);
      if (shopName === undefined || amount === undefined || amount <= 0) return undefined;
      return {
        shopName,
        amount,
        currency: "NOK",
        price: formatNokPrice(amount),
      };
    })
    .filter((price): price is SesumPrice => price !== undefined);
}

function readSesumJsonLdOfferPrices(html: string): SesumPrice[] {
  const offersMatch = html.match(/\\"offers\\":\[(.*?)]},\\"dateModified\\"/);
  const rawOffers = offersMatch?.[1];
  if (rawOffers === undefined) return [];

  const offersJson = `[${unescapeNextFlightString(rawOffers)}]`;
  let offers: unknown;
  try {
    offers = JSON.parse(offersJson);
  } catch {
    return [];
  }

  if (!Array.isArray(offers)) return [];
  return offers
    .map((offer) => {
      if (!isPlainRecord(offer)) return undefined;
      const seller = isPlainRecord(offer.seller) ? offer.seller : undefined;
      const shopName = readStringLike(seller?.name);
      const amount = readNumberLike(offer.price);
      const currency = readStringLike(offer.priceCurrency) ?? "NOK";
      if (shopName === undefined || amount === undefined || amount <= 0 || currency !== "NOK") return undefined;
      return {
        shopName,
        amount,
        currency,
        price: formatNokPrice(amount),
      };
    })
    .filter((price): price is SesumPrice => price !== undefined);
}

function readNextFlightJsonArray(html: string, key: string, followingKey: string): unknown[] | undefined {
  const escapedPattern = new RegExp(`\\\\"${escapeRegExp(key)}\\\\":(\\[[\\s\\S]*?\\]),\\\\"${escapeRegExp(followingKey)}\\\\":`);
  const escapedMatch = html.match(escapedPattern);
  if (escapedMatch?.[1] !== undefined) {
    try {
      const parsed = JSON.parse(unescapeNextFlightString(escapedMatch[1]));
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  const plainPattern = new RegExp(`"${escapeRegExp(key)}":(\\[[\\s\\S]*?\\]),"${escapeRegExp(followingKey)}":`);
  const plainMatch = html.match(plainPattern);
  if (plainMatch?.[1] === undefined) return undefined;
  try {
    const parsed = JSON.parse(plainMatch[1]);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readEscapedJsonLdString(html: string, key: string): string | undefined {
  const escaped = html.match(new RegExp(`\\\\\\\\"${escapeRegExp(key)}\\\\\\\\":\\\\\\\\"([^"\\\\]+)\\\\\\\\"`))?.[1];
  if (escaped !== undefined) return unescapeNextFlightString(escaped);

  const plain = html.match(new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"([^"]+)"`))?.[1];
  return plain !== undefined ? decodeHtml(plain) : undefined;
}

function readMetaContent(html: string, nameOrProperty: string): string | undefined {
  const pattern = new RegExp(`<meta\\s+(?:name|property)=["']${escapeRegExp(nameOrProperty)}["'][^>]*content=["']([^"']*)["']`, "i");
  const alternatePattern = new RegExp(`<meta\\s+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escapeRegExp(nameOrProperty)}["']`, "i");
  const raw = html.match(pattern)?.[1] ?? html.match(alternatePattern)?.[1];
  return raw !== undefined ? decodeHtml(raw).trim() : undefined;
}

function isLikelySameGroceryTitle(message: GetPriceMatchForProductMessage, title: string): boolean {
  return uniqueStrings([message.searchTerm, ...(message.productTitleCandidates ?? [])])
    .some((candidate) => isLikelySameProductTitle(cleanGroceryTitleCandidate(candidate), title, 0.4));
}

function hasRequestedBrandSignal(message: GetPriceMatchForProductMessage, title: string): boolean {
  if (message.productBrand === undefined) return true;
  const brand = normalizeBrandText(message.productBrand);
  if (brand.length < 3) return true;
  return normalizeBrandText(title).includes(brand);
}

function getMessagePackageQuantity(message: GetPriceMatchForProductMessage): ProductPackageQuantity | undefined {
  return message.packageAmount !== undefined && message.packageUnit !== undefined
    ? { amount: message.packageAmount, unit: message.packageUnit }
    : undefined;
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

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
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

function unescapeNextFlightString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value
      .replace(/\\u0026/g, "&")
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
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

function getLikelyGtins(codes: string[] | undefined): string[] {
  return uniqueStrings((codes ?? [])
    .map((code) => code.replace(/\D/g, ""))
    .filter(isLikelyGtin));
}

function isLikelyGtin(value: string): boolean {
  return /^\d{8,14}$/.test(value);
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
